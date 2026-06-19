"""
Peer Review router.

Allows participants (via their portal token) to submit 0-10 ratings for other
teams during the Scoring Pipeline phase.  After each submission the combined
public score for the rated team is recalculated:

    combined_public = avg(social_vote_score, peer_avg)

where peer_avg = mean of all PeerReview.score for that team.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import decode_portal_token
from ..guards import require_event_not_completed
from ..schemas import PeerReviewCreate, PeerReviewOut
from .. import models

router = APIRouter(prefix="/api/events/{event_id}/peer-reviews", tags=["peer-reviews"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def check_peer_review_allowed(event_id: str, db: Session):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    peer_weight = 0.15
    if event.scoring_weights:
        peer_weight = event.scoring_weights.get("peer", 0.15)
    if peer_weight == 0:
        raise HTTPException(400, "Peer voting is not allowed because its scoring weight is set to 0%")


def _resolve_participant(token: str, event_id: str, db: Session) -> models.Participant:
    """Decode a portal token and return the participant."""
    participant_id = decode_portal_token(token)
    if not participant_id:
        raise HTTPException(401, "Invalid or expired portal token")
    participant = db.query(models.Participant).filter(
        models.Participant.id == participant_id,
        models.Participant.event_id == event_id,
    ).first()
    if not participant:
        raise HTTPException(401, "Invalid or expired portal token")
    return participant


def _recompute_public_score(team: models.Team, db: Session) -> None:
    """
    Recompute the combined public_vote_score for a team:
        combined = avg(social_vote_score, peer_avg)
    whichever sources are available.
    Updates team in-place; caller must commit.
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
    # else: no data yet — leave as None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=PeerReviewOut)
def submit_peer_review(
    event_id: str,
    payload: PeerReviewCreate,
    token: str = Query(..., description="Participant portal token"),
    db: Session = Depends(get_db),
):
    """
    Submit a peer review rating (0-10) for another team.
    Requires a valid participant portal token in the query string.
    One review per (from_team → to_team) pair.  Self-voting is blocked.
    """
    require_event_not_completed(event_id, db)
    check_peer_review_allowed(event_id, db)
    participant = _resolve_participant(token, event_id, db)

    active_stage = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == event_id,
        models.PipelineStage.status == models.StageStatus.active
    ).first()
    if active_stage and active_stage.name.lower() in ("results", "progression"):
        raise HTTPException(400, "Peer voting is closed because the event has advanced past the Evaluation phase")

    if not participant.team_id:
        raise HTTPException(400, "You must be assigned to a team before submitting peer reviews")

    if participant.team_id == payload.to_team_id:
        raise HTTPException(400, "You cannot rate your own team")

    # Validate target team exists in this event
    to_team = db.query(models.Team).filter(
        models.Team.id == payload.to_team_id,
        models.Team.event_id == event_id,
    ).first()
    if not to_team:
        raise HTTPException(404, "Target team not found in this event")

    if not (0 <= payload.score <= 10):
        raise HTTPException(422, "Score must be between 0 and 10")

    # Check if this team has already voted for this target
    existing = db.query(models.PeerReview).filter(
        models.PeerReview.from_team_id == participant.team_id,
        models.PeerReview.to_team_id == payload.to_team_id,
        models.PeerReview.event_id == event_id,
    ).first()

    if existing:
        # Update existing vote rather than creating duplicate
        existing.score = payload.score
        db.commit()
        db.refresh(existing)
        review = existing
    else:
        review = models.PeerReview(
            event_id=event_id,
            from_team_id=participant.team_id,
            to_team_id=payload.to_team_id,
            score=payload.score,
        )
        db.add(review)
        db.flush()

    # Recompute the combined public score for the rated team
    _recompute_public_score(to_team, db)
    db.commit()
    db.refresh(review)

    # Broadcast WebSocket update
    try:
        from ..ws import manager
        manager.broadcast_sync(event_id, {
            "type": "dashboard_update",
            "message": f"Peer review updated for team {to_team.name}"
        })
    except Exception as e:
        print(f"⚠️ WS broadcast error: {e}")

    return review


@router.get("/my-votes")
def get_my_votes(
    event_id: str,
    token: str = Query(..., description="Participant portal token"),
    db: Session = Depends(get_db),
):
    """Return a dict of {to_team_id: score} for the authenticated participant's team."""
    check_peer_review_allowed(event_id, db)
    participant = _resolve_participant(token, event_id, db)
    if not participant.team_id:
        return {}

    reviews = db.query(models.PeerReview).filter(
        models.PeerReview.from_team_id == participant.team_id,
        models.PeerReview.event_id == event_id,
    ).all()
    return {r.to_team_id: r.score for r in reviews}


@router.get("/showroom")
def get_showroom(
    event_id: str,
    token: str = Query(..., description="Participant portal token"),
    db: Session = Depends(get_db),
):
    """
    Returns all other teams' showroom cards for this event.
    Excludes the requesting participant's own team.
    """
    check_peer_review_allowed(event_id, db)
    participant = _resolve_participant(token, event_id, db)

    teams = db.query(models.Team).filter(
        models.Team.event_id == event_id,
        models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active]),
        models.Team.submission_status == "Submitted",
    ).all()

    # Votes already cast by this team
    existing_votes: dict = {}
    if participant.team_id:
        reviews = db.query(models.PeerReview).filter(
            models.PeerReview.from_team_id == participant.team_id,
            models.PeerReview.event_id == event_id,
        ).all()
        existing_votes = {r.to_team_id: r.score for r in reviews}

    result = []
    for t in teams:
        if t.id == participant.team_id:
            continue  # skip own team
        result.append({
            "id": t.id,
            "name": t.name,
            "challenge": t.challenge,
            "github_link": t.github_url or t.github_link,
            "demo_link": t.video_url or t.demo_link,
            "project_title": t.project_title,
            "project_description": t.project_description,
            "github_url": t.github_url,
            "video_url": t.video_url,
            "presentation_url": t.presentation_url,
            "submission_status": t.submission_status,
            "member_count": len(t.members),
            "my_vote": existing_votes.get(t.id),
        })

    return result
