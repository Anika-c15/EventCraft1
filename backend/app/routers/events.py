from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
import os

from ..database import get_db
from ..auth import require_committee
from ..schemas import (
    EventCreate, EventUpdate, EventOut, StageOut, DashboardStats, 
    FormationRulesUpdate, StageSetPayload,
    CommitteeInviteCreate, CommitteeInviteOut,
    ScoringWeightsUpdate
)
from .. import models
from ..email_service import send_email
from pydantic import BaseModel
from ..communications_service import auto_send_stage_communications

router = APIRouter(prefix="/api/events", tags=["events"])

DEFAULT_STAGES = [
    {
        "name": "Participant Intake",
        "description": "Register and verify all participants, collect skill declarations.",
        "tasks": ["Open registration portal", "Collect participant profiles",
                  "Verify institutional affiliations", "Approve participant roster"],
        "allows_submission": False,
        "is_evaluation": False,
        "portal_description": "Registration is open. Your profile has been received.",
    },
    {
        "name": "Team Formation",
        "description": "AI-powered team formation based on configured rules.",
        "tasks": ["Configure formation rules", "Run AI team formation",
                  "Review proposed teams", "Approve team compositions"],
        "allows_submission": False,
        "is_evaluation": False,
        "portal_description": "Teams are being formed. You'll receive an email once your team assignment is confirmed.",
    },
    {
        "name": "Hacking",
        "description": "Teams work on their AI/ML projects.",
        "tasks": ["Provide project guidelines", "Offer mentorship and support", "Monitor progress", "Ensure resource availability"],
        "allows_submission": True,
        "is_evaluation": False,
        "portal_description": "Hacking is in progress! Build your project and submit it using the My Submission Hub.",
    },
    {
        "name": "Evaluation",
        "description": "Judges evaluate teams across all scoring criteria.",
        "tasks": ["Open evaluation portal", "Collect judge scores",
                  "Aggregate scores", "Flag anomalies for review"],
        "allows_submission": False,
        "is_evaluation": True,
        "portal_description": "Evaluation is underway. Judges are reviewing all team submissions.",
    },
    {
        "name": "Results",
        "description": "Compile final rankings and prepare announcements.",
        "tasks": ["Calculate final rankings", "Generate result reports",
                  "Prepare certificates", "Draft announcement communications"],
        "allows_submission": False,
        "is_evaluation": False,
        "portal_description": "Results are being compiled. Final rankings will be announced soon.",
    },
    {
        "name": "Progression",
        "description": "Advance qualifying teams to the next round.",
        "tasks": ["Identify qualifying teams", "Send progression notifications",
                  "Update participant statuses", "Archive event data"],
        "allows_submission": False,
        "is_evaluation": False,
        "portal_description": "Qualifying teams are being notified for the next round.",
    },
]


@router.post("", response_model=EventOut)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    event = models.Event(
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
        formation_rules=None,
        scoring_weights={
            "judge": 0.70,
            "peer": 0.15,
            "social": 0.15,
        },
    )
    db.add(event)
    db.flush()

    # No default pipeline stages — pipeline is configured by the AI Agent
    # Initial activity log
    log = models.ActivityLog(
        event_id=event.id,
        message=f"Event '{payload.name}' created — configure the pipeline using the AI Agent",
        log_type="info",
    )
    db.add(log)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=List[EventOut])
