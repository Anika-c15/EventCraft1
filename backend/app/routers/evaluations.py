"""
Evaluations router.

Two access modes:
  1. Committee (JWT bearer token) — full access, list/consolidate/guides
  2. Judge (signed link token)    — submit scores only, no account needed
     URL: /api/events/{event_id}/evaluations/judge-portal?token=<jwt>
"""
from typing import List, Optional
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..auth import require_committee, create_judge_token, decode_judge_token
from ..schemas import ScoreSubmit, EvaluationScoreOut, PublicVoteInput, LockScoreRequest
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


def _recompute_combined_public(team: models.Team, db: Session) -> None:
    """
    Recompute the combined public_vote_score:
        combined = avg(social_vote_score, peer_avg)
    whichever components are available.  Updates team in-place; caller must commit.
    """
    peer_reviews = db.query(models.PeerReview).filter(
        models.PeerReview.to_team_id == team.id
    ).all()
    peer_avg: Optional[float] = None
    if peer_reviews:
        peer_avg = sum(r.score for r in peer_reviews) / len(peer_reviews)

    social = team.social_vote_score

    if social is not None and peer_avg is not None:
        team.public_vote_score = round((social + peer_avg) / 2, 2)
    elif peer_avg is not None:
        team.public_vote_score = round(peer_avg, 2)
    elif social is not None:
        team.public_vote_score = round(social, 2)


def _enforce_evaluations_active(event_id: str, db: Session):
    stages = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == event_id
    ).order_by(models.PipelineStage.order_index).all()

    active_stage = next((s for s in stages if s.status == models.StageStatus.active), None)
    if not active_stage:
        raise HTTPException(400, "No active stage found for this event")

    eval_stages = [s for s in stages if s.is_evaluation]
    if not eval_stages:
        eval_stages = [s for s in stages if any(kw in s.name.lower() for kw in ("eval", "judg", "scor", "peer", "review", "voting"))]

    if eval_stages:
        first_eval_idx = min(s.order_index for s in eval_stages)
        last_eval_idx = max(s.order_index for s in eval_stages)

        if active_stage.order_index < first_eval_idx:
            raise HTTPException(400, f"Evaluations are not open yet. Current stage is '{active_stage.name}'.")
        elif active_stage.order_index > last_eval_idx:
            raise HTTPException(400, "Evaluations are closed because the event has advanced past the Evaluation phase.")
    else:
        if active_stage.name.lower() in ("results", "progression"):
            raise HTTPException(400, "Evaluations are closed because the event has advanced past the Evaluation phase.")


def _save_score(event_id: str, payload: ScoreSubmit, db: Session, background_tasks: BackgroundTasks):
    """Core score-saving logic shared by committee and judge endpoints."""
    _enforce_evaluations_active(event_id, db)

    team = db.query(models.Team).filter(
        models.Team.id == payload.team_id,
        models.Team.event_id == event_id,
    ).first()
    if not team:
        raise HTTPException(404, "Team not found in this event")

    if team.submission_status != "Submitted":
        raise HTTPException(400, "Cannot submit score: this team has not submitted its project yet")

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

    # Fetch scoring weights
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    weights = event.scoring_weights or {"judge": 0.70, "peer": 0.15, "social": 0.15} if event else {"judge": 0.70, "peer": 0.15, "social": 0.15}
    w_judge = weights.get("judge", 0.70)
    w_peer = weights.get("peer", 0.15)
    w_social = weights.get("social", 0.15)

    teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    scored_teams = []

    for team in teams:
        scores = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.team_id == team.id
        ).all()
        if scores:
            judge_avg = round(sum(s.average or 0 for s in scores) / len(scores), 2)
            
            # Peer review average
            peer_reviews = db.query(models.PeerReview).filter(
                models.PeerReview.to_team_id == team.id
            ).all()
            peer_avg = sum(r.score for r in peer_reviews) / len(peer_reviews) if peer_reviews else None

            social = team.social_vote_score

            # Dynamically compute composite score based on active elements
            active_weights = []
            weighted_terms = []
            if judge_avg is not None:
                active_weights.append(w_judge)
                weighted_terms.append(w_judge * judge_avg)
            if peer_avg is not None:
                active_weights.append(w_peer)
                weighted_terms.append(w_peer * peer_avg)
            if social is not None:
                active_weights.append(w_social)
                weighted_terms.append(w_social * social)

            final = judge_avg
            if active_weights and sum(active_weights) > 0:
                final = round(sum(weighted_terms) / sum(active_weights), 2)

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

    # Build full member context
    members = [
        {
            "name": m.name,
            "institution": m.institution or "Unknown",
            "level": m.level.value if hasattr(m.level, 'value') else str(m.level),
            "skills": m.skills or [],
        }
        for m in team.members
    ]

    guide = llm.generate_assessment_guide(
        event_name=event.name,
        event_description=event.description or "",
        team_name=team.name,
        project_title=team.project_title or "",
        project_description=team.project_description or "",
        github_url=team.github_url or team.github_link or "",
        challenge=team.challenge,
        members=members,
        criteria=criteria,
    )
    return {"team_id": team_id, "team_name": team.name, "guide": guide}


