from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from dotenv import load_dotenv
from database import engine, Base, get_db, AsyncSessionLocal
from routers import auth, rooms, websockets, protocols, support, analytics
from middleware.rate_limit import RateLimitMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import models
from services.email import send_meeting_reminder_email
from datetime import datetime, timedelta
from database import close_redis
import logging


load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ReminderService")

app = FastAPI(
    title="Platform Core API",
    description="API для управления аудиоконференциями",
    version="1.0.0"
)

origins = [
    "http://localhost:5173",
    "https://potalk.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimitMiddleware, max_requests=100, window_seconds=60)

app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(websockets.router)
app.include_router(protocols.router)
app.include_router(support.router, prefix="/api")
app.include_router(analytics.router, prefix="/api/analytics")

scheduler = AsyncIOScheduler()

async def check_upcoming_meetings():
    """Проверяет scheduled-комнаты и отправляет напоминания за 5 минут до начала."""
    import asyncio
    try:
        async with AsyncSessionLocal() as db:
            now = datetime.utcnow()
            window_end = now + timedelta(minutes=5)
            
            result = await db.execute(
                select(models.Room)
                .where(
                    models.Room.status == models.RoomStatusEnum.scheduled,
                    models.Room.scheduled_start_at >= now,
                    models.Room.scheduled_start_at <= window_end,
                    models.Room.reminder_sent == False,
                )
            )
            rooms = result.scalars().all()
            
            for room in rooms:
                users_result = await db.execute(
                    select(models.User.email)
                    .where(
                        models.User.organization_id == room.organization_id,
                        models.User.status == models.StatusEnum.active,
                    )
                )
                emails = users_result.scalars().all()
                
                for email in emails:
                    try:
                        await send_meeting_reminder_email(
                            email, room.name, room.invite_code, room.scheduled_start_at
                        )
                    except Exception as e:
                        logger.error(f"Failed to send reminder to {email}: {e}")
                
                # Отмечаем что напоминание отправлено
                room.reminder_sent = True
                await db.commit()
                logger.info(f"Reminders sent for room {room.name}")
    except asyncio.CancelledError:
        logger.info("check_upcoming_meetings task was cancelled")
    except Exception as e:
        logger.error(f"Error in check_upcoming_meetings: {e}")


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Запуск проверки каждые 30 секунд
    scheduler.add_job(check_upcoming_meetings, 'interval', seconds=30)
    scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()
    await close_redis()


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    from database import get_redis
    result = {"database": "unknown", "redis": "unknown"}
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
    
    try:
        async for r in get_redis():
            await r.ping()
            result["redis"] = "connected"
    except Exception as e:
        result["redis"] = str(e)
    
    status = "ok" if all(v == "connected" for v in result.values()) else "degraded"
    return {"status": status, **result}     