import os
from fastapi import APIRouter, Depends, HTTPException
from livekit.api import AccessToken, VideoGrants
import models
from dependencies import get_current_active_user

router = APIRouter(tags=["LiveKit"])

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")

@router.get("/api/rooms/{room_id}/livekit-token")
async def get_livekit_token(
    room_id: str,
    user: models.User = Depends(get_current_active_user)
):
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(500, "LiveKit not configured")

    token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_identity(str(user.id))
    token.with_name(f"{user.first_name} {user.last_name or ''}".strip())
    token.with_grants(VideoGrants(
        room_join=True,
        room=room_id,
        can_publish=True,
        can_subscribe=True,
    ))

    return {
        "token": token.to_jwt(),
        "url": LIVEKIT_URL,
    }
