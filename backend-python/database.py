from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import redis.asyncio as redis
import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Глобальный клиент Redis (один на всё приложение)
_redis_client = None

async def get_redis_client():
    """Получить глобальный клиент Redis."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client

async def close_redis():
    """Закрыть соединение с Redis при завершении приложения."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None

async def get_redis():
    """Deprecated: используйте get_redis_client()"""
    return await get_redis_client()

DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+asyncpg://postgres:postgres@localhost:5432/platform_db"
)

# Render.com требует SSL для подключения, но локально обычно нет
ssl_args = {"ssl": "require"} if "render.com" in DATABASE_URL or os.getenv("DB_SSL") == "true" else {}

engine = create_async_engine(
    DATABASE_URL, 
    echo=True,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=ssl_args
)
AsyncSessionLocal = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()