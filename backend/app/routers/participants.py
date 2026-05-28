import io
import csv
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee, create_portal_token, decode_portal_token
from ..schemas import ParticipantCreate, ParticipantOut, CSVImportResult, PortalData, TeamSubmissionUpdate, TeamOut
from .. import models

router = APIRouter(prefix="/api/events/{event_id}/participants", tags=["participants"])


def _get_event(event_id: str, db: Session) -> models.Event:
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    return event


@router.get("", response_model=List[ParticipantOut])
def list_participants(
    event_id: str,
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    _get_event(event_id, db)
    q = db.query(models.Participant).filter(models.Participant.event_id == event_id)
    if search:
        q = q.filter(
            models.Participant.name.ilike(f"%{search}%")
            | models.Participant.email.ilike(f"%{search}%")
            | models.Participant.institution.ilike(f"%{search}%")
        )
    return q.order_by(models.Participant.registered_at).all()


@router.post("", response_model=ParticipantOut)
def add_participant(
    event_id: str,
    payload: ParticipantCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    _get_event(event_id, db)

    existing = (
        db.query(models.Participant)
        .filter(
            models.Participant.event_id == event_id,
            models.Participant.email == payload.email,
        )
        .first()
    )
    if existing:
        raise HTTPException(400, f"Participant with email {payload.email} already exists")

    participant = models.Participant(
        event_id=event_id,
        name=payload.name,
        email=payload.email,
        institution=payload.institution,
        level=payload.level,
        skills=payload.skills,
        status=payload.status,
        metadata_json=payload.metadata_json,
    )
    db.add(participant)
    db.flush()  # assigns participant.id before generating token
    participant.portal_token = create_portal_token(participant.id)

    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Participant '{payload.name}' added ({payload.level})",
        log_type="success",
    ))
    db.commit()
    db.refresh(participant)
    return participant


@router.delete("/{participant_id}")
def delete_participant(
    event_id: str,
    participant_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    p = (
        db.query(models.Participant)
        .filter(
            models.Participant.id == participant_id,
            models.Participant.event_id == event_id,
        )
        .first()
    )
    if not p:
        raise HTTPException(404, "Participant not found")
    name = p.name
    db.delete(p)
    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Participant '{name}' removed from roster",
        log_type="warning",
    ))
    db.commit()
    return {"message": f"Participant {name} deleted"}


