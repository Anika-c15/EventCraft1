from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.tasks import safe_execute, generate_team_rationales_task, _generate_rationales
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee, decode_portal_token
from ..schemas import TeamOut, TeamSubmissionDraft, TeamSubmissionFinal
from .. import models, llm
from ..team_formation import form_teams

router = APIRouter(prefix="/api/events/{event_id}/teams", tags=["teams"])

# Static fallback rationales used when Gemini quota is exceeded
STATIC_RATIONALES = [
    "This team brings together a diverse set of technical skills spanning AI/ML, full-stack development, and systems programming. The members complement each other well, with each contributor covering a distinct domain. Their varied institutional backgrounds ensure different problem-solving perspectives, making this team well-equipped to tackle complex challenges end-to-end.",
    "A well-balanced team combining data engineering, backend infrastructure, and mobile development expertise. The skill distribution ensures no single domain is over-represented, enabling the team to build complete solutions. The mix of experience levels creates a natural mentorship dynamic that will accelerate delivery.",
    "This team excels at bridging hardware and software, with members covering embedded systems, cloud infrastructure, and data analytics. Their complementary backgrounds from different institutions bring fresh perspectives to problem-solving. Together they can design, build, and deploy robust end-to-end solutions.",
    "A technically strong team with expertise across blockchain, systems programming, and DevOps. The members' skills are highly complementary — one handles low-level performance, another manages decentralized logic, and the third ensures reliable deployment pipelines. This combination is ideal for building production-grade, scalable applications.",
]


def _get_rationale(team_name: str, members: list, rules: dict, idx: int) -> str:
    """Try Gemini first, fall back to static rationale."""
    result = llm.generate_team_rationale(team_name, members, rules)
    if result.startswith("["):  # error or quota exceeded
        return STATIC_RATIONALES[idx % len(STATIC_RATIONALES)]
    return result


@router.get("", response_model=List[TeamOut])
def list_teams(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    # Proactively clean up any empty teams (0 members) to fix database state issues
    all_teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    has_empty = False
    for t in all_teams:
        if len(t.members) == 0:
            db.delete(t)
            has_empty = True
    if has_empty:
        db.commit()

    teams = (
        db.query(models.Team)
        .filter(models.Team.event_id == event_id)
        .order_by(models.Team.created_at)
        .all()
    )
    for team in teams:
        _ = team.members
    return teams


@router.post("/form", response_model=List[TeamOut])
def form_teams_endpoint(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    # Block re-formation if stage has advanced past Team Formation (index 1)
    if event.current_stage_index > 1:
        raise HTTPException(400, "Cannot re-form teams — the event has already advanced past the Team Formation stage.")

    # Block if teams are already approved (formation approval resolved)
    approved_teams = db.query(models.Team).filter(
        models.Team.event_id == event_id,
        models.Team.status == models.TeamStatus.approved,
    ).count()
    if approved_teams > 0:
        raise HTTPException(400, "Teams have already been approved. Re-formation is not allowed after approval.")

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
        raise HTTPException(400, "Need at least 2 active participants to form teams")

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

    team_compositions = form_teams(participant_dicts, rules)
    if not team_compositions:
        raise HTTPException(400, "Could not form any teams with the current rules")

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

   # Also clear old pending team-formation approvals
    db.query(models.Approval).filter(
        models.Approval.event_id == event_id,
        models.Approval.type == models.ApprovalType.team_formation,
        models.Approval.status == models.ApprovalStatus.pending,
    ).delete()
    db.flush()

    # EXACTLY 4 spaces of indentation for these lines:
    created_teams = []
    ai_team_payload = [] 

    # 1. Loop through and create teams WITHOUT calling the AI yet
    for comp in team_compositions:
        team = models.Team(
            event_id=event_id,
            name=comp["name"],
            status=models.TeamStatus.proposed,
            rationale="Generating AI insights...", # Placeholder
        )
        db.add(team)
        db.flush()

        for member_dict in comp["members"]:
            p = db.query(models.Participant).filter(models.Participant.id == member_dict["id"]).first()
            if p:
                p.team_id = team.id

        created_teams.append(team)

        # 2. Add the rich data directly to our payload list
        # comp["members"] already contains name, institution, skills, and level!
        ai_team_payload.append({
            "id": team.id,
            "name": team.name,
            "members": comp["members"] 
        })

    # 3. AFTER the loop, trigger the AI in the background using the rich payload
    safe_execute(
        background_tasks,
        generate_team_rationales_task,
        _generate_rationales,
        event_id=event_id,
        team_data=ai_team_payload, # <--- We pass the detailed payload here!
        rules=rules
    )

    # Create approval gate
    rules_summary = []
    if rules.get("experience_level_grouping") == "mixed":
        rules_summary.append("balanced experience grouping")
    if rules.get("institution_diversity"):
        rules_summary.append(f"max {rules.get('max_per_institution', 1)} from same institution")
        rules_summary.append("institution diversity enforced")
    if rules.get("skill_balance"):
        rules_summary.append("skill balance required")

    approval = models.Approval(
        event_id=event_id,
        type=models.ApprovalType.team_formation,
        status=models.ApprovalStatus.pending,
        description=(
            f"{len(created_teams)} teams formed from {len(participants)} participants using: "
            + ", ".join(rules_summary)
            + ". Review compositions before communicating assignments."
        ),
        payload={"team_ids": [t.id for t in created_teams]},
    )
    db.add(approval)

    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"AI team formation completed — {len(created_teams)} teams proposed",
        log_type="success",
    ))
    db.commit()

    for team in created_teams:
        db.refresh(team)
        _ = team.members

    return created_teams