def list_events(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    if current_user.role == models.UserRole.admin:
        return db.query(models.Event).order_by(models.Event.created_at.desc()).all()
    
    # Get events owned by user OR events they accepted an invite to
    my_invites = db.query(models.CommitteeInvitation).filter(
        models.CommitteeInvitation.email == current_user.email, 
        models.CommitteeInvitation.is_accepted == True
    ).all()
    invited_event_ids = [inv.event_id for inv in my_invites]
    
    return db.query(models.Event).filter(
        (models.Event.owner_id == current_user.id) | (models.Event.id.in_(invited_event_ids))
    ).order_by(models.Event.created_at.desc()).all()


@router.get("/public/demo-portal")
def get_public_demo_portal(
    db: Session = Depends(get_db),
):
    event = db.query(models.Event).order_by(models.Event.created_at.desc()).first()
    if not event:
        raise HTTPException(404, "No events found")
    p = db.query(models.Participant).filter(
        models.Participant.event_id == event.id,
        models.Participant.status == models.ParticipantStatus.active
    ).first()
    if not p:
        p = db.query(models.Participant).filter(
            models.Participant.event_id == event.id
        ).first()
    if not p:
        raise HTTPException(404, "No participants found")
    return {"token": p.portal_token, "event_id": event.id}


@router.get("/public/active-event")
def get_public_active_event(db: Session = Depends(get_db)):
    """Public — returns the most recent active event id and name."""
    # Prioritize active event containing 'eventcraft' (case-insensitive)
    event = db.query(models.Event).filter(
        models.Event.is_active == True,
        models.Event.name.ilike("%eventcraft%")
    ).first()
    if not event:
        event = db.query(models.Event).filter(models.Event.is_active == True).order_by(models.Event.created_at.desc()).first()
    if not event:
        event = db.query(models.Event).order_by(models.Event.created_at.desc()).first()
    if not event:
        raise HTTPException(404, "No events found")
    return {"event_id": event.id, "event_name": event.name}


@router.get("/public/verify-name")
def verify_event_name(name: str, db: Session = Depends(get_db)):
    """Public — checks if an event name matches any registered event (case-insensitive) and returns its ID and name."""
    clean_name = name.strip().lower()
    event = db.query(models.Event).filter(models.Event.name.ilike(clean_name)).first()
    if not event:
        event = db.query(models.Event).filter(models.Event.name.ilike(f"%{clean_name}%")).first()
    if not event:
        raise HTTPException(404, "No matching event found")
    return {"event_id": event.id, "event_name": event.name}


@router.get("/public/intake-status")
def get_intake_status(event_id: str, db: Session = Depends(get_db)):
    """Public — returns whether participant intake is still open for an event."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    stages = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == event_id
    ).order_by(models.PipelineStage.order_index).all()

    if not stages:
        return {"intake_open": False, "reason": "The pipeline for this event has not been configured yet."}

    active_stage = next((s for s in stages if s.status == models.StageStatus.active), None)
    intake_stages = [s for s in stages if any(kw in s.name.lower() for kw in ("intake", "register", "registration", "participant"))]
    intake_stage = intake_stages[0] if intake_stages else stages[0]

    if not active_stage:
        return {"intake_open": False, "reason": "No active stage found for this event."}

    if active_stage.order_index > intake_stage.order_index:
        return {
            "intake_open": False,
            "reason": f"Participant intake is closed. The event has moved to the '{active_stage.name}' stage. Registration is no longer accepted."
        }

    return {"intake_open": True, "reason": ""}


@router.get("/{event_id}", response_model=EventOut)
def get_event(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    return event


# --- Name Update Logic ---

class EventNameUpdate(BaseModel):
    name: str

@router.put("/{event_id}/name", response_model=EventOut)
def update_event_name(
    event_id: str, 
    payload: EventNameUpdate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(require_committee)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event: 
        raise HTTPException(404, "Event not found")
    
    # Authorize: Only owner can rename
    if event.owner_id != current_user.id: 
        raise HTTPException(403, "Not authorized to rename this event")
        
    # Check if already edited
    if getattr(event, 'is_name_edited', False): 
        raise HTTPException(400, "Event name is already locked.")

    event.name = payload.name.strip()
    event.is_name_edited = True
    
    db.commit()
    db.refresh(event)
    
    # Optional: Broadcast sync
    try:
        from ..ws import broadcast_sync
        broadcast_sync(event_id, {"type": "event_updated", "event_name": event.name})
    except Exception:
        pass
        
    return event

@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: str,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    # Authorize: Only the workspace creator/owner can edit
    if event.owner_id != current_user.id:
        raise HTTPException(403, "Only the creator/owner of this event can update the description")

    if payload.description is not None:
        event.description = payload.description.strip()

    db.commit()
    db.refresh(event)
    return event



@router.get("/{event_id}/stages", response_model=List[StageOut])
def get_stages(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    return (
        db.query(models.PipelineStage)
        .filter(models.PipelineStage.event_id == event_id)
        .order_by(models.PipelineStage.order_index)
        .all()
    )


@router.get("/{event_id}/dashboard", response_model=DashboardStats)
def get_dashboard(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    total_p = db.query(models.Participant).filter(models.Participant.event_id == event_id).count()
    active_p = (
        db.query(models.Participant)
        .filter(
            models.Participant.event_id == event_id,
            models.Participant.status == models.ParticipantStatus.active,
        )
        .count()
    )
    teams_count = db.query(models.Team).filter(models.Team.event_id == event_id).count()
    pending_approvals = (
        db.query(models.Approval)
        .filter(
            models.Approval.event_id == event_id,
            models.Approval.status == models.ApprovalStatus.pending,
        )
        .count()
    )
    anomalies = (
        db.query(models.EvaluationScore)
        .filter(
            models.EvaluationScore.event_id == event_id,
            models.EvaluationScore.is_anomaly == True,
        )
        .count()
    )

    stages = (
        db.query(models.PipelineStage)
        .filter(models.PipelineStage.event_id == event_id)
        .order_by(models.PipelineStage.order_index)
        .all()
    )
    current_stage = next((s for s in stages if s.status == models.StageStatus.active), None)

    is_evaluation_unlocked = False
    is_evaluation_closed = False

    eval_stages = [s for s in stages if s.is_evaluation]
    if not eval_stages:
        # Match only stages explicitly named as evaluation/judging
        eval_stages = [s for s in stages if any(kw in s.name.lower() for kw in ("eval", "judg"))]

    if eval_stages and current_stage:
        first_eval_idx = min(s.order_index for s in eval_stages)
        last_eval_idx = max(s.order_index for s in eval_stages)
        is_evaluation_unlocked = current_stage.order_index >= first_eval_idx
        is_evaluation_closed = current_stage.order_index > last_eval_idx
    elif current_stage:
        # Fallback: only unlock when current stage name contains "eval"
        stage_lower = current_stage.name.lower()
        is_evaluation_unlocked = 'eval' in stage_lower or 'judg' in stage_lower
        is_evaluation_closed = stage_lower in ("results", "progression")

    return DashboardStats(
        total_participants=total_p,
        active_participants=active_p,
        teams_formed=teams_count,
        pending_approvals=pending_approvals,
        anomaly_flags=anomalies,
        current_stage=current_stage.name if current_stage else None,
        current_stage_index=event.current_stage_index,
        is_evaluation_unlocked=is_evaluation_unlocked,
        is_evaluation_closed=is_evaluation_closed,
    )


@router.put("/{event_id}/formation-rules")
def update_formation_rules(
    event_id: str,
    payload: FormationRulesUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    event.formation_rules = payload.model_dump()
    if payload.event_name:
        event.name = payload.event_name

    log = models.ActivityLog(
        event_id=event_id,
        message="Formation rules updated",
        log_type="info",
    )
    db.add(log)
    db.commit()

    try:
        from ..ws import broadcast_sync
        broadcast_sync(event_id, {"type": "event_updated", "event_name": event.name})
    except Exception as ws_err:
        # Don't fail the request if WS broadcast fails
        pass

    return {"message": "Formation rules updated", "rules": event.formation_rules}


@router.put("/{event_id}/scoring-weights")
def update_scoring_weights(
    event_id: str,
    payload: ScoringWeightsUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    total_weight = payload.judge + payload.peer + payload.social
    if abs(total_weight - 100.0) > 0.01:
        raise HTTPException(400, f"Scoring weights must sum to exactly 100%. Currently they sum to {total_weight:.1f}%.")

    event.scoring_weights = {
        "judge": round(payload.judge / 100.0, 4),
        "peer": round(payload.peer / 100.0, 4),
        "social": round(payload.social / 100.0, 4)
    }

    log = models.ActivityLog(
        event_id=event_id,
        message=f"Scoring weights updated: Judge {payload.judge:.0f}%, Peer {payload.peer:.0f}%, Social {payload.social:.0f}%",
        log_type="info",
    )
    db.add(log)
    db.commit()

    try:
        from ..ws import broadcast_sync
        broadcast_sync(event_id, {"type": "event_updated", "event_name": event.name})
    except Exception:
        pass

    return {"message": "Scoring weights updated", "scoring_weights": event.scoring_weights}


@router.post("/{event_id}/advance-stage")
def advance_stage(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """Create an approval request to advance the pipeline stage."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    stages = (
        db.query(models.PipelineStage)
        .filter(models.PipelineStage.event_id == event_id)
        .order_by(models.PipelineStage.order_index)
        .all()
    )

    current_idx = event.current_stage_index
    if current_idx >= len(stages) - 1:
        raise HTTPException(400, "Already at final stage")

    current_stage = stages[current_idx]
    next_stage = stages[current_idx + 1]

    approval = models.Approval(
        event_id=event_id,
        type=models.ApprovalType.progression,
        status=models.ApprovalStatus.pending,
        description=(
            f"Advance pipeline from '{current_stage.name}' to '{next_stage.name}'. "
            f"This will update the event stage for all participants."
        ),
        payload={"from_stage": current_stage.name, "to_stage": next_stage.name,
                 "from_index": current_idx, "to_index": current_idx + 1},
    )
    db.add(approval)

    log = models.ActivityLog(
        event_id=event_id,
        message=f"Stage advancement requested: '{current_stage.name}' → '{next_stage.name}'",
        log_type="info",
    )
    db.add(log)
    db.commit()
    return {"message": "Advancement approval request created", "approval_id": approval.id}