@router.post("/import-csv", response_model=CSVImportResult)
async def import_csv(
    event_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    _get_event(event_id, db)

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    skipped = 0
    errors = []

    for row_num, row in enumerate(reader, start=2):
        try:
            name = row.get("name", "").strip()
            email = row.get("email", "").strip()
            if not name or not email:
                errors.append(f"Row {row_num}: missing name or email")
                skipped += 1
                continue

            existing = (
                db.query(models.Participant)
                .filter(
                    models.Participant.event_id == event_id,
                    models.Participant.email == email,
                )
                .first()
            )
            if existing:
                skipped += 1
                continue

            skills_raw = row.get("skills", "")
            skills = [s.strip() for s in skills_raw.split(",") if s.strip()]

            level_raw = row.get("level", "Intermediate").strip()
            try:
                level = models.ParticipantLevel(level_raw)
            except ValueError:
                level = models.ParticipantLevel.intermediate

            p = models.Participant(
                event_id=event_id,
                name=name,
                email=email,
                institution=row.get("institution", "").strip() or None,
                level=level,
                skills=skills,
                status=models.ParticipantStatus.active,
            )
            p.portal_token = create_portal_token(p.id)
            db.add(p)
            imported += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            skipped += 1

    if imported > 0:
        db.add(models.ActivityLog(
            event_id=event_id,
            message=f"CSV import: {imported} participants added, {skipped} skipped",
            log_type="success",
        ))

    db.commit()
    return CSVImportResult(imported=imported, skipped=skipped, errors=errors)


@router.post("/regenerate-tokens")
def regenerate_portal_tokens(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    """Regenerate portal tokens for any participants missing them."""
    participants = db.query(models.Participant).filter(
        models.Participant.event_id == event_id,
        models.Participant.portal_token.is_(None),
    ).all()

    count = 0
    for p in participants:
        p.portal_token = create_portal_token(p.id)
        count += 1

    db.commit()
    return {"message": f"Regenerated tokens for {count} participants"}


# ── Participant Portal (public, JWT-token based) ───────────────────────────────

@router.get("/portal/{token}", response_model=PortalData)
def get_portal(
    event_id: str,
    token: str,
    db: Session = Depends(get_db),
):
    """Public endpoint — no auth required. Token IS the credential."""
    participant_id = decode_portal_token(token)
    if not participant_id:
        raise HTTPException(401, "Invalid or expired portal token")

    participant = (
        db.query(models.Participant)
        .filter(
            models.Participant.id == participant_id,
            models.Participant.event_id == event_id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(404, "Participant not found")

    event = db.query(models.Event).filter(models.Event.id == event_id).first()

    team = None
    if participant.team_id:
        team = db.query(models.Team).filter(models.Team.id == participant.team_id).first()
        if team:
            _ = team.members  # eager load

    current_stage = (
        db.query(models.PipelineStage)
        .filter(
            models.PipelineStage.event_id == event_id,
            models.PipelineStage.status == models.StageStatus.active,
        )
        .first()
    )

    stages = (
        db.query(models.PipelineStage)
        .filter(models.PipelineStage.event_id == event_id)
        .order_by(models.PipelineStage.order_index)
        .all()
    )
    key_dates = [
        {
            "label": s.name,
            "done": s.status == models.StageStatus.completed,
            "date": s.completed_at.strftime("%b %d, %Y") if s.completed_at else "TBD",
        }
        for s in stages
    ]

    progression_eligible = False
    if team and team.final_score is not None:
        all_teams = (
            db.query(models.Team)
            .filter(
                models.Team.event_id == event_id,
                models.Team.final_score.isnot(None),
            )
            .order_by(models.Team.final_score.desc())
            .all()
        )
        if all_teams:
            top_half = all_teams[: max(1, len(all_teams) // 2)]
            progression_eligible = team.id in [t.id for t in top_half]

    # ── Scoring Phase Detection ──────────────────────────────────────────────
    # Phase is "active" when the current stage name contains scoring/eval keywords
    # OR when stage index >= 2 (configurable) — this means past Team Formation.
    SCORING_KEYWORDS = ("intake", "scor", "eval", "judg", "peer", "review", "voting")
    scoring_phase_active = False
    if current_stage:
        stage_lower = current_stage.name.lower()
        scoring_phase_active = any(kw in stage_lower for kw in SCORING_KEYWORDS)
    # Fallback: if at least 2 stages have been completed, unlock the showroom
    if not scoring_phase_active:
        completed_count = sum(1 for s in stages if s.status == models.StageStatus.completed)
        scoring_phase_active = completed_count >= 2

    # ── Showroom Teams (only populated when scoring phase is active) ─────────
    showroom_teams = []
    if scoring_phase_active:
        all_event_teams = db.query(models.Team).filter(
            models.Team.event_id == event_id,
            models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active]),
            models.Team.submission_status == "Submitted",
        ).all()

        # Votes already cast by this participant's team
        existing_votes: dict = {}
        if participant.team_id:
            from .. import models as m
            reviews = db.query(m.PeerReview).filter(
                m.PeerReview.from_team_id == participant.team_id,
                m.PeerReview.event_id == event_id,
            ).all()
            existing_votes = {r.to_team_id: r.score for r in reviews}

        for t in all_event_teams:
            if t.id == participant.team_id:
                continue  # skip own team
            from ..schemas import ShowroomTeam
            showroom_teams.append(ShowroomTeam(
                id=t.id,
                name=t.name,
                challenge=t.challenge,
                github_link=t.github_url or t.github_link,
                demo_link=t.video_url or t.demo_link,
                project_title=t.project_title,
                project_description=t.project_description,
                github_url=t.github_url,
                video_url=t.video_url,
                presentation_url=t.presentation_url,
                submission_status=t.submission_status,
                member_count=len(t.members),
                my_vote=existing_votes.get(t.id),
            ))

    # ── Leaderboard Standings ──────────────────────────────────────────────────
    # Fetch all active/approved teams in this event and compute their scores
    teams = (
        db.query(models.Team)
        .filter(
            models.Team.event_id == event_id,
            models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active])
        )
        .all()
    )
    
    leaderboard_entries = []
    for t in teams:
        score = None
        if t.final_score is not None:
            score = t.final_score
        else:
            scores = db.query(models.EvaluationScore).filter(
                models.EvaluationScore.team_id == t.id
            ).all()
            if scores:
                score = round(sum(s.average or 0 for s in scores) / len(scores), 2)
        
        leaderboard_entries.append({
            "team_id": t.id,
            "team_name": t.name,
            "score": score,
        })
    
    # Sort teams by score descending (putting None scores at the bottom)
    leaderboard_entries.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    
    # Assign ranks
    for i, item in enumerate(leaderboard_entries):
        item["rank"] = i + 1

    return PortalData(
        participant=participant,
        team=team,
        current_stage=current_stage.name if current_stage else None,
        current_stage_index=event.current_stage_index,
        key_dates=key_dates,
        event_name=event.name,
        progression_eligible=progression_eligible,
        scoring_phase_active=scoring_phase_active,
        showroom_teams=showroom_teams,
        leaderboard=leaderboard_entries,
    )


@router.put("/portal/{token}/team", response_model=TeamOut)
def update_team_submission(
    event_id: str,
    token: str,
    payload: TeamSubmissionUpdate,
    db: Session = Depends(get_db),
):
    """Update team submission links (github_link, demo_link) and optionally lock the submission."""
    participant_id = decode_portal_token(token)
    if not participant_id:
        raise HTTPException(401, "Invalid or expired portal token")

    participant = (
        db.query(models.Participant)
        .filter(
            models.Participant.id == participant_id,
            models.Participant.event_id == event_id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(404, "Participant not found")

    if not participant.team_id:
        raise HTTPException(400, "Participant is not assigned to a team")

    team = db.query(models.Team).filter(models.Team.id == participant.team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")

    if team.is_locked:
        raise HTTPException(400, "Team submission is locked and cannot be modified")

    if payload.github_link is not None:
        team.github_link = payload.github_link
    if payload.demo_link is not None:
        team.demo_link = payload.demo_link
    if payload.lock:
        team.is_locked = True

    db.commit()
    db.refresh(team)
    return team

