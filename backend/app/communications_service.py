from datetime import datetime
from sqlalchemy.orm import Session
from . import models, llm
from .tasks import run_async, send_bulk_email_task

async def auto_send_stage_communications(event_id: str, from_stage: str, to_stage: str, db: Session):
    # 1. DEFERRED DISPATCH (based on the stage we are LEAVING)
    if from_stage == "Participant Intake":
        await _send_portal_links(event_id, db)
    elif from_stage == "Team Formation":
        await _send_general_stage_email(event_id, "Team Formation", db)

    # 2. IMMEDIATE DISPATCH (based on the stage we are ENTERING)
    if to_stage not in ("Participant Intake", "Team Formation"):
        await _send_general_stage_email(event_id, to_stage, db)


async def _send_portal_links(event_id: str, db: Session):
    # Prevent duplicate send
    already_sent = db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.stage == "Participant Intake",
        models.Communication.status == models.CommStatus.sent
    ).first()
    if already_sent:
        return

    from .config import settings
    from .auth import create_portal_token
    
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    participants = db.query(models.Participant).filter(
        models.Participant.event_id == event_id,
        models.Participant.status.in_([models.ParticipantStatus.active, models.ParticipantStatus.pending])
    ).all()
    
    if not participants:
        return
        
    recipients = []
    for p in participants:
        if not p.portal_token:
            p.portal_token = create_portal_token(p.id)
        portal_url = f"{settings.FRONTEND_URL}/portal/{p.portal_token}?event={event_id}"
        recipients.append({
            "email": p.email,
            "name": p.name,
            "vars": {
                "participant_name": p.name,
                "portal_url": portal_url,
                "event_name": event.name if event else "EventCraft",
            }
        })
        
    subject = f"Your Personal Portal Link - {event.name if event else 'EventCraft'}"
    body_template = """Dear {participant_name},

Welcome to {event_name}!

You can access your personal participant portal using the link below:
{portal_url}

Best regards,
EventCraft Committee"""
    
    comm = models.Communication(
        event_id=event_id,
        recipient="All Participants",
        subject=subject,
        body=body_template,
        status=models.CommStatus.sent,
        stage="Participant Intake",
        sent_at=datetime.utcnow()
    )
    db.add(comm)
    db.commit()
    db.refresh(comm)
    
    run_async(send_bulk_email_task, event_id, comm.id, recipients, subject, body_template)


async def _send_general_stage_email(event_id: str, stage_name: str, db: Session):
    # Prevent duplicate send
    already_sent = db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.stage == stage_name,
        models.Communication.status == models.CommStatus.sent
    ).first()
    if already_sent:
        return

    stage_recipient_map = {
        "Team Formation":     ("all_participants", "All Participants"),
        "Hacking":            ("all_participants", "All Participants"),
        "Evaluation":         ("all_participants", "All Participants"),
        "Results":            ("all_participants", "All Participants"),
        "Progression":        ("winners",          "Qualifying Teams"),
    }
    
    if stage_name not in stage_recipient_map:
        return
        
    recipient_type, recipient_label = stage_recipient_map[stage_name]
    
    # Try to find a pre-existing draft
    comm = db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.stage == stage_name,
        models.Communication.status == models.CommStatus.draft
    ).first()
    
    # Auto-draft using LLM if none exists (tries Groq first, then falls back to Gemini)
    if not comm:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        drafted = llm.draft_communication(
            stage=stage_name,
            recipient_type=recipient_type,
            event_name=event.name if event else "EventCraft",
        )
        if drafted.get("subject") and drafted.get("body") and not drafted["subject"].startswith("["):
            comm = models.Communication(
                event_id=event_id,
                recipient=recipient_label,
                subject=drafted["subject"],
                body=drafted["body"],
                status=models.CommStatus.draft,
                stage=stage_name,
            )
            db.add(comm)
            db.commit()
            db.refresh(comm)
            
    if comm and comm.status == models.CommStatus.draft:
        recipients = []
        if recipient_type == "all_participants":
            participants = db.query(models.Participant).filter(
                models.Participant.event_id == event_id,
                models.Participant.status == models.ParticipantStatus.active,
            ).all()
            recipients = [
                {"email": p.email, "name": p.name, "vars": {"participant_name": p.name}}
                for p in participants
            ]
        elif recipient_type == "winners":
            teams = db.query(models.Team).filter(
                models.Team.event_id == event_id,
                models.Team.status == models.TeamStatus.approved
            ).all()
            for t in teams:
                for m in t.members:
                    recipients.append({
                        "email": m.email,
                        "name": m.name,
                        "vars": {"participant_name": m.name, "team_name": t.name}
                    })
        
        if recipients:
            comm.status = models.CommStatus.sent
            comm.sent_at = datetime.utcnow()
            db.commit()
            
            run_async(send_bulk_email_task, event_id, comm.id, recipients, comm.subject, comm.body)
            
            db.add(models.ActivityLog(
                event_id=event_id,
                message=f"Automatically sent '{stage_name}' emails to {len(recipients)} recipients",
                log_type="success"
            ))
            db.commit()
