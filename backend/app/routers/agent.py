"""
Dynamic Event Configuration via Conversational Agent.
When the agent has enough info, it:
1. Configures the pipeline stages
2. Sets formation rules
3. Auto-generates draft communications for every stage
4. Creates an activity log entry
"""
from typing import List
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from ..database import get_db
from ..auth import require_committee
from ..schemas import AgentMessageIn, AgentMessageOut, AgentChatResponse
from .. import models, llm

router = APIRouter(prefix="/api/events/{event_id}/agent", tags=["agent"])


@router.get("/history", response_model=List[AgentMessageOut])
def get_history(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    return (
        db.query(models.AgentMessage)
        .filter(models.AgentMessage.event_id == event_id)
        .order_by(models.AgentMessage.created_at)
        .all()
    )


@router.post("/chat", response_model=AgentChatResponse)
def chat(
    event_id: str,
    payload: AgentMessageIn,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    # Load chat history
    history_records = (
        db.query(models.AgentMessage)
        .filter(models.AgentMessage.event_id == event_id)
        .order_by(models.AgentMessage.created_at)
        .all()
    )

    chat_history = [
        {"role": "user" if m.role == "user" else "assistant", "parts": m.content}
        for m in history_records
    ]

    # Call LLM
    result = llm.agent_chat(chat_history, payload.content)

    # Save messages
    db.add(models.AgentMessage(event_id=event_id, role="user", content=payload.content))
    assistant_msg = models.AgentMessage(
        event_id=event_id, role="assistant", content=result["reply"]
    )
    db.add(assistant_msg)

    # ── Apply full configuration when pipeline is ready ────────────────────────
    if result["pipeline_ready"] and result["pipeline_config"]:
        config = result["pipeline_config"]
        _apply_full_config(event, config, db)

    db.commit()
    db.refresh(assistant_msg)

    return AgentChatResponse(
        message=AgentMessageOut(
            id=assistant_msg.id,
            role=assistant_msg.role,
            content=assistant_msg.content,
            created_at=assistant_msg.created_at,
        ),
        pipeline_configured=result["pipeline_ready"],
        pipeline_config=result.get("pipeline_config"),
        needs_clarification=result["needs_clarification"],
    )


def _apply_full_config(event: models.Event, config: dict, db: Session):
    """
    Apply the full agent configuration:
    - Rebuild pipeline stages
    - Update formation rules
    - Auto-generate draft communications for each stage
    - Create approval gate
    - Log activity
    """
    event_id = event.id

    # 1. Save pipeline config
    event.pipeline_config = config

    # 2. Update formation rules
    if "formation_rules" in config:
        fr = config["formation_rules"]
        event.formation_rules = {
            "event_name": event.name,
            "team_size": fr.get("team_size", 3),
            "allow_incomplete_teams": fr.get("allow_incomplete_teams", False),
            "skill_balance": fr.get("skill_balance", True),
            "institution_diversity": fr.get("institution_diversity", True),
            "max_per_institution": fr.get("max_per_institution", 1),
            "experience_level_grouping": fr.get("experience_level_grouping", "mixed"),
            "max_teams": fr.get("max_teams", 10),
        }

    # 3. Rebuild pipeline stages
    existing = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == event_id
    ).all()
    for s in existing:
        db.delete(s)
    db.flush()

    stages = config.get("stages", [])
    for i, stage_def in enumerate(stages):
        db.add(models.PipelineStage(
            event_id=event_id,
            name=stage_def["name"],
            description=stage_def.get("description", ""),
            order_index=i,
            status=models.StageStatus.active if i == 0 else models.StageStatus.pending,
            tasks=stage_def.get("tasks", []),
            allows_submission=stage_def.get("allows_submission", False),
            is_evaluation=stage_def.get("is_evaluation", False),
            portal_description=stage_def.get("portal_description", None),
        ))

    event.current_stage_index = 0

    from .events import clear_event_teams_and_submissions
    clear_event_teams_and_submissions(event_id, db)

    # 4. Auto-generate draft communications for each stage
    # Remove ALL old draft communications for this event — new pipeline = fresh comms
    # Keep only already-sent communications so history is preserved
    db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.status == models.CommStatus.draft,
    ).delete(synchronize_session=False)
    db.flush()

    criteria = config.get("evaluation_criteria", ["Innovation", "Execution", "Presentation", "Impact"])
    comm_stages_raw = config.get("communication_stages", [s["name"] for s in stages])

    # Support both old format (list of strings) and new format (list of dicts)
    comm_stage_entries = []
    for entry in comm_stages_raw:
        if isinstance(entry, dict):
            comm_stage_entries.append((entry["stage"], entry.get("recipient_type", "all_participants")))
        else:
            # Old string format — infer recipient type
            stage_lower = str(entry).lower()
            if any(w in stage_lower for w in ["eval", "judg", "scor"]):
                comm_stage_entries.append((entry, "judges"))
            comm_stage_entries.append((entry, "all_participants"))

    # Deduplicate while preserving order
    seen = set()
    unique_entries = []
    for stage_name, recipient_type in comm_stage_entries:
        key = (stage_name, recipient_type)
        if key not in seen:
            seen.add(key)
            unique_entries.append(key)

    for stage_name, recipient_type in unique_entries:
        recipient_label = {
            "all_participants": "All Participants",
            "judges": "Judges Panel",
            "winners": "Qualifying Teams",
        }.get(recipient_type, recipient_type.replace("_", " ").title())

        drafted = llm.draft_communication(
            stage=stage_name,
            recipient_type=recipient_type,
            event_name=event.name,
            extra_context=f"Evaluation criteria: {', '.join(criteria)}",
        )
        db.add(models.Communication(
            event_id=event_id,
            recipient=recipient_label,
            subject=drafted["subject"],
            body=drafted["body"],
            status=models.CommStatus.draft,
            stage=stage_name,
        ))

    # 5. Create approval gate for the new pipeline
    db.add(models.Approval(
        event_id=event_id,
        type=models.ApprovalType.rule_change,
        status=models.ApprovalStatus.pending,
        description=(
            f"AI Agent configured a new pipeline with {len(stages)} stages: "
            f"{', '.join(s['name'] for s in stages)}. "
            f"Team size: {config.get('formation_rules', {}).get('team_size', 3)}. "
            f"Evaluation criteria: {', '.join(criteria)}. "
            f"Review and approve to activate this configuration."
        ),
        payload={"pipeline_config": config},
    ))

    # 6. Activity log
    db.add(models.ActivityLog(
        event_id=event_id,
        message=(
            f"AI Agent configured pipeline: {len(stages)} stages, "
            f"team size {config.get('formation_rules', {}).get('team_size', 3)}, "
            f"criteria: {', '.join(criteria)}"
        ),
        log_type="success",
    ))
    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Auto-generated {len(unique_entries)} draft communications from agent config",
        log_type="info",
    ))


@router.delete("/history")
def clear_history(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    db.query(models.AgentMessage).filter(
        models.AgentMessage.event_id == event_id
    ).delete()
    db.commit()
    return {"message": "Chat history cleared"}
