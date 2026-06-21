from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from ..database import get_db
from ..auth import require_committee
from ..guards import require_event_not_completed
from .. import models
from ..email_service import send_email
from ..config import settings

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
    
    results = []
    for msg in messages:
        msg_dict = {
            "id": msg.id,
            "event_id": msg.event_id,
            "team_id": msg.team_id,
            "sender_name": msg.sender_name,
            "sender_role": msg.sender_role,
            "message": msg.message,
            "parent_id": msg.parent_id,
            "created_at": msg.created_at.isoformat() if msg.created_at else None
        }
        if msg_dict["sender_role"] == "judge" and "@" in msg_dict["sender_name"]:
            invite = db.query(models.JudgeInvitation).filter(
                models.JudgeInvitation.event_id == event_id,
                models.JudgeInvitation.judge_email == msg_dict["sender_name"]
            ).first()
            if invite:
                msg_dict["sender_name"] = invite.judge_name
            else:
                username = msg_dict["sender_name"].split("@")[0]
                msg_dict["sender_name"] = f"Judge ({username})"
        results.append(msg_dict)
        
    return results


@router.post("")
async def post_message(
    event_id: str,
    payload: QAMessageIn,
    db: Session = Depends(get_db),
):
    require_event_not_completed(event_id, db)
    # check if first message from judge/committee to this team
    is_first_message = False
    if payload.sender_role in ("judge", "committee"):
        existing_count = (
            db.query(models.QAMessage)
            .filter(
                models.QAMessage.event_id == event_id,
                models.QAMessage.team_id == payload.team_id,
                models.QAMessage.sender_role.in_(["judge", "committee"])
            )
            .count()
        )
        is_first_message = existing_count == 0

    # save message
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

    # send email ONLY on first message from judge/committee
    if is_first_message:
        try:
            team = db.query(models.Team).filter(
                models.Team.id == payload.team_id
            ).first()

            event = db.query(models.Event).filter(
                models.Event.id == event_id
            ).first()
            event_name = event.name if event else "the event"

            if team and team.members:
                for participant in team.members:
                    if participant.email and participant.portal_token:
                        portal_link = f"{settings.FRONTEND_URL}/portal/{participant.portal_token}?event={event_id}"

                        body = f"""Hi {participant.name},

You have received a new question from a {payload.sender_role} on {event_name}!

From: {payload.sender_name} ({payload.sender_role.capitalize()})
Message: "{payload.message}"

Visit your participant portal to reply:
👉 {portal_link}

Scroll down to the Live Q&A section to respond.

Note: Future messages will appear as popups on your portal — no email will be sent.

Regards,
EventCraft Team"""

                        await send_email(
                            to_email=participant.email,
                            subject=f"New Judge Query — {event_name}",
                            body=body,
                            to_name=participant.name
                        )
        except Exception as e:
            print(f"[QA Email Error]: {e}")

    return msg


@router.delete("/{message_id}")
def delete_message(
    event_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    require_event_not_completed(event_id, db)
    msg = db.query(models.QAMessage).filter(
        models.QAMessage.id == message_id
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    db.delete(msg)
    db.commit()
    return {"message": "Deleted"}

@router.delete("/{team_id}/clear")
async def clear_messages(
    event_id: str,
    team_id: str,
    db: Session = Depends(get_db),
):
    require_event_not_completed(event_id, db)
    db.query(models.QAMessage).filter(
        models.QAMessage.event_id == event_id,
        models.QAMessage.team_id == team_id,
    ).delete()
    db.commit()
    return {"message": "Chat cleared"}