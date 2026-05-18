import io
import csv
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_committee, create_portal_token, decode_portal_token
from ..schemas import ParticipantCreate, ParticipantOut, CSVImportResult, PortalData
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

    # Check duplicate email within event
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
    participant.portal_token = create_portal_token(participant.id)
    db.add(participant)

    log = models.ActivityLog(
        event_id=event_id,
        message=f"Participant '{payload.name}' added ({payload.level})",
        log_type="success",
    )
    db.add(log)
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

    log = models.ActivityLog(
        event_id=event_id,
        message=f"Participant '{name}' removed from roster",
        log_type="warning",
    )
    db.add(log)
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
    text = content.decode("utf-8-sig")  # handle BOM
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

            # Check duplicate
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
        log = models.ActivityLog(
            event_id=event_id,
            message=f"CSV import: {imported} participants added, {skipped} skipped",
            log_type="success",
        )
        db.add(log)

    db.commit()
    return CSVImportResult(imported=imported, skipped=skipped, errors=errors)


# ── Participant Portal (public, JWT-token based) ───────────────────────────────

@router.get("/portal/{token}", response_model=PortalData)
def get_portal(
    event_id: str,
    token: str,
    db: Session = Depends(get_db),
):
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

    current_stage = (
        db.query(models.PipelineStage)
        .filter(
            models.PipelineStage.event_id == event_id,
            models.PipelineStage.status == models.StageStatus.active,
        )
        .first()
    )

    # Build key dates from stages
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

    # Check progression eligibility (top 50% of teams by score)
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

    return PortalData(
        participant=participant,
        team=team,
        current_stage=current_stage.name if current_stage else None,
        current_stage_index=event.current_stage_index,
        key_dates=key_dates,
        event_name=event.name,
        progression_eligible=progression_eligible,
    )