@router.post("/{event_id}/advance-stage-direct")
async def advance_stage_direct(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """Directly advance the pipeline stage without an approval gate."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    stages = (
        db.query(models.PipelineStage)
        .filter(models.PipelineStage.event_id == event_id)
        .order_by(models.PipelineStage.order_index)
        .all()
    )

    current_idx = event.current_stage_index
    if current_idx >= len(stages) - 1:
        raise HTTPException(400, "Already at final stage")

    current_stage = stages[current_idx]
    next_stage = stages[current_idx + 1]
    to_index = current_idx + 1

    # Update stage statuses immediately
    for stage in stages:
        if stage.order_index < to_index:
            stage.status = models.StageStatus.completed
            if not stage.completed_at:
                from datetime import datetime
                stage.completed_at = datetime.utcnow()
        elif stage.order_index == to_index:
            stage.status = models.StageStatus.active
            if not stage.started_at:
                from datetime import datetime
                stage.started_at = datetime.utcnow()
        else:
            stage.status = models.StageStatus.pending

    event.current_stage_index = to_index
    if to_index >= 2:
        db.query(models.Team).filter(
            models.Team.event_id == event_id,
            models.Team.status == models.TeamStatus.proposed
        ).update({models.Team.status: models.TeamStatus.approved})
    elif to_index == 0:
        clear_event_teams_and_submissions(event_id, db)

    log = models.ActivityLog(
        event_id=event_id,
        message=f"Pipeline advanced: '{current_stage.name}' → '{next_stage.name}'",
        log_type="success",
    )
    db.add(log)
    db.commit()

    # Trigger dynamic stage communications
    await auto_send_stage_communications(event_id, current_stage.name, next_stage.name, db)

    return {
        "message": f"Advanced to '{next_stage.name}'",
        "current_stage": next_stage.name,
        "current_stage_index": to_index,
    }


@router.post("/{event_id}/set-stage-direct")
async def set_stage_direct(
    event_id: str,
    payload: StageSetPayload,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """Directly set the pipeline stage to a specific stage by name (for debugging/testing)."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    stages = (
        db.query(models.PipelineStage)
        .filter(models.PipelineStage.event_id == event_id)
        .order_by(models.PipelineStage.order_index)
        .all()
    )

    # Find the target stage
    target_stage = None
    to_index = None
    for stage in stages:
        if stage.name.lower() == payload.stage_name.lower():
            target_stage = stage
            to_index = stage.order_index
            break

    if target_stage is None or to_index is None:
        raise HTTPException(400, f"Stage '{payload.stage_name}' not found. Available: {[s.name for s in stages]}")

    current_idx = event.current_stage_index
    current_stage = stages[current_idx] if current_idx < len(stages) else None
    current_stage_name = current_stage.name if current_stage else None

    from datetime import datetime
    # Update stage statuses immediately
    for stage in stages:
        if stage.order_index < to_index:
            stage.status = models.StageStatus.completed
            if not stage.completed_at:
                stage.completed_at = datetime.utcnow()
        elif stage.order_index == to_index:
            stage.status = models.StageStatus.active
            if not stage.started_at:
                stage.started_at = datetime.utcnow()
            stage.completed_at = None
        else:
            stage.status = models.StageStatus.pending
            stage.started_at = None
            stage.completed_at = None

    event.current_stage_index = to_index
    if to_index >= 2:
        db.query(models.Team).filter(
            models.Team.event_id == event_id,
            models.Team.status == models.TeamStatus.proposed
        ).update({models.Team.status: models.TeamStatus.approved})
    elif to_index == 0:
        clear_event_teams_and_submissions(event_id, db)

    # Also log in ActivityLog
    log = models.ActivityLog(
        event_id=event_id,
        message=f"Pipeline debug override: stage set to '{target_stage.name}'",
        log_type="warning",
    )
    db.add(log)
    db.commit()

    # Trigger dynamic stage communications
    await auto_send_stage_communications(event_id, current_stage_name, target_stage.name, db)

    # Broadcast WebSocket update
    from ..ws import broadcast_sync
    try:
        broadcast_sync(event_id, {
            "type": "stage_advanced",
            "current_stage": target_stage.name,
            "current_stage_index": to_index
        })
    except Exception as e:
        print(f"⚠️ WS broadcast error: {e}")

    return {
        "message": f"Directly set stage to '{target_stage.name}'",
        "current_stage": target_stage.name,
        "current_stage_index": to_index,
    }


