from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee
from ..schemas import ApprovalOut, ApprovalResolve, ApprovalCreate
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


@router.post("", response_model=ApprovalOut)
def create_approval(
    event_id: str,
    payload: ApprovalCreate,
    db: Session = Depends(get_db),
):
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

    if approval.type == models.ApprovalType.rule_change:
        # Pipeline reconfigured by agent — clear all old draft comms that don't
        # belong to the new pipeline stages
        pipeline_config = payload.get("pipeline_config", {})
        new_stage_names = {s["name"] for s in pipeline_config.get("stages", [])}
        if new_stage_names:
            # Delete drafts whose stage is NOT in the new pipeline
            old_drafts = db.query(models.Communication).filter(
                models.Communication.event_id == approval.event_id,
                models.Communication.status == models.CommStatus.draft,
            ).all()
            for comm in old_drafts:
                if comm.stage not in new_stage_names:
                    db.delete(comm)
            db.flush()

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

                # Auto-generate AI draft for the new stage if one doesn't exist yet
                try:
                    from .. import llm as _llm
                    stage_recipient_map = {
                        "Team Formation":     ("all_participants", "All Participants"),
                        "Evaluation":         ("all_participants", "All Participants"),
                        "Results":            ("all_participants", "All Participants"),
                        "Progression":        ("winners",          "Qualifying Teams"),
                    }
                    if next_stage.name in stage_recipient_map:
                        recipient_type, recipient_label = stage_recipient_map[next_stage.name]
                        # Only create if no unsent draft exists for this stage
                        existing_draft = db.query(models.Communication).filter(
                            models.Communication.event_id == approval.event_id,
                            models.Communication.stage == next_stage.name,
                            models.Communication.status == models.CommStatus.draft,
                        ).first()
                        if not existing_draft:
                            ev = db.query(models.Event).filter(models.Event.id == approval.event_id).first()
                            drafted = _llm.draft_communication(
                                stage=next_stage.name,
                                recipient_type=recipient_type,
                                event_name=ev.name if ev else "EventCraft",
                            )
                            if drafted.get("subject") and drafted.get("body") and not drafted["subject"].startswith("["):
                                db.add(models.Communication(
                                    event_id=approval.event_id,
                                    recipient=recipient_label,
                                    subject=drafted["subject"],
                                    body=drafted["body"],
                                    status=models.CommStatus.draft,
                                    stage=next_stage.name,
                                ))
                                db.add(models.ActivityLog(
                                    event_id=approval.event_id,
                                    message=f"AI draft generated for '{next_stage.name}' stage",
                                    log_type="info",
                                ))
                except Exception as e:
                    print(f"⚠️ Auto-draft error on stage advance: {e}")

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

