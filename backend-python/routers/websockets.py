from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict
import json
import uuid
from datetime import datetime
from sqlalchemy import select

import security
import models
import logging
from database import AsyncSessionLocal

router = APIRouter(tags=["WebSockets"])


import redis.asyncio as redis
from database import REDIS_URL

class ConnectionManager:
    """Управляет WebSocket-соединениями через Redis."""

    def __init__(self):
        self.redis: redis.Redis | None = None
        # Локальный словарь для WebSocket-объектов (их нельзя хранить в Redis)
        self.ws_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def _ensure_redis(self):
        if self.redis is None:
            self.redis = redis.from_url(REDIS_URL, decode_responses=True)

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        await self._ensure_redis()
        
        # Храним WebSocket локально (нельзя сериализовать в Redis)
        if room_id not in self.ws_connections:
            self.ws_connections[room_id] = {}
        self.ws_connections[room_id][user_id] = websocket
        
        # Храним presence в Redis
        await self.redis.hset(f"active_rooms:{room_id}", user_id, "online")

    def disconnect(self, room_id: str, user_id: str):
        # Удаляем локальный WebSocket
        if room_id in self.ws_connections:
            self.ws_connections[room_id].pop(user_id, None)
            if not self.ws_connections[room_id]:
                del self.ws_connections[room_id]
        
        # Удаляем из Redis (асинхронно, без await)
        if self.redis:
            async def _del():
                await self.redis.hdel(f"active_rooms:{room_id}", user_id)
            import asyncio
            try:
                asyncio.create_task(_del())
            except Exception:
                pass

    async def broadcast(self, room_id: str, message: dict, exclude_user: str = None):
        if room_id in self.ws_connections:
            for uid, ws in list(self.ws_connections[room_id].items()):
                if uid != exclude_user:
                    try:
                        await ws.send_json(message)
                    except Exception:
                        pass

    async def get_participants(self, room_id: str) -> list:
        await self._ensure_redis()
        return await self.redis.hkeys(f"active_rooms:{room_id}")


