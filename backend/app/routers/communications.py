from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..auth import require_committee
from ..schemas import CommunicationCreate, CommunicationOut, DraftCommunicationRequest
from .. import models, llm
from ..email_service import send_email, send_bulk_emails

router = APIRouter(prefix="/api/events/{event_id}/communications", tags=["communications"])


@router.get("", response_model=List[CommunicationOut])
def list_communications(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    return (
        db.query(models.Communication)
        .filter(models.Communication.event_id == event_id)
        .order_by(models.Communication.created_at.desc())
        .all()
    )


@router.post("/draft", response_model=CommunicationOut)
def draft_communication(
    event_id: str,
    payload: DraftCommunicationRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    team_info = None
    if payload.team_id:
        team = db.query(models.Team).filter(models.Team.id == payload.team_id).first()
        if team:
            team_info = {"name": team.name, "members": [m.name for m in team.members]}

    drafted = llm.draft_communication(
        stage=payload.stage,
        recipient_type=payload.recipient_type,
        event_name=event.name,
        extra_context=payload.extra_context,
        team_info=team_info,
    )

    # Upsert: replace existing unsent draft for same stage+recipient instead of duplicating
    existing = db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.stage == payload.stage,
        models.Communication.recipient == payload.recipient_type.replace("_", " ").title(),
        models.Communication.status == models.CommStatus.draft,
    ).first()

    if existing:
        existing.subject = drafted["subject"]
        existing.body = drafted["body"]
        comm = existing
    else:
        comm = models.Communication(
            event_id=event_id,
            recipient=payload.recipient_type.replace("_", " ").title(),
            subject=drafted["subject"],
            body=drafted["body"],
            status=models.CommStatus.draft,
            stage=payload.stage,
        )
        db.add(comm)

    log = models.ActivityLog(
        event_id=event_id,
        message=f"AI-drafted communication for '{payload.stage}' stage",
        log_type="info",
    )
    db.add(log)
    db.commit()
    db.refresh(comm)
    return comm


@router.post("", response_model=CommunicationOut)
def create_communication(
    event_id: str,
    payload: CommunicationCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    comm = models.Communication(
        event_id=event_id,
        recipient=payload.recipient,
        recipient_email=payload.recipient_email,
        subject=payload.subject,
        body=payload.body,
        status=models.CommStatus.draft,
        stage=payload.stage,
    )
    db.add(comm)
    db.commit()
    db.refresh(comm)
    return comm


@router.post("/{comm_id}/send")
async def send_communication(
    event_id: str,
    comm_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    comm = db.query(models.Communication).filter(
        models.Communication.id == comm_id,
        models.Communication.event_id == event_id,
    ).first()
    if not comm:
        raise HTTPException(404, "Communication not found")
    if comm.status == models.CommStatus.sent:
        raise HTTPException(400, "This communication has already been sent and cannot be sent again.")

    recipients = []
    recipient_lower = comm.recipient.lower()

    if "all participant" in recipient_lower:
        participants = db.query(models.Participant).filter(
            models.Participant.event_id == event_id,
            models.Participant.status == models.ParticipantStatus.active,
        ).all()
        recipients = [
            {"email": p.email, "name": p.name, "vars": {"participant_name": p.name}}
            for p in participants
        ]
    elif "judge" in recipient_lower:
        # Pull judges from both invitations AND submitted scores
        seen = set()
        # First: all invited judges (have a portal link)
        invitations = db.query(models.JudgeInvitation).filter(
            models.JudgeInvitation.event_id == event_id,
            models.JudgeInvitation.is_revoked == False,
        ).all()
        for inv in invitations:
            if inv.judge_email not in seen:
                recipients.append({"email": inv.judge_email, "name": inv.judge_name,
                                    "vars": {"participant_name": inv.judge_name}})
                seen.add(inv.judge_email)
        # Also include any judges who submitted scores but may not have an invitation record
        scores = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.event_id == event_id
        ).all()
        for s in scores:
            if s.judge_email not in seen:
                recipients.append({"email": s.judge_email, "name": s.judge_name,
                                    "vars": {"participant_name": s.judge_name}})
                seen.add(s.judge_email)
    elif comm.recipient_email:
        recipients = [{"email": comm.recipient_email, "name": comm.recipient,
                       "vars": {"participant_name": comm.recipient}}]
    else:
        recipients = [{"email": "demo@eventcraft.com", "name": comm.recipient,
                       "vars": {"participant_name": comm.recipient}}]

    if not recipients:
        raise HTTPException(400, "No recipients found for this communication")

    subject = comm.subject
    body = comm.body

    async def do_send():
        results = await send_bulk_emails(recipients, subject, body)
        fresh_db = SessionLocal()
        try:
            fresh_comm = fresh_db.query(models.Communication).filter(
                models.Communication.id == comm_id
            ).first()
            if fresh_comm:
                fresh_comm.status = models.CommStatus.sent
                fresh_comm.sent_at = datetime.utcnow()
                fresh_db.add(models.ActivityLog(
                    event_id=event_id,
                    message=f"Communication '{subject[:50]}' sent to {results['sent']} recipients",
                    log_type="success",
                ))
                fresh_db.commit()
        except Exception as e:
            fresh_db.rollback()
            print(f"[do_send ERROR] {e}")
        finally:
            fresh_db.close()

    background_tasks.add_task(do_send)
    return {"message": f"Sending to {len(recipients)} recipients", "comm_id": comm_id}


@router.get("/activity-log")
def get_activity_log(
    event_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    logs = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.event_id == event_id)
        .order_by(models.ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {"id": l.id, "message": l.message, "log_type": l.log_type,
         "created_at": l.created_at.isoformat()}
        for l in logs
    ]


@router.post("/send-portal-links")
async def send_portal_links(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    from ..config import settings

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    participants = db.query(models.Participant).filter(
        models.Participant.event_id == event_id,
        models.Participant.status.in_([
            models.ParticipantStatus.active,
            models.ParticipantStatus.pending,
        ]),
    ).all()

    if not participants:
        raise HTTPException(400, "No participants found")

    recipients = []
    for p in participants:
        if not p.portal_token:
            continue
        portal_url = f"{settings.FRONTEND_URL}/portal/{p.portal_token}?event={event_id}"
        recipients.append({
            "email": p.email,
            "name": p.name,
            "vars": {
                "participant_name": p.name,
                "portal_url": portal_url,
                "event_name": event.name,
            },
        })

    subject = f"Your Personal Portal Link - {event.name}"
    body_template = """Dear {participant_name},

Welcome to {event_name}!

You can access your personal participant portal using the link below.
No account or password is required - just click the link:

{portal_url}

Your portal shows:
- Your current stage in the event journey
- Team details and teammates (once teams are formed)
- Key event dates and milestones
- Progression status

This link is unique to you - please do not share it.

Best regards,
EventCraft Committee"""

    existing_comm = db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.subject.like("%Personal Portal Link%"),
        models.Communication.status == models.CommStatus.draft,
    ).first()

    if existing_comm:
        comm = existing_comm
    else:
        comm = models.Communication(
            event_id=event_id,
            recipient="All Participants",
            subject=subject,
            body=body_template,
            status=models.CommStatus.draft,
            stage="Participant Intake",
        )
        db.add(comm)
        db.commit()
        db.refresh(comm)

    comm_id = comm.id

    async def do_send():
        results = await send_bulk_emails(recipients, subject, body_template)
        fresh_db = SessionLocal()
        try:
            fresh_comm = fresh_db.query(models.Communication).filter(
                models.Communication.id == comm_id
            ).first()
            if fresh_comm:
                fresh_comm.status = models.CommStatus.sent
                fresh_comm.sent_at = datetime.utcnow()
                fresh_db.add(models.ActivityLog(
                    event_id=event_id,
                    message=f"Portal links sent to {results['sent']} participants ({results['failed']} failed)",
                    log_type="success" if results["failed"] == 0 else "warning",
                ))
                fresh_db.commit()
        except Exception as e:
            fresh_db.rollback()
            print(f"[do_send portal ERROR] {e}")
        finally:
            fresh_db.close()

    background_tasks.add_task(do_send)
    return {
        "message": f"Sending portal links to {len(recipients)} participants",
        "recipients": len(recipients),
    }