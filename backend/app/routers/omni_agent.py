import json
import re
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..config import settings
from .. import models, llm
from ..team_formation import form_teams as _form_teams
import asyncio

def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import sys
            if sys.version_info >= (3, 7):
                return asyncio.run_coroutine_threadsafe(coro, loop).result()
            else:
                return loop.run_until_complete(coro)
        else:
            return loop.run_until_complete(coro)
    except Exception:
        new_loop = asyncio.new_event_loop()
        try:
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()

router = APIRouter(prefix="/api/events/{event_id}/omni-agent", tags=["omni-agent"])

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class OmniMessageIn(BaseModel):
    content: str

class OmniMessageOut(BaseModel):
    id: str
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

class OmniChatResponse(BaseModel):
    reply: str
    message: OmniMessageOut
    action_result: Optional[Dict[str, Any]] = None

# ── Dependency: Authenticate and resolve caller role & context ───────────────

def get_current_omni_user(
    event_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_type = payload.get("type")

        # 1. Judge Portal User
        if token_type == "judge":
            invite_id = payload.get("invite_id")
            invitation = db.query(models.JudgeInvitation).filter(
                models.JudgeInvitation.id == invite_id,
                models.JudgeInvitation.is_revoked == False
            ).first()
            if not invitation:
                raise HTTPException(status_code=401, detail="Judge invitation is invalid or has been revoked")

            event = db.query(models.Event).filter(models.Event.id == event_id).first()
            if not event:
                raise HTTPException(status_code=404, detail="Event not found")

            criteria = []
            if event.pipeline_config and "evaluation_criteria" in event.pipeline_config:
                criteria = event.pipeline_config["evaluation_criteria"]
            elif event.pipeline_config and "scoring_weights" in event.pipeline_config:
                criteria = list(event.pipeline_config["scoring_weights"].keys())
            else:
                criteria = ["Innovation", "Execution", "Presentation", "Impact"]

            teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
            teams_info = []
            for t in teams:
                teams_info.append(f"- Team '{t.name}': Project title: '{t.project_title or 'N/A'}', description: '{t.project_description or 'N/A'}'")

            my_scores = db.query(models.EvaluationScore).filter(
                models.EvaluationScore.event_id == event_id,
                models.EvaluationScore.judge_email == payload.get("sub")
            ).all()
            scores_info = []
            for s in my_scores:
                team = db.query(models.Team).filter(models.Team.id == s.team_id).first()
                tname = team.name if team else "Unknown"
                scores_info.append(f"- Graded Team '{tname}': average score = {s.average:.1f}/10, notes: '{s.notes or ''}'")

            ctx = f"""Event Name: {event.name}
Dynamic Rubrics/Criteria: {', '.join(criteria)}
Submissions List:
{chr(10).join(teams_info) if teams_info else 'No team projects submitted yet.'}
Your Submitted Evaluations:
{chr(10).join(scores_info) if scores_info else 'You have not submitted any evaluations yet.'}"""

            return {
                "id": payload.get("sub"),
                "role": "judge",
                "name": invitation.judge_name,
                "email": invitation.judge_email,
                "context": ctx,
                "token": token,
            }

        # 2. Participant Portal User
        elif token_type == "portal":
            participant_id = payload.get("sub")
            p = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
            if not p or p.status != models.ParticipantStatus.active:
                raise HTTPException(status_code=401, detail="Participant portal token is invalid or inactive")

            event = db.query(models.Event).filter(models.Event.id == event_id).first()
            if not event:
                raise HTTPException(status_code=404, detail="Event not found")

            team_members = []
            team_details = "You are not currently in a team."
            if p.team_id:
                team = db.query(models.Team).filter(models.Team.id == p.team_id).first()
                if team:
                    team_details = f"Team Name: {team.name}, Project Title: '{team.project_title or 'Untitled'}', Description: '{team.project_description or 'No description yet'}'"
                    members = db.query(models.Participant).filter(models.Participant.team_id == p.team_id).all()
                    team_members = [f"{m.name} ({m.email})" for m in members]

            weights_str = "Standard equal weights (Innovation 25%, Execution 25%, Presentation 25%, Impact 25%)"
            if event.pipeline_config and "scoring_weights" in event.pipeline_config:
                weights = event.pipeline_config["scoring_weights"]
                weights_str = ", ".join(f"{k}: {int(v*100)}%" for k, v in weights.items())

            ctx = f"""Event Name: {event.name}
Your Profile: Name: {p.name}, Email: {p.email}, Affiliation: {p.institution or 'N/A'}, Level: {p.level.value if p.level else 'Intermediate'}
Your Team Details: {team_details}
Teammates: {', '.join(team_members) if team_members else 'None'}
Event Evaluation Weights: {weights_str}"""

            return {
                "id": p.id,
                "role": "participant",
                "name": p.name,
                "email": p.email,
                "context": ctx,
                "token": token,
            }

        # 3. Admin / Committee Portal User
        else:
            user_id = payload.get("sub")
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if not user or not user.is_active or user.role not in (models.UserRole.admin, models.UserRole.committee):
                raise HTTPException(status_code=401, detail="Invalid credentials")

            event = db.query(models.Event).filter(models.Event.id == event_id).first()
            if not event:
                raise HTTPException(status_code=404, detail="Event not found")

            total_p = db.query(models.Participant).filter(models.Participant.event_id == event_id).count()
            teams_count = db.query(models.Team).filter(models.Team.event_id == event_id).count()
            approvals_count = db.query(models.Approval).filter(
                models.Approval.event_id == event_id,
                models.Approval.status == models.ApprovalStatus.pending
            ).count()

            stages = db.query(models.PipelineStage).filter(models.PipelineStage.event_id == event_id).order_by(models.PipelineStage.order_index).all()
            stages_list = [f"Stage {s.order_index + 1}: '{s.name}' ({s.status.value})" for s in stages]

            current_stage = db.query(models.PipelineStage).filter(
                models.PipelineStage.event_id == event_id,
                models.PipelineStage.status == models.StageStatus.active
            ).first()
            current_stage_name = current_stage.name if current_stage else "None"

            # Also pull all score data for admin context
            scores = db.query(models.EvaluationScore).filter(
                models.EvaluationScore.event_id == event_id
            ).all()
            scores_lines = []
            for s in scores:
                team = db.query(models.Team).filter(models.Team.id == s.team_id).first()
                tname = team.name if team else "Unknown"
                scores_lines.append(
                    f"- Judge '{s.judge_name}' scored Team '{tname}': avg={s.average:.1f}/10 | breakdown={s.scores_json} | notes='{s.notes or ''}'"
                )

            ctx = f"""Event Name: {event.name}
Admin User: {user.name} ({user.email})
Current Active Stage: {current_stage_name} (Stage Index {event.current_stage_index})
Pipeline Flow:
{chr(10).join(stages_list) if stages_list else 'No stages initialized'}
Roster Metrics:
- Total registered participants: {total_p}
- Total formed teams: {teams_count}
- Pending approvals awaiting review: {approvals_count}
All Judge Scores:
{chr(10).join(scores_lines) if scores_lines else 'No evaluations submitted yet.'}"""

            return {
                "id": user.id,
                "role": "admin",
                "name": user.name,
                "email": user.email,
                "context": ctx,
                "token": token,
            }

    except JWTError:
        raise HTTPException(status_code=401, detail="Could not decode token")


# ── Action Executor (admin-only) ──────────────────────────────────────────────

def _execute_action(action_type: str, event_id: str, db: Session) -> Dict[str, Any]:
    """Execute a parsed action from the LLM reply."""

    if action_type == "form_teams":
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            return {"success": False, "error": "Event not found"}
        if event.current_stage_index > 1:
            return {"success": False, "error": "Cannot re-form teams — event has advanced past Team Formation stage."}

        approved_teams = db.query(models.Team).filter(
            models.Team.event_id == event_id,
            models.Team.status == models.TeamStatus.approved,
        ).count()
        if approved_teams > 0:
            return {"success": False, "error": "Teams have already been approved. Re-formation is not allowed."}

        participants = (
            db.query(models.Participant)
            .filter(
                models.Participant.event_id == event_id,
                models.Participant.status == models.ParticipantStatus.active,
                models.Participant.team_id.is_(None),
            )
            .all()
        )
        if len(participants) < 2:
            return {"success": False, "error": "Need at least 2 active participants to form teams."}

        rules = event.formation_rules or {}
        participant_dicts = [
            {
                "id": p.id,
                "name": p.name,
                "institution": p.institution or "",
                "level": p.level.value,
                "skills": p.skills or [],
            }
            for p in participants
        ]

        team_compositions = _form_teams(participant_dicts, rules)
        if not team_compositions:
            return {"success": False, "error": "Could not form any teams with the current rules."}

        # Clear existing proposed teams
        existing = (
            db.query(models.Team)
            .filter(models.Team.event_id == event_id, models.Team.status == models.TeamStatus.proposed)
            .all()
        )
        for t in existing:
            for member in t.members:
                member.team_id = None
            db.delete(t)
        db.flush()

        db.query(models.Approval).filter(
            models.Approval.event_id == event_id,
            models.Approval.type == models.ApprovalType.team_formation,
            models.Approval.status == models.ApprovalStatus.pending,
        ).delete()
        db.flush()

        created_teams = []
        for comp in team_compositions:
            team = models.Team(
                event_id=event_id,
                name=comp["name"],
                status=models.TeamStatus.proposed,
                rationale=f"Formed by AI Copilot via chat command.",
            )
            db.add(team)
            db.flush()
            for member_dict in comp["members"]:
                p = db.query(models.Participant).filter(models.Participant.id == member_dict["id"]).first()
                if p:
                    p.team_id = team.id
            created_teams.append({"name": team.name, "id": team.id, "member_count": len(comp["members"])})

        # Create approval
        approval = models.Approval(
            event_id=event_id,
            type=models.ApprovalType.team_formation,
            status=models.ApprovalStatus.pending,
            description=f"{len(created_teams)} teams proposed via AI Copilot chat command. Review and approve on the dashboard.",
            payload={"team_ids": [t["id"] for t in created_teams]},
        )
        db.add(approval)
        db.add(models.ActivityLog(
            event_id=event_id,
            message=f"AI Copilot triggered team formation — {len(created_teams)} teams proposed via chat",
            log_type="success",
        ))
        db.commit()
        return {
            "success": True,
            "action": "form_teams",
            "teams_formed": len(created_teams),
            "teams": created_teams,
            "message": f"✅ {len(created_teams)} teams have been proposed and sent for approval. Go to the Approvals page to review.",
        }

    elif action_type == "show_scores":
        scores = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.event_id == event_id
        ).all()
        if not scores:
            return {"success": True, "action": "show_scores", "scores": [], "message": "No evaluation scores have been submitted yet."}

        result = []
        for s in scores:
            team = db.query(models.Team).filter(models.Team.id == s.team_id).first()
            result.append({
                "team_name": team.name if team else "Unknown",
                "judge_name": s.judge_name,
                "judge_email": s.judge_email,
                "average": s.average,
                "scores": s.scores_json,
                "notes": s.notes or "",
                "is_anomaly": s.is_anomaly,
            })
        return {
            "success": True,
            "action": "show_scores",
            "scores": result,
            "message": f"📊 Found {len(result)} evaluation record(s) across all judges.",
        }

    elif action_type == "advance_stage":
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            return {"success": False, "error": "Event not found"}

        stages = (
            db.query(models.PipelineStage)
            .filter(models.PipelineStage.event_id == event_id)
            .order_by(models.PipelineStage.order_index)
            .all()
        )
        current_idx = event.current_stage_index
        if current_idx >= len(stages) - 1:
            return {"success": False, "error": "Already at the final pipeline stage."}

        current_stage = stages[current_idx]
        next_stage = stages[current_idx + 1]
        to_index = current_idx + 1

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

        event.current_stage_index = to_index
        if to_index >= 2:
            db.query(models.Team).filter(
                models.Team.event_id == event_id,
                models.Team.status == models.TeamStatus.proposed
            ).update({models.Team.status: models.TeamStatus.approved})

        # Auto-post polls when Evaluation stage is activated
        if next_stage.is_evaluation:
            config = (event.pipeline_config or {}).get("social_scraping", {})
            if config.get("enabled") and config.get("auto_post_on_evaluation"):
                from .social_scraping import post_all_polls
                from fastapi import BackgroundTasks
                bg = BackgroundTasks()
                asyncio.ensure_future(post_all_polls(event_id, bg, db))
                db.add(models.ActivityLog(
                    event_id=event_id,
                    message="Social Scraping: Auto-post triggered for Evaluation stage.",
                    log_type="info"
                ))

        db.add(models.ActivityLog(
            event_id=event_id,
            message=f"AI Copilot advanced pipeline: '{current_stage.name}' → '{next_stage.name}' via chat",
            log_type="success",
        ))
        db.commit()
        return {
            "success": True,
            "action": "advance_stage",
            "from_stage": current_stage.name,
            "to_stage": next_stage.name,
            "message": f"⚡ Pipeline advanced from **{current_stage.name}** to **{next_stage.name}**.",
        }

    elif action_type == "approve_formation":
        approval = db.query(models.Approval).filter(
            models.Approval.event_id == event_id,
            models.Approval.type == models.ApprovalType.team_formation,
            models.Approval.status == models.ApprovalStatus.pending,
        ).first()
        if not approval:
            return {"success": False, "error": "No pending team formation approval found."}

        approval.status = models.ApprovalStatus.approved
        approval.resolved_at = datetime.utcnow()
        approval.resolved_by = "AI Copilot (Chat Command)"

        # Approve all proposed teams
        db.query(models.Team).filter(
            models.Team.event_id == event_id,
            models.Team.status == models.TeamStatus.proposed,
        ).update({models.Team.status: models.TeamStatus.approved})

        db.add(models.ActivityLog(
            event_id=event_id,
            message="AI Copilot approved team formation via chat command",
            log_type="success",
        ))
        db.commit()
        return {
            "success": True,
            "action": "approve_formation",
            "message": "✅ Team formation has been approved. All proposed teams are now active.",
        }

    elif action_type == "generate_polls":
        from .social_scraping import generate_draft_polls
        from fastapi import BackgroundTasks
        bg = BackgroundTasks()
        try:
            res = run_async(generate_draft_polls(event_id, bg, db))
            return {"success": True, "action": "generate_polls", "message": f"✅ Social media poll drafts generated for all teams."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif action_type == "post_polls":
        from .social_scraping import post_all_polls
        from fastapi import BackgroundTasks
        bg = BackgroundTasks()
        try:
            res = run_async(post_all_polls(event_id, bg, db))
            return {"success": True, "action": "post_polls", "message": f"✅ Social polls posted successfully: {res['posted']} posted, {res['failed']} failed, {res['manual']} manual pending."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif action_type == "fetch_poll_results":
        from .social_scraping import fetch_polls_results
        from fastapi import BackgroundTasks
        bg = BackgroundTasks()
        try:
            res = run_async(fetch_polls_results(event_id, bg, db))
            return {"success": True, "action": "fetch_poll_results", "message": f"✅ Social polls fetching completed. Fetched: {res['fetched']}, Manual pending: {res['manual_pending']}."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif action_type == "calculate_social_scores":
        from .social_scraping import calculate_social_scores
        from fastapi import BackgroundTasks
        bg = BackgroundTasks()
        try:
            res = run_async(calculate_social_scores(event_id, bg, db))
            return {"success": True, "action": "calculate_social_scores", "message": f"✅ Social scoring calculation completed. Updated {res['teams_updated']} teams."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif action_type == "social_status":
        polls = db.query(models.SocialPoll).filter(models.SocialPoll.event_id == event_id).all()
        total = len(polls)
        drafts = len([p for p in polls if p.status == models.SocialPollStatus.draft])
        posted = len([p for p in polls if p.status == models.SocialPollStatus.posted])
        completed = len([p for p in polls if p.status == models.SocialPollStatus.completed])
        flagged = len([p for p in polls if p.flagged])
        manual = len([p for p in polls if p.manual_pending])
        
        msg = (
            f"Social Scraping Campaign Status:\n"
            f"- Total polls: {total}\n"
            f"- Drafts: {drafts} | Posted: {posted} | Completed: {completed}\n"
            f"- Flagged: {flagged} | Awaiting Manual Votes: {manual}"
        )
        return {"success": True, "action": "social_status", "message": msg}

    return {"success": False, "error": f"Unknown action type: {action_type}"}


def _parse_action(reply: str) -> Optional[str]:
    """Extract action type from [[[ACTION: {...}]]] block in LLM reply."""
    pattern = r'\[\[\[ACTION:\s*(\{.*?\})\s*\]\]\]'
    match = re.search(pattern, reply, re.DOTALL)
    if match:
        try:
            action_data = json.loads(match.group(1))
            return action_data.get("type")
        except json.JSONDecodeError:
            pass
    return None


def _strip_action_block(reply: str) -> str:
    """Remove the [[[ACTION: {...}]]] block from the reply text."""
    pattern = r'\s*\[\[\[ACTION:\s*\{.*?\}\s*\]\]\]'
    return re.sub(pattern, '', reply, flags=re.DOTALL).strip()


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/history", response_model=List[OmniMessageOut])
def get_omni_history(
    event_id: str,
    db: Session = Depends(get_db),
    user_ctx: Dict[str, Any] = Depends(get_current_omni_user),
):
    return (
        db.query(models.AgentMessage)
        .filter(
            models.AgentMessage.event_id == event_id,
            models.AgentMessage.user_id == user_ctx["id"],
            models.AgentMessage.user_role == user_ctx["role"]
        )
        .order_by(models.AgentMessage.created_at)
        .all()
    )

@router.post("/chat", response_model=OmniChatResponse)
def chat_omni(
    event_id: str,
    payload: OmniMessageIn,
    db: Session = Depends(get_db),
    user_ctx: Dict[str, Any] = Depends(get_current_omni_user),
):
    # Load chat history
    history_records = (
        db.query(models.AgentMessage)
        .filter(
            models.AgentMessage.event_id == event_id,
            models.AgentMessage.user_id == user_ctx["id"],
            models.AgentMessage.user_role == user_ctx["role"]
        )
        .order_by(models.AgentMessage.created_at)
        .all()
    )

    history = [
        {"role": m.role, "content": m.content}
        for m in history_records
    ]

    # Invoke LLM
    raw_reply = llm.omni_agent_chat(
        role=user_ctx["role"],
        context=user_ctx["context"],
        history=history,
        new_message=payload.content
    )

    # Parse and execute any action block (admin only)
    action_result = None
    display_reply = raw_reply

    if user_ctx["role"] == "admin":
        action_type = _parse_action(raw_reply)
        if action_type:
            event = db.query(models.Event).filter(models.Event.id == event_id).first()
            is_completed = event.is_completed if event else False
            
            if is_completed and action_type not in ("show_scores", "social_status"):
                display_reply = _strip_action_block(raw_reply)
                action_result = {
                    "success": False,
                    "error": "This event is completed and locked. State changes cannot be applied.",
                    "message": "⚠️ This event is completed and locked. State changes cannot be applied."
                }
                display_reply = display_reply + "\n\n" + action_result["message"]
            else:
                action_result = _execute_action(action_type, event_id, db)
                display_reply = _strip_action_block(raw_reply)
                if action_result.get("message"):
                    display_reply = display_reply + "\n\n" + action_result["message"]

    # Save to history database
    user_msg = models.AgentMessage(
        event_id=event_id,
        user_id=user_ctx["id"],
        user_role=user_ctx["role"],
        role="user",
        content=payload.content
    )
    assistant_msg = models.AgentMessage(
        event_id=event_id,
        user_id=user_ctx["id"],
        user_role=user_ctx["role"],
        role="assistant",
        content=display_reply
    )
    db.add(user_msg)
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    return OmniChatResponse(
        reply=display_reply,
        message=OmniMessageOut.from_orm(assistant_msg),
        action_result=action_result,
    )
