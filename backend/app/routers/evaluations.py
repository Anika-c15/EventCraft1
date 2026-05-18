"""
Evaluations router.

Two access modes:
  1. Committee (JWT bearer token) — full access, list/consolidate/guides
  2. Judge (signed link token)    — submit scores only, no account needed
     URL: /api/events/{event_id}/evaluations/judge-portal?token=<jwt>
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..auth import require_committee, create_judge_token, decode_judge_token
from ..schemas import ScoreSubmit, EvaluationScoreOut
from ..config import settings
from .. import models, llm
from ..ws import broadcast

router = APIRouter(prefix="/api/events/{event_id}/evaluations", tags=["evaluations"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_average(scores: dict) -> float:
    if not scores:
        return 0.0
    return round(sum(scores.values()) / len(scores), 2)


def _check_anomaly(new_avg: float, team_id: str, db: Session, threshold: float) -> bool:
    existing = db.query(models.EvaluationScore).filter(
        models.EvaluationScore.team_id == team_id
    ).all()
    if not existing:
        return False
    panel_avg = sum(s.average or 0 for s in existing) / len(existing)
    return abs(new_avg - panel_avg) > threshold


def _save_score(event_id: str, payload: ScoreSubmit, db: Session, background_tasks: BackgroundTasks):
    """Core score-saving logic shared by committee and judge endpoints."""
    team = db.query(models.Team).filter(
        models.Team.id == payload.team_id,
        models.Team.event_id == event_id,
    ).first()
    if not team:
        raise HTTPException(404, "Team not found in this event")

    avg = _compute_average(payload.scores)
    is_anomaly = _check_anomaly(avg, payload.team_id, db, settings.ANOMALY_THRESHOLD)

    score = models.EvaluationScore(
        team_id=payload.team_id,
        event_id=event_id,
        judge_name=payload.judge_name,
        judge_email=payload.judge_email,
        scores_json=payload.scores,
        notes=payload.notes,
        average=avg,
        is_anomaly=is_anomaly,
    )
    db.add(score)

    if is_anomaly:
        existing = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.team_id == payload.team_id
        ).all()
        panel_avg = sum(s.average or 0 for s in existing) / len(existing) if existing else avg

        db.add(models.Approval(
            event_id=event_id,
            type=models.ApprovalType.score_override,
            status=models.ApprovalStatus.pending,
            description=(
                f"Score anomaly detected for {team.name}. "
                f"Judge '{payload.judge_name}' submitted {avg:.1f}/10 vs panel average of {panel_avg:.1f}/10. "
                f"Deviation: {abs(avg - panel_avg):.1f} points (threshold: {settings.ANOMALY_THRESHOLD}). "
                f"Results are on hold until you review this divergence."
            ),
            payload={"team_id": payload.team_id, "judge_name": payload.judge_name,
                     "judge_score": avg, "panel_avg": panel_avg},
        ))
        db.add(models.ActivityLog(
            event_id=event_id,
            message=f"⚠️ Score anomaly: {team.name} — {payload.judge_name} ({avg:.1f} vs panel {panel_avg:.1f})",
            log_type="warning",
        ))
    else:
        db.add(models.ActivityLog(
            event_id=event_id,
            message=f"Score submitted: {team.name} by {payload.judge_name} — {avg:.1f}/10",
            log_type="success",
        ))

    db.commit()
    db.refresh(score)

    background_tasks.add_task(broadcast, event_id, {
        "type": "anomaly_flagged" if is_anomaly else "score_submitted",
        "team_id": payload.team_id,
        "team_name": team.name,
        "judge_name": payload.judge_name,
        "average": avg,
        "is_anomaly": is_anomaly,
    })

    return score


# ── Committee endpoints ────────────────────────────────────────────────────────

@router.get("", response_model=List[EvaluationScoreOut])
def list_scores(
    event_id: str,
    team_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    q = db.query(models.EvaluationScore).filter(models.EvaluationScore.event_id == event_id)
    if team_id:
        q = q.filter(models.EvaluationScore.team_id == team_id)
    return q.order_by(models.EvaluationScore.submitted_at.desc()).all()


@router.post("", response_model=EvaluationScoreOut)
async def submit_score_committee(
    event_id: str,
    payload: ScoreSubmit,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Committee/admin score submission — no auth required for demo convenience."""
    return _save_score(event_id, payload, db, background_tasks)