@router.delete("/clear")
def clear_teams(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    # Block clearing if stage has advanced past Team Formation
    if event.current_stage_index > 1:
        raise HTTPException(400, "Cannot clear teams — the event has already advanced past the Team Formation stage.")

    # Block if teams are already approved
    approved_teams = db.query(models.Team).filter(
        models.Team.event_id == event_id,
        models.Team.status == models.TeamStatus.approved,
    ).count()
    if approved_teams > 0:
        raise HTTPException(400, "Teams have already been approved and cannot be cleared.")
    teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    for team in teams:
        for member in team.members:
            member.team_id = None
        db.delete(team)

    db.add(models.ActivityLog(
        event_id=event_id,
        message="All teams cleared for re-formation",
        log_type="warning",
    ))
    db.commit()
    return {"message": "All teams cleared"}


@router.get("/leaderboard")
def get_leaderboard(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    data = _build_leaderboard(event_id, db)
    return data["teams"]  # admin endpoint keeps returning a plain list


@router.get("/leaderboard/public")
def get_public_leaderboard(
    event_id: str,
    db: Session = Depends(get_db),
):
    """Public endpoint — no auth required. Used by the live leaderboard page."""
    return _build_leaderboard(event_id, db)  # returns { event_name, teams }


def _build_leaderboard(event_id: str, db: Session):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    event_name = event.name if event else "EventCraft"

    # Fetch scoring weights
    weights = event.scoring_weights or {"judge": 0.70, "peer": 0.15, "social": 0.15} if event else {"judge": 0.70, "peer": 0.15, "social": 0.15}
    w_judge = weights.get("judge", 0.70)
    w_peer = weights.get("peer", 0.15)
    w_social = weights.get("social", 0.15)

    teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    result = []

    for team in teams:
        # Only include teams whose score has been locked by the committee
        if team.final_score is None:
            continue

        scores = db.query(models.EvaluationScore).filter(
            models.EvaluationScore.team_id == team.id
        ).all()

        score_breakdown = {}
        avg_score = None
        if scores:
            all_criteria = set()
            for s in scores:
                all_criteria.update(s.scores_json.keys())
            for criterion in all_criteria:
                vals = [s.scores_json.get(criterion, 0) for s in scores]
                score_breakdown[criterion] = round(sum(vals) / len(vals), 2)
            avg_score = round(sum(s.average or 0 for s in scores) / len(scores), 2)

        # Peer review average
        peer_reviews = db.query(models.PeerReview).filter(
            models.PeerReview.to_team_id == team.id
        ).all()
        peer_avg = sum(r.score for r in peer_reviews) / len(peer_reviews) if peer_reviews else None

        social = team.social_vote_score

        # Dynamically compute composite score based on active elements
        active_weights = []
        weighted_terms = []
        active_components_count = 0
        if avg_score is not None:
            active_weights.append(w_judge)
            weighted_terms.append(w_judge * avg_score)
            active_components_count += 1
        if peer_avg is not None:
            active_weights.append(w_peer)
            weighted_terms.append(w_peer * peer_avg)
            active_components_count += 1
        if social is not None:
            active_weights.append(w_social)
            weighted_terms.append(w_social * social)
            active_components_count += 1

        composite_score = None
        if active_weights and sum(active_weights) > 0:
            composite_score = round(sum(weighted_terms) / sum(active_weights), 2)

        result.append({
            "team_id": team.id,
            "team_name": team.name,
            "status": team.status.value,
            "member_count": len(team.members),
            "score": team.final_score,
            "score_breakdown": score_breakdown,
            "has_anomaly": any(s.is_anomaly for s in scores),
            "rank": team.rank,
            "judges_count": len(scores),
            "active_components_count": active_components_count,
            "total_components_count": 3
        })

    result.sort(key=lambda x: -(x["score"] or 0))
    for i, item in enumerate(result):
        item["rank"] = i + 1

    return {"event_name": event_name, "teams": result}


from urllib.parse import urlparse

def is_valid_url(url: str) -> bool:
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc]) and result.scheme in ("http", "https")
    except Exception:
        return False

