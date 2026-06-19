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
from ..guards import require_event_not_completed
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
    pipeline_configured = result["pipeline_ready"]
    if pipeline_configured and result["pipeline_config"]:
        if event.is_completed:
            assistant_msg.content += "\n\n*(Note: This event is completed and locked. Configuration changes cannot be applied.)*"
            pipeline_configured = False
        else:
            config = result["pipeline_config"]
            
            # Enforce first 2 stages are Participant Intake and Team Formation if not mentioned
            stages = config.get("stages", [])
            has_intake = any("participant intake" in s.get("name", "").lower() for s in stages)
            has_team_formation = any("team formation" in s.get("name", "").lower() for s in stages)
            stages_to_prepend = []
            if not has_intake:
                stages_to_prepend.append({
                    "name": "Participant Intake",
                    "description": "Register and verify all participants, collect skill declarations.",
                    "tasks": ["Open registration portal", "Collect participant profiles", "Verify eligibility", "Approve roster"],
                    "allows_submission": False,
                    "is_evaluation": False,
                    "portal_description": "Registration is open. Your profile has been received.",
                })
            if not has_team_formation:
                stages_to_prepend.append({
                    "name": "Team Formation",
                    "description": "Form balanced teams based on skills and institutional diversity.",
                    "tasks": ["Configure formation rules", "Run AI team formation", "Review proposed teams", "Approve compositions"],
                    "allows_submission": False,
                    "is_evaluation": False,
                    "portal_description": "Teams are being formed. You'll receive an email once your team assignment is confirmed.",
                })
            if stages_to_prepend:
                config["stages"] = stages_to_prepend + stages

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
        pipeline_configured=pipeline_configured,
        pipeline_config=result.get("pipeline_config"),
        needs_clarification=result["needs_clarification"],
    )


def _apply_full_config(event: models.Event, config: dict, db: Session):
    """
    Stage the agent configuration as a pending approval.
    Nothing is applied to the pipeline until the committee approves.
    Only saves: formation rules preview, draft comms, and the approval gate.
    """
    # Validate social config
    social_cfg = config.get("social_scraping", {})
    if social_cfg:
        enabled = social_cfg.get("enabled", False)
        poll_type = social_cfg.get("poll_type", "hybrid")
        if enabled:
            if poll_type not in ("rating", "comparative", "hybrid"):
                raise HTTPException(status_code=400, detail="social_scraping.poll_type must be rating, comparative, or hybrid")
            # Validate scoring_balance weights
            sb = config.get("scoring_balance", {})
            judge = sb.get("judge", 0.0)
            peer = sb.get("peer", 0.0)
            social = sb.get("social", 0.0)
            if abs(judge + peer + social - 1.0) > 0.001:
                raise HTTPException(status_code=400, detail="scoring_balance weights must sum to exactly 1.0")
            if social <= 0.0:
                raise HTTPException(status_code=400, detail="scoring_balance social weight must be greater than 0.0 when social scraping is enabled")

    event_id = event.id

    # Save pipeline config preview on event (but don't create stages yet)
    event.pipeline_config = config
    if "description" in config:
        event.description = config["description"]

    # Update formation rules preview
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

    stages = config.get("stages", [])
    criteria = config.get("evaluation_criteria", ["Innovation", "Execution", "Presentation", "Impact"])

    # Remove old draft comms — new pipeline proposal = fresh drafts
    db.query(models.Communication).filter(
        models.Communication.event_id == event_id,
        models.Communication.status == models.CommStatus.draft,
    ).delete(synchronize_session=False)
    db.flush()

    # Auto-generate draft communications (so committee can review before approving)
    comm_stages_raw = config.get("communication_stages", [s["name"] for s in stages])
    comm_stage_entries = []
    for entry in comm_stages_raw:
        if isinstance(entry, dict):
            comm_stage_entries.append((entry["stage"], entry.get("recipient_type", "all_participants")))
        else:
            stage_lower = str(entry).lower()
            if any(w in stage_lower for w in ["eval", "judg", "scor"]):
                comm_stage_entries.append((entry, "judges"))
            comm_stage_entries.append((entry, "all_participants"))

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

    # Create approval gate — pipeline stages are NOT built until this is approved
    db.add(models.Approval(
        event_id=event_id,
        type=models.ApprovalType.rule_change,
        status=models.ApprovalStatus.pending,
        description=(
            f"AI Agent configured a new pipeline with {len(stages)} stages: "
            f"{', '.join(s['name'] for s in stages)}. "
            f"Team size: {config.get('formation_rules', {}).get('team_size', 3)}. "
            f"Evaluation criteria: {', '.join(criteria)}. "
            f"Review and approve to activate this pipeline."
        ),
        payload={"pipeline_config": config},
    ))

    db.add(models.ActivityLog(
        event_id=event_id,
        message=(
            f"AI Agent proposed pipeline: {len(stages)} stages, "
            f"team size {config.get('formation_rules', {}).get('team_size', 3)}, "
            f"criteria: {', '.join(criteria)} — pending approval"
        ),
        log_type="info",
    ))
    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Auto-generated {len(unique_entries)} draft communications — review before sending",
        log_type="info",
    ))


@router.delete("/history")
def clear_history(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    require_event_not_completed(event_id, db)
    db.query(models.AgentMessage).filter(
        models.AgentMessage.event_id == event_id
    ).delete()
    db.commit()
    return {"message": "Chat history cleared"}