manager = ConnectionManager()


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
):
    """Главный WebSocket эндпоинт для чата, статусов (presence) и WebRTC сигналинга."""
    
    # 1. Валидация JWT токена
    payload = security.decode_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # Защита: разрешаем вход только по access-токену
    if payload.get("type") != "access":
        await websocket.close(code=1008, reason="Invalid token type")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=1008, reason="No user_id in token")
        return

    # 2. Получаем данные пользователя из БД
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(models.User).where(models.User.id == user_id)
        )
        user = result.scalars().first()
        username = (
            f"{user.first_name} {user.last_name or ''}".strip()
            if user
            else "Unknown User"
        )

    # 3. Подключаем пользователя к комнате
    await manager.connect(websocket, room_id, user_id)
    
    # 3.1. Записываем в БД (если ещё нет записи)
    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(models.Participant).where(
                models.Participant.room_id == room_id,
                models.Participant.user_id == user_id,
            )
        )
        if not existing.scalars().first():
            db.add(models.Participant(
                room_id=room_id,
                user_id=user_id,
                role_in_room="participant",
                joined_at=datetime.utcnow(),
            ))
            await db.commit()
            
    # 3.2. Создаём задачи для heartbeat
    import asyncio as asyncio_module
    
    async def send_ping():
        """Отправляем ping каждые 15 секунд."""
        while True:
            await asyncio_module.sleep(15)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break

    async def wait_pong():
        """Ждём pong или дисконнектим через 30 секунд."""
        while True:
            await asyncio_module.sleep(30)
            # Если за 30 секунд не получили pong — дисконнект
            try:
                await websocket.close(code=1002, reason="Ping timeout")
                break
            except Exception:
                break

    ping_task = asyncio_module.create_task(send_ping())
    last_pong_ref = {"time": datetime.utcnow()}

    # ЛОГИКА ТАЙМЕРА: Если комната запланирована, переводим в статус ACTIVE
    async with AsyncSessionLocal() as db:
        room_res = await db.execute(select(models.Room).where(models.Room.id == room_id))
        room = room_res.scalars().first()
        
        if room and room.status == models.RoomStatusEnum.scheduled:
            room.status = models.RoomStatusEnum.active
            room.started_at = datetime.utcnow()  # ← БЕЗ timezone
            await db.commit()
            # Уведомляем всех в комнате, что встреча началась
            await manager.broadcast(room_id, {
                "type": "system",
                "message": "Meeting has officially started",
                "started_at": room.started_at.isoformat() + "Z"
            })

    # Уведомляем остальных, что зашел новый участник
    await manager.broadcast(
        room_id,
        {
            "type": "system",
            "message": f"{username} joined the meeting",
            "user_id": user_id,
            "username": username,
        },
        exclude_user=user_id,
    )

    # 4. Отправляем историю чата ТОЛЬКО что подключившемуся участнику
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(models.ChatMessage, models.User.first_name, models.User.last_name)
            .outerjoin(models.User, models.ChatMessage.user_id == models.User.id)
            .where(models.ChatMessage.room_id == room_id)
            .order_by(models.ChatMessage.created_at.desc()) # Сортируем от новых к старым
            .limit(50) # Берем последние 50
        )
        rows = result.all()

        history =[]
        # reversed возвращает список в хронологическом порядке (сверху вниз)
        for msg, first_name, last_name in reversed(rows):
            display_name = (
                f"{first_name} {last_name or ''}".strip()
                if first_name
                else "Unknown User"
            )
            
            history.append({
                "type": "chat",
                "id": str(msg.id),
                "user_id": str(msg.user_id) if msg.user_id else None,
                "username": display_name,
                "message": msg.message,
                "message_type": "text",
                "created_at": msg.created_at.isoformat() + "Z",
                "reply_to_id": str(msg.reply_to_id) if msg.reply_to_id else None,
            })

        if history:
            try:
                await websocket.send_json({
                    "type": "chat_history",
                    "messages": history,
                })
            except Exception:
                pass
        
        # 5. Отправляем ВСЕМ актуальный список участников (включая нового)
        participants_list = await manager.get_participants(room_id)
        participants_info = []
        for pid in participants_list:
            async with AsyncSessionLocal() as db:
                u_result = await db.execute(
                    select(models.User).where(models.User.id == pid)
                )
                u = u_result.scalars().first()
                p_name = f"{u.first_name} {u.last_name or ''}".strip() if u else "Unknown"
            participants_info.append({
                "user_id": pid,
                "username": p_name,
                "is_muted": True,
                "hand_raised": False,
                "presence_status": "idle",
            })
        
        if participants_info:
            # Отправляем ВСЕМ в комнате (не только новому)
            await manager.broadcast(room_id, {
                "type": "participants_list",
                "participants": participants_info,
            })
        
        
    try:
        while True:
            # Ожидаем сообщения от клиента
            data = await websocket.receive_text()
            message_data = json.loads(data)
            msg_type = message_data.get("type")
            
            if msg_type == "pong":
                last_pong_ref["time"] = datetime.utcnow()
                continue

            if msg_type == "chat":
                new_id = str(uuid.uuid4())
                await manager.broadcast(room_id, {
                    "type": "chat",
                    "id": new_id,
                    "user_id": user_id,
                    "user_id": user_id,
                    "username": username,
                    "message": message_data.get("message"),
                    "message_type": "text",
                    "created_at": datetime.utcnow().isoformat() + "Z",
                    "reply_to_id": message_data.get("reply_to_id")
                })

                async with AsyncSessionLocal() as db:
                    reply_to = message_data.get("reply_to_id")
                    if reply_to:
                        result = await db.execute(
                            select(models.ChatMessage).where(
                                models.ChatMessage.id == reply_to,
                                models.ChatMessage.room_id == room_id,
                            )
                        )
                        if not result.scalars().first():
                            reply_to = None

                    chat_message = models.ChatMessage(
                        id=new_id,
                        room_id=room_id,
                        user_id=user_id,
                        message=message_data.get("message", ""),
                        reply_to_id=reply_to,
                    )
                    db.add(chat_message)
                    await db.commit()
            
            elif msg_type == "edit_chat":
                message_id = message_data.get("messageId") or message_data.get("id")
                new_message = message_data.get("message") or message_data.get("newMessage")
                if message_id and new_message:
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(models.ChatMessage).where(
                                models.ChatMessage.id == message_id,
                                models.ChatMessage.room_id == room_id,
                                models.ChatMessage.user_id == user_id,
                            )
                        )
                        msg = result.scalars().first()
                        if msg:
                            msg.message = new_message
                            msg.edited_at = datetime.utcnow()
                            await db.commit()
                            await manager.broadcast(room_id, {
                                "type": "chat_edited",
                                "messageId": message_id,
                                "message": new_message,
                                "edited_at": msg.edited_at.isoformat() + "Z",
                            })

            elif msg_type == "delete_chat":
                message_id = message_data.get("messageId") or message_data.get("id")
                if message_id:
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(models.ChatMessage).where(
                                models.ChatMessage.id == message_id,
                                models.ChatMessage.room_id == room_id,
                            )
                        )
                        msg = result.scalars().first()
                        if msg and str(msg.user_id) == user_id:
                            msg.deleted_at = datetime.utcnow()
                            msg.message = "[deleted]"
                            await db.commit()
                            await manager.broadcast(room_id, {
                                "type": "chat_deleted",
                                "messageId": message_id,
                                "deleted_at": msg.deleted_at.isoformat() + "Z",
                            })
            
            elif msg_type == "presence":
                presence_msg = {
                    "type": "presence",
                    "user_id": user_id,
                    "status": message_data.get("status", "idle"),
                    "is_muted": message_data.get("is_muted", False),
                    "hand_raised": message_data.get("hand_raised", False),
                }
                await manager.broadcast(room_id, presence_msg, exclude_user=user_id)

            elif msg_type in ("offer", "answer", "ice-candidate"):
                target = message_data.get("target")
                signaling_msg = {
                    "type": msg_type,
                    "from": user_id,
                    "username": username,
                    "sdp": message_data.get("sdp"),
                    "candidate": message_data.get("candidate"),
                }
                
                # Логируем для отладки
                print(f"📡 Signaling {msg_type} from {user_id} to {target}")
                
                # Отправляем сообщение конкретному участнику
                if target and room_id in manager.ws_connections:
                    ws = manager.ws_connections[room_id].get(target)
                    if ws:
                        try:
                            await ws.send_json(signaling_msg)
                            print(f"✓ {msg_type} sent to {target}")
                        except Exception as e:
                            print(f"✗ Failed to send {msg_type} to {target}: {e}")
                    else:
                        # Сохраняем сообщение если пользователь не онлайн
                        print(f"⚠️ Target {target} not found in room {room_id}")
                        # Здесь можно добавить буферизацию в Redis
                else:
                    print(f"⚠️ Invalid target or room_id: {target}, {room_id}")

    except WebSocketDisconnect:
        ping_task.cancel()
        manager.disconnect(room_id, user_id)
        await manager.broadcast(
            room_id,
            {
                "type": "system",
                "message": f"{username} left the meeting",
                "user_id": user_id,
            },
        )
    except Exception as e:
        ping_task.cancel()
        print(f"WebSocket error for user {user_id} in room {room_id}: {e}")
        manager.disconnect(room_id, user_id)