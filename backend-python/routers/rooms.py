import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
import models
import schemas
from datetime import datetime, timezone
from dependencies import get_current_active_user, RequireRole
from models import RoomStatusEnum, RoleEnum
from fastapi import BackgroundTasks
from services.email import send_room_invite_email, send_room_invite_email_with_ics
from services.cache import get_cached, set_cached, invalidate_cache

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])


def generate_invite_code() -> str:
    """Generate unique 8-char invite code."""
    return secrets.token_urlsafe(6)[:8].upper()


async def _get_room_with_permissions(
    room_id: str, db: AsyncSession, current_user: models.User
) -> models.Room:
    """Check permissions and return room."""
    result = await db.execute(
        select(models.Room).where(
            models.Room.id == room_id,
            models.Room.organization_id == current_user.organization_id,
        )
    )
    room = result.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found in your organization")

    if (
        current_user.role not in [RoleEnum.owner, RoleEnum.admin]
        and room.creator_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    return room


# 1. СОЗДАНИЕ КОМНАТЫ
@router.post("", response_model=schemas.RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    request: schemas.CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(
        RequireRole([RoleEnum.owner, RoleEnum.admin, RoleEnum.manager])
    ),
):
    invite_code = generate_invite_code()

    # ========== НОВАЯ ПРОВЕРКА ЛИМИТА КОМНАТ ==========
    # Получаем организацию и её тариф
    org = await db.get(models.Organization, current_user.organization_id)
    if org and org.tier_id:
        tier = await db.get(models.Tier, org.tier_id)
        # Business план имеет безлимит, проверяем только для Light и Pro
        if tier and tier.slug != "business":
            # Начало текущего месяца
            month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Считаем количество комнат, созданных в этом месяце
            room_count = await db.scalar(
                select(func.count()).select_from(models.Room)
                .where(
                    models.Room.organization_id == current_user.organization_id,
                    models.Room.created_at >= month_start,
                )
            )
            
            # Определяем лимит в зависимости от тарифа
            max_rooms = 10 if tier.slug == "light" else 50 if tier.slug == "pro" else None
            
            if max_rooms and room_count >= max_rooms:
                raise HTTPException(
                    status_code=403,
                    detail=f"Monthly room limit reached ({max_rooms}) for {tier.name} plan. You've used {room_count} rooms this month."
                )
    # ========== КОНЕЦ ПРОВЕРКИ ==========
    
    # ========== ПРОВЕРКА ЛИМИТА УЧАСТНИКОВ ПО ТАРИФУ ==========
    max_allowed = None
    if org and org.tier_id:
        tier = await db.get(models.Tier, org.tier_id)
        if tier and request.max_participants:
            # Определяем максимальное кол-во участников по тарифу
            max_allowed = None
            if tier.slug == "light":
                max_allowed = 5
            elif tier.slug == "pro":
                max_allowed = 30
            # business — без ограничений
            
            if max_allowed and request.max_participants > max_allowed:
                raise HTTPException(
                    status_code=403,
                    detail=f"Max participants limit for {tier.name} plan is {max_allowed}. You requested {request.max_participants}."
                )
    # ========== КОНЕЦ ПРОВЕРКИ ==========

    new_room = models.Room(
        organization_id=current_user.organization_id,
        creator_id=current_user.id,
        name=request.name,
        description=request.description,
        invite_code=invite_code,
        status=RoomStatusEnum.scheduled,
        scheduled_start_at=request.scheduled_start_at.replace(tzinfo=None) if request.scheduled_start_at else None,
    )
    db.add(new_room)
    await db.flush()

    db.add(models.Participant(
        room_id=new_room.id,
        user_id=current_user.id,
        role_in_room="organizer",
    ))
    await db.commit()
    await invalidate_cache("rooms_list")
    await db.refresh(new_room)

    return {
        "id": str(new_room.id),
        "name": new_room.name,
        "description": new_room.description,
        "invite_code": new_room.invite_code,
        "invite_link": f"/join/{new_room.invite_code}",
        "status": new_room.status.value,
        "creator_id": str(new_room.creator_id),
        "creator_name": f"{current_user.first_name} {current_user.last_name or ''}".strip(),
        "scheduled_start_at": new_room.scheduled_start_at,
        "participants_count": 1,
        "max_participants": min(request.max_participants, max_allowed) if max_allowed else request.max_participants,
        "created_at": new_room.created_at,
        "updated_at": new_room.updated_at,
    }


# 2. СПИСОК КОМНАТ (с JOIN для имен создателей)
@router.get("", response_model=schemas.RoomsListResponse)
async def get_rooms(
    status_filter: str = Query(None, alias="status"),
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Формируем ключ кэша
    org_id = current_user.organization_id
    cache_key = f"rooms:org_{org_id}:status_{status_filter or 'all'}:limit_{limit}:offset_{offset}"
    
    # Пробуем получить из кэша
    cached_data = await get_cached("rooms_list", cache_key)
    if cached_data:
        print(f"✅ Cache HIT for {cache_key}")
        return cached_data
    
    print(f"❌ Cache MISS for {cache_key}")
    
    query = (
        select(models.Room, models.User.first_name, models.User.last_name)
        .outerjoin(models.User, models.Room.creator_id == models.User.id)
        .where(models.Room.organization_id == current_user.organization_id)
    )

    if status_filter and status_filter not in ("all", "undefined", ""):
        query = query.where(models.Room.status == status_filter)

    query = query.order_by(models.Room.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

    room_ids = [r.id for r, _, _ in rows]
    participants_count_map = {}
    if room_ids:
        count_query = (
            select(
                models.Participant.room_id,
                func.count().label("count")
            )
            .where(models.Participant.room_id.in_(room_ids))
            .group_by(models.Participant.room_id)
        )
        count_result = await db.execute(count_query)
        participants_count_map = {row[0]: row[1] for row in count_result}

    total_result = await db.execute(
        select(func.count()).select_from(models.Room).where(
            models.Room.organization_id == current_user.organization_id
        )
    )
    total = total_result.scalar() or 0

    room_responses = []
    for r, first_name, last_name in rows:
        creator_name = (
            f"{first_name} {last_name or ''}".strip()
            if first_name
            else "Unknown"
        )
        room_responses.append({
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "invite_code": r.invite_code,
            "invite_link": f"/join/{r.invite_code}",
            "status": r.status.value,
            "creator_id": str(r.creator_id),
            "creator_name": creator_name,
            "scheduled_start_at": r.scheduled_start_at,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "duration_seconds": r.duration_seconds,
            "participants_count": participants_count_map.get(r.id, 0),
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        })

    result_data = {
        "success": True,
        "rooms": room_responses,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
    
    # Сохраняем в кэш на 30 секунд
    await set_cached("rooms_list", cache_key, result_data, ttl=30)
    
    return result_data


# 3. ДЕТАЛИ КОМНАТЫ (с JOIN для имени создателя)
@router.get("/{room_id}", response_model=schemas.RoomDetailResponse)
async def get_room_by_id(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(models.Room, models.User.first_name, models.User.last_name)
        .outerjoin(models.User, models.Room.creator_id == models.User.id)
        .where(
            models.Room.id == room_id,
            models.Room.organization_id == current_user.organization_id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Room not found")

    room, first_name, last_name = row
    creator_name = (
        f"{first_name} {last_name or ''}".strip()
        if first_name
        else "Organizer"
    )

        # Получаем ВСЕХ участников (не только активных)
    part_result = await db.execute(
        select(models.Participant).where(
            models.Participant.room_id == room_id,
        )
    )
    all_participants = part_result.scalars().all()

    # Формируем список участников с именами
    participants_list = []
    for p in all_participants:
        user_result = await db.execute(
            select(models.User).where(models.User.id == p.user_id)
        )
        user = user_result.scalars().first()
        participants_list.append({
            "id": str(p.id),
            "user_id": str(p.user_id) if p.user_id else None,
            "name": f"{user.first_name} {user.last_name or ''}".strip() if user else "Unknown",
            "role_in_room": p.role_in_room,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
            "left_at": p.left_at.isoformat() if p.left_at else None,
        })

        # Получаем протоколы комнаты
    protocols_result = await db.execute(
        select(models.Protocol).where(models.Protocol.room_id == room_id).order_by(models.Protocol.created_at.desc())
    )
    protocols = protocols_result.scalars().all()
    protocols_list = []
    for prot in protocols:
        protocols_list.append({
            "id": str(prot.id),
            "room_id": str(prot.room_id),
            "title": prot.title,
            "summary_json": prot.summary_json,
            "content_json": prot.content_json,
            "decisions_json": prot.decisions_json,
            "action_items_json": prot.action_items_json,
            "topics_json": prot.topics_json,
            "created_at": prot.created_at.isoformat() + "Z",
            "updated_at": prot.updated_at.isoformat() + "Z",
        })

    return {
        "success": True,
        "room": {
            "id": str(room.id),
            "name": room.name,
            "description": room.description,
            "invite_code": room.invite_code,
            "invite_link": f"/join/{room.invite_code}",
            "status": room.status.value,
            "creator_id": str(room.creator_id),
            "creator_name": creator_name,
            "scheduled_start_at": room.scheduled_start_at,
            "started_at": room.started_at.isoformat() if room.started_at else None,
            "ended_at": room.ended_at.isoformat() if room.ended_at else None,
            "duration_seconds": room.duration_seconds,
            "participants_count": len([p for p in all_participants if p.left_at is None]),
            "total_participants": len(all_participants),
            "chat_enabled": room.chat_enabled,
            "created_at": room.created_at,
            "updated_at": room.updated_at,
        },
        "participants": participants_list,
        "protocols": protocols_list,
    }

# 4. СПИСОК ПРОТОКОЛОВ КОМНАТЫ
@router.get("/{room_id}/protocols")
async def get_room_protocols(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(models.Protocol).where(models.Protocol.room_id == room_id).order_by(models.Protocol.created_at.desc())
    )
    protocols = result.scalars().all()
    
    protocols_list = []
    for prot in protocols:
        protocols_list.append({
            "id": str(prot.id),
            "room_id": str(prot.room_id),
            "title": prot.title,
            "summary_json": prot.summary_json,
            "content_json": prot.content_json,
            "decisions_json": prot.decisions_json,
            "action_items_json": prot.action_items_json,
            "topics_json": prot.topics_json,
            "created_at": prot.created_at.isoformat() + "Z",
            "updated_at": prot.updated_at.isoformat() + "Z",
        })
        
    return {
        "success": True,
        "protocols": protocols_list,
        "total": len(protocols_list)
    }

# 5. ИСТОРИЯ ЧАТА
@router.get("/{room_id}/messages")
async def get_chat_history(
    room_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    check = await db.execute(
        select(models.Room).where(
            models.Room.id == room_id,
            models.Room.organization_id == current_user.organization_id,
        )
    )
    if not check.scalars().first():
        raise HTTPException(status_code=404, detail="Room not found")

    query = (
        select(models.ChatMessage, models.User.first_name, models.User.last_name)
        .outerjoin(models.User, models.ChatMessage.user_id == models.User.id)
        .where(models.ChatMessage.room_id == room_id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    messages = []
    for msg, first_name, last_name in reversed(rows):
        display_name = (
            f"{first_name} {last_name or ''}".strip()
            if first_name
            else "User"
        )
        messages.append({
            "id": str(msg.id),
            "user_id": str(msg.user_id) if msg.user_id else None,
            "username": display_name,
            "message": msg.message,
            "message_type": "text",
            "created_at": msg.created_at.isoformat() + "Z",
            "reply_to_id": str(msg.reply_to_id) if msg.reply_to_id else None,
        })

    return {"success": True, "messages": messages}


@router.post("/{room_id}/invite")
async def invite_to_room_by_email(
    room_id: str,
    request: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    email = request.get("email")
    if not email: raise HTTPException(status_code=400, detail="Email required")

    # ИСПРАВЛЕНО: Достаем комнату и организацию одним запросом
    result = await db.execute(
        select(models.Room, models.Organization.name)
        .join(models.Organization, models.Room.organization_id == models.Organization.id)
        .where(models.Room.id == room_id)
    )
    row = result.first()
    if not row: raise HTTPException(status_code=404, detail="Room not found")
    
    room, org_name = row
    
    if room.status in [RoomStatusEnum.ended, RoomStatusEnum.archived]:
        raise HTTPException(status_code=400, detail="Cannot invite to ended or archived meetings")
    
    inviter = f"{current_user.first_name} {current_user.last_name or ''}".strip()

    # Передаем org_name последним аргументом
    background_tasks.add_task(
        send_room_invite_email_with_ics if room.scheduled_start_at else send_room_invite_email,
        email, 
        room.name, 
        room.invite_code, 
        inviter,
        org_name,
        room.scheduled_start_at if room.scheduled_start_at else None
    )
    
    return {"success": True, "message": f"Invite sent to {email}"}


@router.post("/{room_id}/invite-all")
async def invite_all_organization(
    room_id: str, 
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(get_current_active_user)
):
    """Разослать приглашение всем сотрудникам организации."""
    # Получаем данные комнаты и организации
    result = await db.execute(
        select(models.Room, models.Organization.name)
        .join(models.Organization, models.Room.organization_id == models.Organization.id)
        .where(models.Room.id == room_id)
    )
    row = result.first()
    if not row: raise HTTPException(status_code=404, detail="Room not found")
    
    room, org_name = row
    
    if room.status in [RoomStatusEnum.ended, RoomStatusEnum.archived]:
        raise HTTPException(status_code=400, detail="Cannot invite to ended or archived meetings")
    

    # Находим всех активных пользователей организации
    users_res = await db.execute(
        select(models.User.email)
        .where(models.User.organization_id == current_user.organization_id, models.User.status == "active")
    )
    emails = users_res.scalars().all()
    inviter = f"{current_user.first_name} {current_user.last_name or ''}".strip()

    # Массовая рассылка в фоне
    for email in emails:
        background_tasks.add_task(send_room_invite_email, email, room.name, room.invite_code, inviter, org_name)

    return {"success": True, "sent_to": len(emails)}

# 5. ОБНОВЛЕНИЕ
@router.put("/{room_id}", response_model=schemas.RoomResponse)
async def update_room(
    room_id: str,
    request: schemas.UpdateRoomRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    room = await _get_room_with_permissions(room_id, db, current_user)
    
    if room.status != RoomStatusEnum.scheduled:
        raise HTTPException(
            status_code=400,
            detail="Only scheduled meetings can be edited"
        )

    if request.name is not None:
        room.name = request.name
    if request.description is not None:
        room.description = request.description
    if request.scheduled_start_at is not None:
        room.scheduled_start_at = request.scheduled_start_at.replace(tzinfo=None) if request.scheduled_start_at else None

    await db.commit()
    await invalidate_cache("rooms_list")
    await db.refresh(room)

    return {
        "id": str(room.id),
        "name": room.name,
        "description": room.description,
        "invite_code": room.invite_code,
        "invite_link": f"/join/{room.invite_code}",
        "status": room.status.value,
        "creator_id": str(room.creator_id),
        "creator_name": "Organizer",
        "scheduled_start_at": room.scheduled_start_at,
        "participants_count": 0,
        "created_at": room.created_at,
        "updated_at": room.updated_at,
    }


# 6. УДАЛЕНИЕ
@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    room = await _get_room_with_permissions(room_id, db, current_user)
    await db.delete(room)
    await db.commit()
    await invalidate_cache("rooms_list")
    return None


# 7. АРХИВАЦИЯ
@router.patch("/{room_id}/archive")
async def archive_room(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    room = await _get_room_with_permissions(room_id, db, current_user)
    if room.status not in [RoomStatusEnum.scheduled, RoomStatusEnum.ended]:
        raise HTTPException(status_code=400, detail="Only scheduled or ended meetings can be archived")
    room.status = RoomStatusEnum.archived
    await db.commit()
    return {"success": True, "message": "Room archived"}


# 8. РЕГЕНЕРАЦИЯ INVITE
@router.post("/{room_id}/regenerate-invite")
async def regenerate_invite(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    room = await _get_room_with_permissions(room_id, db, current_user)
    room.invite_code = generate_invite_code()
    await db.commit()
    return {
        "success": True,
        "invite_code": room.invite_code,
        "invite_link": f"/join/{room.invite_code}",
    }
    
# 9. ЗАВЕРШЕНИЕ ВСТРЕЧИ
@router.patch("/{room_id}/end")
async def end_meeting(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Завершить встречу (только для организатора или админа)."""
    room = await _get_room_with_permissions(room_id, db, current_user)
    
    if room.status == RoomStatusEnum.ended:
        return {"success": True, "message": "Already ended"}
        
    room.status = RoomStatusEnum.ended
    room.ended_at = datetime.utcnow()
    
    # Считаем длительность
    if room.started_at:
        duration = room.ended_at - room.started_at
        room.duration_seconds = int(duration.total_seconds())
        
    await db.commit()
    await invalidate_cache("analytics")
    # Уведомляем всех участников через WebSocket
    try:
        from routers.websockets import manager
        await manager.broadcast(room_id, {
            "type": "system",
            "message": "Meeting ended by organizer",
            "userId": str(current_user.id),
        })
    except Exception:
        pass  # WebSocket может быть недоступен
    
    return {"success": True, "message": "Meeting ended"}