# ── Judge link-based access (no account required) ─────────────────────────────

class JudgeInviteRequest(BaseModel):
    judge_name: str
    judge_email: str


@router.post("/invite-judge")
async def invite_judge(
    event_id: str,
    payload: JudgeInviteRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """
    Generate a signed JWT link for a judge and email it to them.
    The judge clicks the link and can submit scores without creating an account.
    """
    # Import your email service
    from ..email_service import send_email

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    event_name = event.name if event else "the event"

    _enforce_evaluations_active(event_id, db)

    # Create stateful judge invitation record
    invitation = models.JudgeInvitation(
        event_id=event_id,
        judge_name=payload.judge_name,
        judge_email=payload.judge_email,
        is_revoked=False
    )
    db.add(invitation)
    db.commit()

    # Generate token and portal URL using invitation ID
    token = create_judge_token(payload.judge_email, event_id, invitation.id)
    portal_url = f"{settings.FRONTEND_URL}/judge/{event_id}?token={token}"

    # Send the email
    body = f"""Hi {payload.judge_name},

You have been invited to judge {event_name}!

Access your judge portal using the link below:

👉 {portal_url}

⚠️  This link is valid for 7 days.
    No login or account required — just click and start scoring.

Regards,
EventCraft Team"""

    await send_email(
        to_email=payload.judge_email,
        subject=f"Judge Invitation — {event_name}",
        body=body,
        to_name=payload.judge_name
    )

    # Log the activity
    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Judge invite generated and sent to {payload.judge_name} ({payload.judge_email})",
        log_type="info",
    ))
    db.commit()

    return {
        "judge_name": payload.judge_name,
        "judge_email": payload.judge_email,
        "portal_url": portal_url,
        "token": token,
        "message": f"Invite sent to {payload.judge_email}",
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

    invite_id = judge_data.get("invite_id")
    if not invite_id:
        raise HTTPException(401, "Invalid or expired judge link")

    invitation = db.query(models.JudgeInvitation).filter(
        models.JudgeInvitation.id == invite_id,
        models.JudgeInvitation.event_id == event_id
    ).first()
    if not invitation or invitation.is_revoked:
        raise HTTPException(401, "This judge invitation link has been revoked or is invalid")

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    _enforce_evaluations_active(event_id, db)

    teams = db.query(models.Team).filter(
        models.Team.event_id == event_id,
        models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active, models.TeamStatus.proposed]),
        models.Team.submission_status == "Submitted",
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
                "project_title": t.project_title,
                "project_description": t.project_description,
                "github_url": t.github_url or t.github_link,
                "video_url": t.video_url or t.demo_link,
                "presentation_url": t.presentation_url,
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

    invite_id = judge_data.get("invite_id")
    if not invite_id:
        raise HTTPException(401, "Invalid or expired judge link")

    invitation = db.query(models.JudgeInvitation).filter(
        models.JudgeInvitation.id == invite_id,
        models.JudgeInvitation.event_id == event_id
    ).first()
    if not invitation or invitation.is_revoked:
        raise HTTPException(401, "This judge invitation link has been revoked or is invalid")

    # Enforce judge email from token (can't spoof)
    payload.judge_email = judge_data["email"]

    return _save_score(event_id, payload, db, background_tasks)


