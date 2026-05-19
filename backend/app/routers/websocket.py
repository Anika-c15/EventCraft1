"""
WebSocket endpoint — clients connect here to receive real-time event updates.

URL: ws://localhost:8000/ws/{event_id}?token={jwt_token}

The token is the same JWT used for REST API calls.
Connection is rejected if the token is invalid.
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from ..ws import manager
from ..auth import decode_portal_token
from ..database import SessionLocal
from .. import models

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


def _validate_token(token: str, db: Session) -> bool:
    """Validate JWT — accepts both committee tokens and portal tokens."""
    if not token:
        return False
    try:
        from jose import jwt
        from ..config import settings
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return False
        # Committee user
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user and user.is_active:
            return True
        # Portal participant
        participant = db.query(models.Participant).filter(
            models.Participant.id == user_id
        ).first()
        return participant is not None
    except Exception:
        return False


@router.websocket("/ws/{event_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    event_id: str,
    token: str = Query(default=""),
):
    db = SessionLocal()
    try:
        # Auth check — accept if token is valid for ANY user or participant
        # (stale event_id is handled gracefully — WS still connects, just no data)
        if not _validate_token(token, db):
            await websocket.close(code=4001, reason="Unauthorized")
            return

        # Don't reject on wrong event_id — just connect and let client handle it
        # This prevents 403 errors when DB is reset and event IDs change
    finally:
        db.close()

    await manager.connect(websocket, event_id)

    await websocket.send_text(json.dumps({
        "type": "connected",
        "event_id": event_id,
        "message": "Real-time updates active",
    }))

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, event_id)
        logger.info(f"WS client disconnected from event {event_id}")