submission_router = APIRouter(prefix="/api/teams/submission", tags=["teams-submission"])

@submission_router.post("/rename")
def rename_team(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Allows a participant to rename their team once via portal token.
    Once name_locked=True, further renames are rejected.
    """
    token = payload.get("token", "")
    new_name = (payload.get("name") or "").strip()

    if not new_name:
        raise HTTPException(400, "Team name cannot be empty")
    if len(new_name) > 50:
        raise HTTPException(400, "Team name must be 50 characters or fewer")

    participant_id = decode_portal_token(token)
    if not participant_id:
        raise HTTPException(401, "Invalid or expired portal token")

    participant = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
    if not participant or not participant.team_id:
        raise HTTPException(404, "No team assigned to this participant")

    team = db.query(models.Team).filter(models.Team.id == participant.team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")

    if team.name_locked:
        raise HTTPException(400, "Your team name has already been set and cannot be changed again.")

    # Reject rename if event has moved past Team Formation phase
    active_stage = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == team.event_id,
        models.PipelineStage.status == models.StageStatus.active
    ).first()
    if active_stage:
        stage_lower = active_stage.name.lower()
        is_team_formation = 'team' in stage_lower or 'formation' in stage_lower
        if not is_team_formation:
            raise HTTPException(400, "Team renaming is only allowed during the Team Formation phase.")

    # Check name not already taken in this event
    existing = db.query(models.Team).filter(
        models.Team.event_id == team.event_id,
        models.Team.name == new_name,
        models.Team.id != team.id,
    ).first()
    if existing:
        raise HTTPException(409, "A team with this name already exists. Please choose a different name.")

    old_name = team.name
    team.name = new_name
    team.name_locked = True

    db.add(models.ActivityLog(
        event_id=team.event_id,
        message=f"Team renamed: '{old_name}' → '{new_name}' by {participant.name}",
        log_type="info",
    ))
    db.commit()
    db.refresh(team)

    # Broadcast so committee dashboard updates live
    try:
        from ..ws import manager
        manager.broadcast_sync(team.event_id, {
            "type": "dashboard_update",
            "message": f"Team renamed to '{new_name}'"
        })
    except Exception as e:
        print(f"⚠️ WS broadcast error: {e}")

    return {"message": "Team name updated successfully", "name": team.name, "name_locked": True}

@submission_router.post("/save-draft")
def save_submission_draft(
    payload: TeamSubmissionDraft,
    db: Session = Depends(get_db)
):
    participant_id = decode_portal_token(payload.token)
    if not participant_id:
        raise HTTPException(401, "Invalid or expired portal token")

    participant = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(404, "Participant not found")

    active_stage = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == participant.event_id,
        models.PipelineStage.status == models.StageStatus.active
    ).first()
    allows_submission = False
    if active_stage:
        db_allows = getattr(active_stage, "allows_submission", None)
        if db_allows is not None:
            allows_submission = db_allows
        else:
            from ..llm import check_stage_allows_submission
            allows_submission = check_stage_allows_submission(active_stage.name, active_stage.description or "")
    if not allows_submission:
        stage_name = active_stage.name if active_stage else "Participant Intake"
        raise HTTPException(400, f"Project submissions are not open during the '{stage_name}' stage")

    if not participant.team_id:
        raise HTTPException(400, "Participant has no team assigned")

    team = db.query(models.Team).filter(models.Team.id == participant.team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")

    if team.submission_status == "Submitted":
        raise HTTPException(400, "Submission is already finalized and locked")

    if payload.project_title is not None:
        team.project_title = payload.project_title
    if payload.project_description is not None:
        team.project_description = payload.project_description
    if payload.github_url is not None:
        team.github_url = payload.github_url
    if payload.video_url is not None:
        team.video_url = payload.video_url
    if payload.presentation_url is not None:
        team.presentation_url = payload.presentation_url

    db.commit()
    db.refresh(team)
    return {"message": "Draft saved successfully", "team": team}


@submission_router.post("/submit-final")
def submit_final_submission(
    payload: TeamSubmissionFinal,
    db: Session = Depends(get_db)
):
    participant_id = decode_portal_token(payload.token)
    if not participant_id:
        raise HTTPException(401, "Invalid or expired portal token")

    participant = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(404, "Participant not found")

    active_stage = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == participant.event_id,
        models.PipelineStage.status == models.StageStatus.active
    ).first()
    allows_submission = False
    if active_stage:
        db_allows = getattr(active_stage, "allows_submission", None)
        if db_allows is not None:
            allows_submission = db_allows
        else:
            from ..llm import check_stage_allows_submission
            allows_submission = check_stage_allows_submission(active_stage.name, active_stage.description or "")
    if not allows_submission:
        stage_name = active_stage.name if active_stage else "Participant Intake"
        raise HTTPException(400, f"Project submissions are not open during the '{stage_name}' stage")

    if not participant.team_id:
        raise HTTPException(400, "Participant has no team assigned")

    team = db.query(models.Team).filter(models.Team.id == participant.team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")

    if team.submission_status == "Submitted":
        raise HTTPException(400, "Submission is already finalized and locked")

    if not payload.project_title or not payload.project_title.strip():
        raise HTTPException(422, "Project Title is required")
    if not payload.project_description or not payload.project_description.strip():
        raise HTTPException(422, "Project Description is required")

    # Validate URLs
    for name, url in [
        ("GitHub URL", payload.github_url),
        ("Video URL", payload.video_url),
        ("Presentation URL", payload.presentation_url)
    ]:
        if not url or not url.strip():
            raise HTTPException(422, f"{name} is required")
        if not is_valid_url(url.strip()):
            raise HTTPException(422, f"{name} must be a complete and valid URL (starting with http:// or https://)")

    team.project_title = payload.project_title.strip()
    team.project_description = payload.project_description.strip()
    team.github_url = payload.github_url.strip()
    team.video_url = payload.video_url.strip()
    team.presentation_url = payload.presentation_url.strip()
    team.submission_status = "Submitted"

    db.commit()
    db.refresh(team)

    # Broadcast WebSocket update so other participant portals refresh automatically
    try:
        from ..ws import manager
        manager.broadcast_sync(team.event_id, {
            "type": "dashboard_update",
            "message": f"Team {team.name} finalized project submission"
        })
    except Exception as e:
        print(f"⚠️ WS broadcast error: {e}")

    return {"message": "Project submitted successfully", "team": team}