from datetime import datetime

class JudgeInvitationOut(BaseModel):
    id: str
    event_id: str
    judge_name: str
    judge_email: str
    is_revoked: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/judge-invitations", response_model=List[JudgeInvitationOut])
def list_judge_invitations(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """List all judge invitations generated for this event."""
    return db.query(models.JudgeInvitation).filter(
        models.JudgeInvitation.event_id == event_id
    ).order_by(models.JudgeInvitation.created_at.desc()).all()


@router.post("/judge-invitations/{invite_id}/revoke")
def revoke_judge_invitation(
    event_id: str,
    invite_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """Revoke a specific judge invitation, deactivating their link immediately."""
    invitation = db.query(models.JudgeInvitation).filter(
        models.JudgeInvitation.id == invite_id,
        models.JudgeInvitation.event_id == event_id
    ).first()
    if not invitation:
        raise HTTPException(404, "Judge invitation not found")

    invitation.is_revoked = True
    db.commit()

    # Log the activity
    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Judge invitation for {invitation.judge_name} ({invitation.judge_email}) was revoked",
        log_type="warning",
    ))
    db.commit()

    return {"message": "Judge invitation successfully revoked", "invite_id": invite_id}


# ── AI Bias Mitigation & Public Consensus Endpoints ────────────────────────────

