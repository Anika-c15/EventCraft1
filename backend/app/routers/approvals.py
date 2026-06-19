from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee
from ..guards import require_event_not_completed
from ..schemas import ApprovalOut, ApprovalResolve, ApprovalCreate
from .. import models
from ..ws import broadcast
from ..communications_service import auto_send_stage_communications

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


@router.post("", response_model=ApprovalOut)
def create_approval(
    event_id: str,
    payload: ApprovalCreate,
    db: Session = Depends(get_db),
):
    require_event_not_completed(event_id, db)
    approval = models.Approval(
        event_id=event_id,
        type=payload.type,
        status=models.ApprovalStatus.pending,
        description=payload.description,
        payload=payload.payload,
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


@router.post("/{approval_id}/resolve")
async def resolve_approval(
    event_id: str,
    approval_id: str,
    payload: ApprovalResolve,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    require_event_not_completed(event_id, db)
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
        await _handle_approval_side_effects(approval, db)

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


async def _handle_approval_side_effects(approval: models.Approval, db: Session):
    payload = approval.payload or {}

    if approval.type == models.ApprovalType.rule_change:
        # Pipeline approved — now actually build the stages
        pipeline_config = payload.get("pipeline_config", {})
        stages = pipeline_config.get("stages", [])

        if stages:
            # Clear any existing stages
            existing = db.query(models.PipelineStage).filter(
                models.PipelineStage.event_id == approval.event_id
            ).all()
            for s in existing:
                db.delete(s)
            db.flush()

            # Build the approved pipeline stages
            for i, stage_def in enumerate(stages):
                db.add(models.PipelineStage(
                    event_id=approval.event_id,
                    name=stage_def["name"],
                    description=stage_def.get("description", ""),
                    order_index=i,
                    status=models.StageStatus.active if i == 0 else models.StageStatus.pending,
                    tasks=stage_def.get("tasks", []),
                    allows_submission=stage_def.get("allows_submission", False),
                    is_evaluation=stage_def.get("is_evaluation", False),
                    portal_description=stage_def.get("portal_description", None),
                ))

            event = db.query(models.Event).filter(models.Event.id == approval.event_id).first()
            if event:
                event.current_stage_index = 0

                # Apply scoring weights from agent config if provided
                sb = pipeline_config.get("scoring_balance", {})
                if sb:
                    j = sb.get("judge", 0.70)
                    p = sb.get("peer", 0.15)
                    s = sb.get("social", 0.15)
                    total = j + p + s
                    if total > 0:
                        event.scoring_weights = {
                            "judge": round(j / total, 4),
                            "peer": round(p / total, 4),
                            "social": round(s / total, 4),
                        }

            from .events import clear_event_teams_and_submissions
            clear_event_teams_and_submissions(approval.event_id, db)

            db.add(models.ActivityLog(
                event_id=approval.event_id,
                message=f"Pipeline activated: {len(stages)} stages now live",
                log_type="success",
            ))

        # Clean up old drafts from previous pipeline that don't belong to new stages
        new_stage_names = {s["name"] for s in stages}
        old_drafts = db.query(models.Communication).filter(
            models.Communication.event_id == approval.event_id,
            models.Communication.status == models.CommStatus.draft,
        ).all()
        for comm in old_drafts:
            if comm.stage not in new_stage_names:
                db.delete(comm)
        db.flush()
        if stages:
            await auto_send_stage_communications(approval.event_id, None, stages[0]["name"], db)

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

                db.flush()
                from_stage = payload.get("from_stage")
                to_stage = payload.get("to_stage") or (stages[to_index].name if to_index < len(stages) else None)
                await auto_send_stage_communications(approval.event_id, from_stage, to_stage, db)

    elif approval.type == models.ApprovalType.team_formation:
        team_ids = payload.get("team_ids", [])
        for team_id in team_ids:
            team = db.query(models.Team).filter(models.Team.id == team_id).first()
            if team:
                team.status = models.TeamStatus.approved

        # Auto-create a Stage Advance approval to move to the next stage
        event = db.query(models.Event).filter(models.Event.id == approval.event_id).first()
        if event:
            stages = (
                db.query(models.PipelineStage)
                .filter(models.PipelineStage.event_id == approval.event_id)
                .order_by(models.PipelineStage.order_index)
                .all()
            )
            current_idx = event.current_stage_index
            if current_idx < len(stages) - 1:
                current_stage = stages[current_idx]
                next_stage = stages[current_idx + 1]

                # Only create if no pending progression approval already exists
                existing_prog = db.query(models.Approval).filter(
                    models.Approval.event_id == approval.event_id,
                    models.Approval.type == models.ApprovalType.progression,
                    models.Approval.status == models.ApprovalStatus.pending,
                ).first()

                if not existing_prog:
                    db.add(models.Approval(
                        event_id=approval.event_id,
                        type=models.ApprovalType.progression,
                        status=models.ApprovalStatus.pending,
                        description=(
                            f"Team Formation complete — {len(team_ids)} teams approved. "
                            f"Ready to advance from '{current_stage.name}' → '{next_stage.name}'. "
                            f"Approve to unlock the next phase for all participants."
                        ),
                        payload={
                            "from_stage": current_stage.name,
                            "to_stage": next_stage.name,
                            "from_index": current_idx,
                            "to_index": current_idx + 1,
                        },
                    ))
                    db.add(models.ActivityLog(
                        event_id=approval.event_id,
                        message=f"Stage advance approval created: '{current_stage.name}' → '{next_stage.name}'",
                        log_type="info",
                    ))

    elif approval.type == models.ApprovalType.candidate_registration:
        # Auto-add the candidate as a participant when the approval is approved
        from ..auth import create_portal_token
        name = payload.get("name", "")
        email = payload.get("email", "")
        institution = payload.get("institution", "") or None
        level_str = payload.get("level", "Intermediate")
        skills_raw = payload.get("skills", "")
        skills = [s.strip() for s in skills_raw.split(",") if s.strip()] if skills_raw else []

        try:
            level = models.ParticipantLevel(level_str)
        except ValueError:
            level = models.ParticipantLevel.intermediate

        if name and email:
            existing = db.query(models.Participant).filter(
                models.Participant.event_id == approval.event_id,
                models.Participant.email == email,
            ).first()
            if not existing:
                participant = models.Participant(
                    event_id=approval.event_id,
                    name=name,
                    email=email,
                    institution=institution,
                    level=level,
                    skills=skills,
                    status=models.ParticipantStatus.active,
                )
                db.add(participant)
                db.flush()
                participant.portal_token = create_portal_token(participant.id)