def clear_event_teams_and_submissions(event_id: str, db: Session):
    """
    Clears all teams, submissions, peer reviews, evaluation scores,
    and resets participant team assignments and pending approvals for an event.
    """
    db.query(models.Participant).filter(
        models.Participant.event_id == event_id
    ).update({models.Participant.team_id: None})
    
    db.query(models.QAMessage).filter(
        models.QAMessage.event_id == event_id
    ).delete()
    
    db.query(models.PeerReview).filter(
        models.PeerReview.event_id == event_id
    ).delete()
    
    db.query(models.EvaluationScore).filter(
        models.EvaluationScore.event_id == event_id
    ).delete()
    
    db.query(models.Team).filter(
        models.Team.event_id == event_id
    ).delete()
    
    db.query(models.Approval).filter(
        models.Approval.event_id == event_id,
        models.Approval.status == models.ApprovalStatus.pending
    ).delete()
    
    db.flush()


@router.delete("/{event_id}")
def delete_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if current_user.role != models.UserRole.admin and event.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")
    db.delete(event)
    db.commit()
    return {"message": "Event deleted successfully"}


# --- Admin Invites Logic ---

@router.get("/invitations/pending", response_model=List[CommitteeInviteOut])
def get_pending_invitations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    """Retrieve all pending invitations for the current user's email."""
    return db.query(models.CommitteeInvitation).filter(
        models.CommitteeInvitation.email == current_user.email,
        models.CommitteeInvitation.is_accepted == False
    ).all()


