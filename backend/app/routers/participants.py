import io
import csv
from typing import List, Optional
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from sqlalchemy.orm import Session

# pyrefly: ignore [missing-import]
from pypdf import PdfReader
# pyrefly: ignore [missing-import]
from docx import Document

from ..database import get_db
from ..auth import require_committee, create_portal_token, decode_portal_token
from ..schemas import ParticipantCreate, ParticipantOut, CSVImportResult, PortalData, TeamSubmissionUpdate, TeamOut
from .. import models
from .. import llm

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
async def add_participant(
    event_id: str,
    payload: ParticipantCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee),
):
    from ..email_service import send_portal_link_email

    event = _get_event(event_id, db)

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
    db.flush()
    participant.portal_token = create_portal_token(participant.id)

    db.add(models.ActivityLog(
        event_id=event_id,
        message=f"Participant '{payload.name}' added ({payload.level})",
        log_type="success",
    ))
    db.commit()
    db.refresh(participant)

    # send portal link email
    await send_portal_link_email(
        name=participant.name,
        email=participant.email,
        event_name=event.name,
        token=participant.portal_token,
        event_id=participant.event_id,
        role="participant"
    )

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

            import uuid
            p_id = str(uuid.uuid4())
            p = models.Participant(
                id=p_id,
                event_id=event_id,
                name=name,
                email=email,
                institution=row.get("institution", "").strip() or None,
                level=level,
                skills=skills,
                status=models.ParticipantStatus.active,
            )
            p.portal_token = create_portal_token(p_id)
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
        raise HTTPException(401, "Invalid or expired portal token")

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
    from ..llm import check_stage_is_evaluation_phase
    scoring_phase_active = False
    if current_stage:
        if getattr(current_stage, "is_evaluation", False):
            scoring_phase_active = True
        else:
            scoring_phase_active = check_stage_is_evaluation_phase(current_stage.name, current_stage.description or "")

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
    # Only include teams whose final_score has been locked by the committee
    teams = (
        db.query(models.Team)
        .filter(
            models.Team.event_id == event_id,
            models.Team.status.in_([models.TeamStatus.approved, models.TeamStatus.active]),
            models.Team.final_score.isnot(None),  # only locked scores
        )
        .all()
    )

    leaderboard_entries = []
    for t in teams:
        leaderboard_entries.append({
            "team_id": t.id,
            "team_name": t.name,
            "score": t.final_score,
        })

    # Sort by final score descending
    leaderboard_entries.sort(key=lambda x: -(x["score"] or 0))

    # Assign ranks
    for i, item in enumerate(leaderboard_entries):
        item["rank"] = i + 1

    from ..llm import check_stage_allows_submission, check_stage_is_results_phase
    submission_portal_active = False
    results_phase_active = False
    if current_stage:
        db_allows = getattr(current_stage, "allows_submission", None)
        if db_allows is not None:
            submission_portal_active = db_allows
        else:
            submission_portal_active = check_stage_allows_submission(current_stage.name, current_stage.description or "")
        results_phase_active = check_stage_is_results_phase(current_stage.name, current_stage.description or "")

    # Only return the real leaderboard to participants if the results phase is active
    final_leaderboard = leaderboard_entries if results_phase_active else []

    return PortalData(
        participant=participant,
        team=team,
        current_stage=current_stage.name if current_stage else None,
        current_stage_index=event.current_stage_index,
        key_dates=key_dates,
        event_name=event.name,
        progression_eligible=progression_eligible,
        scoring_phase_active=scoring_phase_active,
        submission_portal_active=submission_portal_active,
        results_phase_active=results_phase_active,
        showroom_teams=showroom_teams,
        leaderboard=final_leaderboard,
        scoring_weights=event.scoring_weights,
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


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        pdf = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    except Exception as e:
        print(f"Error extracting PDF: {e}")
        return ""


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        doc = Document(io.BytesIO(file_bytes))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text
    except Exception as e:
        print(f"Error extracting DOCX: {e}")
        return ""


def extract_text_from_txt(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return ""


@router.post("/parse-resume")
async def parse_resume(
    event_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    event = _get_event(event_id, db)
    filename = (file.filename or "").lower()
    file_bytes = await file.read()

    # ── Check if participant intake phase is still open ───────────────────────
    stages = db.query(models.PipelineStage).filter(
        models.PipelineStage.event_id == event_id
    ).order_by(models.PipelineStage.order_index).all()

    if stages:
        active_stage = next((s for s in stages if s.status == models.StageStatus.active), None)
        # Find intake/registration stage (first stage or one with "intake"/"register" in name)
        intake_stages = [s for s in stages if any(kw in s.name.lower() for kw in ("intake", "register", "registration", "participant"))]
        intake_stage = intake_stages[0] if intake_stages else stages[0]

        if active_stage and active_stage.order_index > intake_stage.order_index:
            raise HTTPException(400, f"Participant intake is closed. The event has moved to the '{active_stage.name}' stage. Registration is no longer accepted.")

    # ── Format validation ──────────────────────────────────────────────────────
    allowed_extensions = (".pdf", ".txt", ".doc", ".docx")
    if not any(filename.endswith(ext) for ext in allowed_extensions):
        raise HTTPException(400, "Unsupported file format. Please upload a PDF, TXT, DOC, or DOCX file.")

    if len(file_bytes) < 100:
        raise HTTPException(400, "File is too small to be a valid resume. Please upload a proper resume file.")
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(400, "File is too large. Please upload a resume under 5MB.")

    text = ""
    if filename.endswith(".pdf"):
        text = extract_text_from_pdf(file_bytes)
    elif filename.endswith(".docx"):
        text = extract_text_from_docx(file_bytes)
    elif filename.endswith(".txt"):
        text = extract_text_from_txt(file_bytes)
    elif filename.endswith(".doc"):
        text = extract_text_from_txt(file_bytes)

    # ── Content validation ─────────────────────────────────────────────────────
    cleaned = text.strip()

    if len(cleaned) < 200:
        # Could be a scanned image PDF (admit card, certificate, etc.) or just not a resume
        if filename.endswith(".pdf"):
            raise HTTPException(400, "This does not look like a resume. It may be a scanned document (admit card, certificate, etc.). Please upload a text-based resume PDF or a .txt file.")
        else:
            raise HTTPException(400, "This does not look like a resume — not enough readable text found. Please upload your CV or resume document.")

    # ── Use LLM to classify if the document is a resume ──────────────────────
    event_type_hint = ""
    if event.pipeline_config:
        event_type_hint = event.pipeline_config.get("event_type", "")
    is_resume, rejection_reason = llm.classify_is_resume(
        cleaned[:3000],
        event_name=event.name,
        event_description=event.description or "",
        event_type=event_type_hint,
    )
    if not is_resume:
        raise HTTPException(400, rejection_reason)

    # Build event context for AI scoring
    event_context = {
        "event_name": event.name,
        "description": event.description or "",
    }
    if event.pipeline_config:
        pc = event.pipeline_config
        event_context["evaluation_criteria"] = pc.get("evaluation_criteria", [])
        fr = pc.get("formation_rules", {})
        event_context["required_skills_hint"] = fr.get("skill_focus", "")
        event_context["event_type"] = pc.get("event_type", "")
    if event.formation_rules:
        event_context["team_size"] = event.formation_rules.get("team_size", 3)

    try:
        # If your LLM call takes longer than X seconds, it will fail, 
        # and you can provide a "manual entry" fallback for the user.
        return llm.extract_profile_from_resume(cleaned, event_context=event_context)
    except Exception as e:
        logger.error(f"Resume parsing failed: {e}")
        # FALLBACK: Return a generic response that allows the user to continue manually
        return {
            "name": "",
            "skills": [],
            "level": "Intermediate",
            "error": "Could not auto-parse resume. Please fill details manually."
        }
