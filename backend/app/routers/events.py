from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..auth import require_committee
from ..schemas import EventCreate, EventOut, StageOut, DashboardStats, FormationRulesUpdate, StageSetPayload
from .. import models

router = APIRouter(prefix="/api/events", tags=["events"])

DEFAULT_STAGES = [
    {
        "name": "Participant Intake",
        "description": "Register and verify all participants, collect skill declarations.",
        "tasks": ["Open registration portal", "Collect participant profiles",
                  "Verify institutional affiliations", "Approve participant roster"],
    },
    {
        "name": "Team Formation",
        "description": "AI-powered team formation based on configured rules.",
        "tasks": ["Configure formation rules", "Run AI team formation",
                  "Review proposed teams", "Approve team compositions"],
    },
    {
        "name": "Evaluation",
        "description": "Judges evaluate teams across all scoring criteria.",
        "tasks": ["Open evaluation portal", "Collect judge scores",
                  "Aggregate scores", "Flag anomalies for review"],
    },
    {
        "name": "Results",
        "description": "Compile final rankings and prepare announcements.",
        "tasks": ["Calculate final rankings", "Generate result reports",
                  "Prepare certificates", "Draft announcement communications"],
    },
    {
        "name": "Progression",
        "description": "Advance qualifying teams to the next round.",
        "tasks": ["Identify qualifying teams", "Send progression notifications",
                  "Update participant statuses", "Archive event data"],
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
        formation_rules={
            "event_name": payload.name,
            "team_size": 3,
            "allow_incomplete_teams": False,
            "skill_balance": True,
            "institution_diversity": True,
            "max_per_institution": 1,
            "experience_level_grouping": "mixed",
            "max_teams": 10,
        },
    )
    db.add(event)
    db.flush()

    # Create default pipeline stages
    for i, stage_data in enumerate(DEFAULT_STAGES):
        stage = models.PipelineStage(
            event_id=event.id,
            name=stage_data["name"],
            description=stage_data["description"],
            order_index=i,
            status=models.StageStatus.active if i == 0 else models.StageStatus.pending,
            tasks=stage_data["tasks"],
        )
        db.add(stage)

    # Initial activity log
    log = models.ActivityLog(
        event_id=event.id,
        message=f"Event '{payload.name}' created",
        log_type="success",
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
    
    return db.query(models.Event).filter(models.Event.owner_id == current_user.id).order_by(models.Event.created_at.desc()).all()


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
    event = db.query(models.Event).filter(models.Event.is_active == True).order_by(models.Event.created_at.desc()).first()
    if not event:
        event = db.query(models.Event).order_by(models.Event.created_at.desc()).first()
    if not event:
        raise HTTPException(404, "No events found")
    return {"event_id": event.id, "event_name": event.name}


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

    current_stage = (
        db.query(models.PipelineStage)
        .filter(
            models.PipelineStage.event_id == event_id,
            models.PipelineStage.status == models.StageStatus.active,
        )
        .first()
    )

    return DashboardStats(
        total_participants=total_p,
        active_participants=active_p,
        teams_formed=teams_count,
        pending_approvals=pending_approvals,
        anomaly_flags=anomalies,
        current_stage=current_stage.name if current_stage else None,
        current_stage_index=event.current_stage_index,
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
    log = models.ActivityLog(
        event_id=event_id,
        message="Formation rules updated",
        log_type="info",
    )
    db.add(log)
    db.commit()
    return {"message": "Formation rules updated", "rules": event.formation_rules}


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
def advance_stage_direct(
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
    return {
        "message": f"Advanced to '{next_stage.name}'",
        "current_stage": next_stage.name,
        "current_stage_index": to_index,
    }


@router.post("/{event_id}/set-stage-direct")
def set_stage_direct(
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