@router.put("/teams/{team_id}/public-vote")
def update_public_vote(
    event_id: str,
    team_id: str,
    payload: PublicVoteInput,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    """
    Admin endpoint: save the social-scraping score (0-10) for a team.
    After saving, the combined public_vote_score is recomputed:
        combined = avg(social_vote_score, peer_avg)
    """
    _enforce_evaluations_active(event_id, db)

    team = db.query(models.Team).filter(
        models.Team.id == team_id,
        models.Team.event_id == event_id,
    ).first()
    if not team:
        raise HTTPException(404, "Team not found")

    # Store raw social score
    team.social_vote_score = payload.public_vote_score
    # Recompute combined
    _recompute_combined_public(team, db)
    db.commit()
    db.refresh(team)
    return {
        "message": "Social vote score saved",
        "social_vote_score": team.social_vote_score,
        "public_vote_score": team.public_vote_score,
    }


@router.get("/bias-mitigation")
def get_bias_mitigation(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    weights = event.scoring_weights or {"judge": 0.70, "peer": 0.15, "social": 0.15}
    w_judge = weights.get("judge", 0.70)
    w_peer = weights.get("peer", 0.15)
    w_social = weights.get("social", 0.15)

    # Only evaluate teams in active/approved status
    teams = db.query(models.Team).filter(
        models.Team.event_id == event_id,
        models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active]),
    ).all()

    results = []
    for team in teams:
        scores = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.team_id == team.id
        ).all()

        # --- Judge average ---
        judge_avg = 0.0
        if scores:
            judge_avg = round(sum(s.average or 0 for s in scores) / len(scores), 2)
        team.judge_avg_score = judge_avg  # keep cached value fresh

        # --- Peer review average ---
        peer_reviews = db.query(models.PeerReview).filter(
            models.PeerReview.to_team_id == team.id
        ).all()
        peer_avg: Optional[float] = None
        if peer_reviews:
            peer_avg = round(sum(r.score for r in peer_reviews) / len(peer_reviews), 2)

        # --- Combined public score (30% fallback for backward compatibility): avg(social, peer) ---
        social = team.social_vote_score
        if social is not None and peer_avg is not None:
            combined_public = round((social + peer_avg) / 2, 2)
        elif peer_avg is not None:
            combined_public = round(peer_avg, 2)
        elif social is not None:
            combined_public = round(social, 2)
        else:
            combined_public = None

        # Persist updated combined score if changed
        if combined_public != team.public_vote_score:
            team.public_vote_score = combined_public

        # --- AI Proposed Fair Score with dynamic weights & redistribution ---
        active_judge_weight = w_judge if scores else 0.0
        active_peer_weight = w_peer if peer_avg is not None else 0.0
        active_social_weight = w_social if social is not None else 0.0
        
        total_active_weight = active_judge_weight + active_peer_weight + active_social_weight
        
        ai_proposed = None
        if total_active_weight > 0:
            weighted_sum = (
                active_judge_weight * judge_avg + 
                active_peer_weight * (peer_avg or 0.0) + 
                active_social_weight * (social or 0.0)
            )
            ai_proposed = round(weighted_sum / total_active_weight, 2)
            team.ai_proposed_score = ai_proposed

            # Calculate weighted public score for deviation checking
            public_components = []
            public_weight_sum = 0.0
            if peer_avg is not None and w_peer > 0:
                public_components.append(w_peer * peer_avg)
                public_weight_sum += w_peer
            if social is not None and w_social > 0:
                public_components.append(w_social * social)
                public_weight_sum += w_social

            if public_weight_sum > 0:
                weighted_public = sum(public_components) / public_weight_sum
                deviation = abs(judge_avg - weighted_public)
                if deviation > 2.0:
                    if not team.bias_rationale:
                        rationale = llm.generate_bias_mitigation_rationale(
                            team_name=team.name,
                            judge_score=judge_avg,
                            public_score=weighted_public,
                            deviation=deviation,
                        )
                        team.bias_rationale = rationale
                else:
                    team.bias_rationale = None
            else:
                team.bias_rationale = None
        else:
            team.ai_proposed_score = None
            team.bias_rationale = None

        db.commit()
        db.refresh(team)

        results.append({
            "team_id": team.id,
            "team_name": team.name,
            "judge_avg": judge_avg,
            "social_vote_score": social,
            "peer_avg": peer_avg,
            "peer_review_count": len(peer_reviews),
            "public_vote_score": team.public_vote_score,  # combined block
            "ai_proposed_score": team.ai_proposed_score or ai_proposed,
            "bias_rationale": team.bias_rationale,
            "final_score": team.final_score,
        })

    return results


@router.post("/teams/{team_id}/lock-score")
async def lock_composite_score(
    event_id: str,
    team_id: str,
    payload: LockScoreRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_committee),
):
    _enforce_evaluations_active(event_id, db)

    team = db.query(models.Team).filter(
        models.Team.id == team_id,
        models.Team.event_id == event_id,
    ).first()
    if not team:
        raise HTTPException(404, "Team not found")

    team.final_score = payload.final_score
    if payload.bias_rationale:
        team.bias_rationale = payload.bias_rationale

    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Final score locked for {team.name} at {payload.final_score}/10 by {current_user.name}",
        log_type="success",
    ))
    db.commit()

    # WebSocket update to refresh frontend
    background_tasks.add_task(broadcast, event_id, {
        "type": "score_locked",
        "team_id": team_id,
        "team_name": team.name,
        "final_score": payload.final_score,
    })
    background_tasks.add_task(broadcast, event_id, {
        "type": "leaderboard_update",
        "team_id": team_id,
        "team_name": team.name,
        "final_score": payload.final_score,
    })

    return {"message": "Score successfully locked", "final_score": team.final_score}