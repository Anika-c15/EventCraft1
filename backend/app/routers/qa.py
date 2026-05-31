from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..auth import require_committee, decode_judge_token, decode_portal_token
from .. import models

router = APIRouter(prefix="/api/events/{event_id}/qa", tags=["qa"])


class QAMessageIn(BaseModel):
    team_id: str
    sender_name: str
    sender_role: str
    message: str
    parent_id: Optional[str] = None


@router.get("/{team_id}")
def get_messages(
    event_id: str,
    team_id: str,
    db: Session = Depends(get_db),
):
    messages = (
        db.query(models.QAMessage)
        .filter(
            models.QAMessage.event_id == event_id,
            models.QAMessage.team_id == team_id,
        )
        .order_by(models.QAMessage.created_at)
        .all()
    )
    return messages


@router.post("")
def post_message(
    event_id: str,
    payload: QAMessageIn,
    db: Session = Depends(get_db),
):
    msg = models.QAMessage(
        event_id=event_id,
        team_id=payload.team_id,
        sender_name=payload.sender_name,
        sender_role=payload.sender_role,
        message=payload.message,
        parent_id=payload.parent_id,
    )
    db.add(msg)

    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"{payload.sender_role} '{payload.sender_name}' posted a Q&A message to team",
        log_type="info",
    ))
    db.commit()
    db.refresh(msg)
    return msg


@router.delete("/{message_id}")
def delete_message(
    event_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    msg = db.query(models.QAMessage).filter(
        models.QAMessage.id == message_id
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    db.delete(msg)
    db.commit()
    return {"message": "Deleted"}