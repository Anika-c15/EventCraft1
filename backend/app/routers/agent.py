"""
Dynamic Event Configuration via Conversational Agent.
Committee describes their event in natural language; Gemini configures the pipeline.
"""
from typing import List
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

    # Load chat history for Gemini
    history_records = (
        db.query(models.AgentMessage)
        .filter(models.AgentMessage.event_id == event_id)
        .order_by(models.AgentMessage.created_at)
        .all()
    )

    # Convert to Gemini format
    gemini_history = [
        {"role": "user" if m.role == "user" else "model", "parts": m.content}
        for m in history_records
    ]

    # Call LLM agent
    result = llm.agent_chat(gemini_history, payload.content)

    # Save user message
    user_msg = models.AgentMessage(
        event_id=event_id,
        role="user",
        content=payload.content,
    )
    db.add(user_msg)

    # Save assistant reply
    assistant_msg = models.AgentMessage(
        event_id=event_id,
        role="assistant",
        content=result["reply"],
    )
    db.add(assistant_msg)

    # If pipeline is ready, apply it to the event
    if result["pipeline_ready"] and result["pipeline_config"]:
        config = result["pipeline_config"]
        event.pipeline_config = config

        # Update formation rules if provided
        if "formation_rules" in config:
            event.formation_rules = config["formation_rules"]

        # Rebuild pipeline stages from agent config
        existing_stages = db.query(models.PipelineStage).filter(
            models.PipelineStage.event_id == event_id
        ).all()
        for s in existing_stages:
            db.delete(s)
        db.flush()

        for i, stage_def in enumerate(config.get("stages", [])):
            stage = models.PipelineStage(
                event_id=event_id,
                name=stage_def["name"],
                description=stage_def.get("description", ""),
                order_index=i,
                status=models.StageStatus.active if i == 0 else models.StageStatus.pending,
                tasks=stage_def.get("tasks", []),
            )
            db.add(stage)

        event.current_stage_index = 0

        log = models.ActivityLog(
            event_id=event_id,
            message="Dynamic pipeline configured via conversational agent",
            log_type="success",
        )
        db.add(log)

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
