from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee
from ..schemas import ApprovalOut, ApprovalResolve
from .. import models
from ..ws import broadcast

router = APIRouter(prefix="/api/events/{event_id}/approvals", tags=["approvals"])


@router.get("", response_model=List[ApprovalOut])
def list_approvals(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    return (
        db.query(models.Approval)
        .filter(models.Approval.event_id == event_id)
        .order_by(models.Approval.created_at.desc())
        .all()
    )


@router.post("/{approval_id}/resolve")
async def resolve_approval(
    event_id: str,
    approval_id: str,
    payload: ApprovalResolve,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    approval = db.query(models.Approval).filter(
        models.Approval.id == approval_id,
        models.Approval.event_id == event_id,
    ).first()
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.status != models.ApprovalStatus.pending:
        raise HTTPException(400, "Approval already resolved")

    approval.status = payload.status
    approval.resolved_at = datetime.utcnow()
    approval.resolved_by = current_user.name

    if payload.status == models.ApprovalStatus.approved:
        _handle_approval_side_effects(approval, db)

    log_msg = f"Approval '{approval.type.value}' {payload.status.value} by {current_user.name}"
    log = models.ActivityLog(
        event_id=event_id,
        message=log_msg,
        log_type="success" if payload.status == models.ApprovalStatus.approved else "warning",
    )
    db.add(log)
    db.commit()

    # Broadcast to all WebSocket clients
    pending_count = db.query(models.Approval).filter(
        models.Approval.event_id == event_id,
        models.Approval.status == models.ApprovalStatus.pending,
    ).count()

    background_tasks.add_task(broadcast, event_id, {
        "type": "approval_resolved",
        "approval_id": approval_id,
        "status": payload.status.value,
        "resolved_by": current_user.name,
        "pending_count": pending_count,
        "log": {"message": log_msg, "log_type": log.log_type},
    })

    return {"message": f"Approval {payload.status.value}", "approval_id": approval_id}


def _handle_approval_side_effects(approval: models.Approval, db: Session):
    payload = approval.payload or {}

    if approval.type == models.ApprovalType.progression:
        to_index = payload.get("to_index")
        if to_index is not None:
            event = db.query(models.Event).filter(models.Event.id == approval.event_id).first()
            if event:
                event.current_stage_index = to_index
                stages = (
                    db.query(models.PipelineStage)
                    .filter(models.PipelineStage.event_id == approval.event_id)
                    .order_by(models.PipelineStage.order_index)
                    .all()
                )
                for stage in stages:
                    if stage.order_index < to_index:
                        stage.status = models.StageStatus.completed
                        if not stage.completed_at:
                            stage.completed_at = datetime.utcnow()
                    elif stage.order_index == to_index:
                        stage.status = models.StageStatus.active
                        if not stage.started_at:
                            stage.started_at = datetime.utcnow()
                    else:
                        stage.status = models.StageStatus.pending

                # Auto-approve proposed teams if advancing past Team Formation stage (index 1)
                if to_index >= 2:
                    db.query(models.Team).filter(
                        models.Team.event_id == approval.event_id,
                        models.Team.status == models.TeamStatus.proposed
                    ).update({models.Team.status: models.TeamStatus.approved})
                elif to_index == 0:
                    from .events import clear_event_teams_and_submissions
                    clear_event_teams_and_submissions(approval.event_id, db)

    elif approval.type == models.ApprovalType.team_formation:
        team_ids = payload.get("team_ids", [])
        for team_id in team_ids:
            team = db.query(models.Team).filter(models.Team.id == team_id).first()
            if team:
                team.status = models.TeamStatus.approved
