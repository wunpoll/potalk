from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
import redis.asyncio as redis
from database import REDIS_URL

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Ограничение запросов: 100 запросов в минуту на IP."""

    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.redis: redis.Redis | None = None

    async def _get_redis(self):
        if self.redis is None:
            self.redis = redis.from_url(REDIS_URL, decode_responses=True)
        return self.redis

    async def dispatch(self, request: Request, call_next):
        # Пропускаем WebSockets, health-check и OPTIONS
        if request.scope["type"] != "http" or request.url.path == "/api/health" or request.method == "OPTIONS":
            return await call_next(request)

        r = await self._get_redis()
        
        # Получаем IP клиента
        forwarded = request.headers.get("X-Forwarded-For")
        client_ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
        
        # Ключ для текущего окна
        import time
        window = int(time.time() / self.window_seconds)
        key = f"rate:{client_ip}:{window}"
        
        # Инкрементируем счётчик
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, self.window_seconds)
        
        if count > self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later."
            )
        
        return await call_next(request)