@router.post("/consolidate")
def consolidate_scores(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    unresolved = db.query(models.Approval).filter(
        models.Approval.event_id == event_id,
        models.Approval.type == models.ApprovalType.score_override,
        models.Approval.status == models.ApprovalStatus.pending,
    ).count()
    if unresolved > 0:
        raise HTTPException(400, f"Cannot consolidate: {unresolved} unresolved score anomalies.")

    teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    scored_teams = []

    for team in teams:
        scores = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.team_id == team.id
        ).all()
        if scores:
            final = round(sum(s.average or 0 for s in scores) / len(scores), 2)
            team.final_score = final
            scored_teams.append({"id": team.id, "name": team.name, "score": final})

    scored_teams.sort(key=lambda x: x["score"], reverse=True)
    for i, t in enumerate(scored_teams):
        team = db.query(models.Team).filter(models.Team.id == t["id"]).first()
        if team:
            team.rank = i + 1
            t["rank"] = i + 1

    top_teams = scored_teams[:5] if len(scored_teams) >= 5 else scored_teams
    db.add(models.Approval(
        event_id=event_id,
        type=models.ApprovalType.progression,
        status=models.ApprovalStatus.pending,
        description=(
            f"All evaluator scores received. Consolidation complete. "
            f"Progression invitations drafted for the top {len(top_teams)} teams — approve to send."
        ),
        payload={"top_teams": top_teams},
    ))
    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Scores consolidated — {len(scored_teams)} teams ranked",
        log_type="success",
    ))
    db.commit()
    return {"message": "Scores consolidated", "rankings": scored_teams}


@router.get("/assessment-guide/{team_id}")
def get_assessment_guide(
    event_id: str,
    team_id: str,
    db: Session = Depends(get_db),
):
    team = db.query(models.Team).filter(
        models.Team.id == team_id, models.Team.event_id == event_id
    ).first()
    if not team:
        raise HTTPException(404, "Team not found")

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    pipeline_config = event.pipeline_config or {}
    criteria = pipeline_config.get("evaluation_criteria", ["Innovation", "Execution", "Presentation", "Impact"])

    guide = llm.generate_assessment_guide(
        event_name=event.name,
        team_name=team.name,
        challenge=team.challenge,
        criteria=criteria,
    )
    return {"team_id": team_id, "team_name": team.name, "guide": guide}


# ── Judge link-based access (no account required) ─────────────────────────────

class JudgeInviteRequest(BaseModel):
    judge_name: str
    judge_email: str


@router.post("/invite-judge")
def invite_judge(
    event_id: str,
    payload: JudgeInviteRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """
    Generate a signed JWT link for a judge.
    The judge clicks the link and can submit scores without creating an account.
    """
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    token = create_judge_token(payload.judge_email, event_id)
    portal_url = f"{settings.FRONTEND_URL}/judge/{event_id}?token={token}"

    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Judge invite generated for {payload.judge_name} ({payload.judge_email})",
        log_type="info",
    ))
    db.commit()

    return {
        "judge_name": payload.judge_name,
        "judge_email": payload.judge_email,
        "portal_url": portal_url,
        "token": token,
        "message": f"Share this link with {payload.judge_name}: {portal_url}",
    }


@router.get("/judge-portal")
def get_judge_portal(
    event_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Public endpoint — validates judge token and returns event/team data
    needed to render the judge scoring portal.
    No account required.
    """
    judge_data = decode_judge_token(token)
    if not judge_data or judge_data["event_id"] != event_id:
        raise HTTPException(401, "Invalid or expired judge link")

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    teams = db.query(models.Team).filter(
        models.Team.event_id == event_id,
        models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active]),
    ).all()

    # Check which teams this judge has already scored
    already_scored = db.query(models.EvaluationScore).filter(
        models.EvaluationScore.event_id == event_id,
        models.EvaluationScore.judge_email == judge_data["email"],
    ).all()
    scored_team_ids = {s.team_id for s in already_scored}

    pipeline_config = event.pipeline_config or {}
    criteria = pipeline_config.get(
        "evaluation_criteria", ["Innovation", "Execution", "Presentation", "Impact"]
    )

    return {
        "event_name": event.name,
        "judge_email": judge_data["email"],
        "criteria": criteria,
        "teams": [
            {
                "id": t.id,
                "name": t.name,
                "members": [{"name": m.name, "institution": m.institution, "skills": m.skills}
                             for m in t.members],
                "already_scored": t.id in scored_team_ids,
            }
            for t in teams
        ],
    }


@router.post("/judge-submit")
async def judge_submit_score(
    event_id: str,
    payload: ScoreSubmit,
    background_tasks: BackgroundTasks,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Public score submission via judge link token.
    No account required — token IS the credential.
    """
    judge_data = decode_judge_token(token)
    if not judge_data or judge_data["event_id"] != event_id:
        raise HTTPException(401, "Invalid or expired judge link")

    # Enforce judge email from token (can't spoof)
    payload.judge_email = judge_data["email"]

    return _save_score(event_id, payload, db, background_tasks)
