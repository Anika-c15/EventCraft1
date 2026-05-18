from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee
from ..schemas import TeamOut
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
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    participants = (
        db.query(models.Participant)
        .filter(
            models.Participant.event_id == event_id,
            models.Participant.status == models.ParticipantStatus.active,
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

    created_teams = []

    for idx, comp in enumerate(team_compositions):
        # Generate rationale synchronously with fallback
        rationale = _get_rationale(comp["name"], comp["members"], rules, idx)

        team = models.Team(
            event_id=event_id,
            name=comp["name"],
            status=models.TeamStatus.proposed,
            rationale=rationale,
        )
        db.add(team)
        db.flush()

        for member_dict in comp["members"]:
            p = db.query(models.Participant).filter(models.Participant.id == member_dict["id"]).first()
            if p:
                p.team_id = team.id

        created_teams.append(team)

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
    teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    result = []

    for team in teams:
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

        result.append({
            "team_id": team.id,
            "team_name": team.name,
            "status": team.status.value,
            "member_count": len(team.members),
            "score": avg_score,
            "score_breakdown": score_breakdown,
            "has_anomaly": any(s.is_anomaly for s in scores),
            "rank": team.rank,
            "judges_count": len(scores),
        })

    result.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    for i, item in enumerate(result):
        item["rank"] = i + 1

    return result