@router.post("/invitations/{invite_id}/accept")
def accept_invitation(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    """Accept a pending invitation."""
    invite = db.query(models.CommitteeInvitation).filter(
        models.CommitteeInvitation.id == invite_id,
        models.CommitteeInvitation.email == current_user.email
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    invite.is_accepted = True
    db.commit()
    return {"message": "Invitation accepted successfully"}


@router.post("/invitations/{invite_id}/decline")
def decline_invitation(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    """Decline a pending invitation."""
    invite = db.query(models.CommitteeInvitation).filter(
        models.CommitteeInvitation.id == invite_id,
        models.CommitteeInvitation.email == current_user.email
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    db.delete(invite)
    db.commit()
    return {"message": "Invitation declined successfully"}


@router.get("/{event_id}/invites", response_model=List[CommitteeInviteOut])
def get_invites(
    event_id: str, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(require_committee)
):
    return db.query(models.CommitteeInvitation).filter(models.CommitteeInvitation.event_id == event_id).all()


@router.post("/{event_id}/invites", response_model=CommitteeInviteOut)
async def create_invite(
    event_id: str, 
    payload: CommitteeInviteCreate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(require_committee)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event: 
        raise HTTPException(404, "Event not found")
    
    # Check if current user is the owner/creator of the event
    if event.owner_id != current_user.id:
        raise HTTPException(403, "Only the admin who created this event can invite co-administrators")
    
    existing = db.query(models.CommitteeInvitation).filter(
        models.CommitteeInvitation.event_id == event_id, 
        models.CommitteeInvitation.email == payload.email
    ).first()
    if existing: 
        raise HTTPException(400, "User already invited")

    # Co-admin invitations always start as pending (is_accepted = False)
    invite = models.CommitteeInvitation(
        event_id=event_id,
        email=payload.email,
        is_accepted=False
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Send magic link email
    from ..config import settings
    frontend_url = settings.FRONTEND_URL
    
    await send_email(
        to_email=payload.email,
        subject=f"You've been invited to co-manage {event.name} on EventCraft",
        body=f"Hi,\n\nYou have been invited to be an administrator for '{event.name}'.\n\nTo accept the invitation and access the dashboard, please register or login here:\n{frontend_url}\n\nRegards,\nEventCraft Team"
    )

    return invite


@router.delete("/{event_id}/invites/{invite_id}")
def delete_invite(
    event_id: str, 
    invite_id: str, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(require_committee)
):
    invite = db.query(models.CommitteeInvitation).filter(
        models.CommitteeInvitation.id == invite_id, 
        models.CommitteeInvitation.event_id == event_id
    ).first()
    if not invite: 
        raise HTTPException(404, "Invite not found")
    
    # Check if current user is the owner/creator of the event (or if they are deleting their own invite)
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if event and event.owner_id != current_user.id:
        raise HTTPException(403, "Only the event owner/creator can revoke invitations")
        
    db.delete(invite)
    db.commit()
    return {"message": "Invite removed"}