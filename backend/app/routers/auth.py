import time
from collections import defaultdict
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import verify_password, create_access_token, get_current_user, hash_password
from ..schemas import LoginRequest, TokenResponse, RegisterRequest
from .. import models
from ..rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": user.id})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role.value,
    )

@router.post("/register", response_model=TokenResponse)
@limiter.limit("3/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        role=models.UserRole.committee,
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Auto-create a brand new default event space for the registered committee user
    event_name = f"{payload.org_name} Hackathon 2026"
    event = models.Event(
        name=event_name,
        description=f"AI-Powered event space for {payload.org_name}.",
        owner_id=user.id,
        formation_rules={
            "event_name": event_name,
            "team_size": 3,
            "allow_incomplete_teams": False,
            "skill_balance": True,
            "institution_diversity": True,
            "max_per_institution": 1,
            "experience_level_grouping": "mixed",
            "max_teams": 10,
        },
    )
    db.add(event)
    db.flush()

    # Create default pipeline stages
    from .events import DEFAULT_STAGES
    for i, stage_data in enumerate(DEFAULT_STAGES):
        stage = models.PipelineStage(
            event_id=event.id,
            name=stage_data["name"],
            description=stage_data["description"],
            order_index=i,
            status=models.StageStatus.active if i == 0 else models.StageStatus.pending,
            tasks=stage_data["tasks"],
        )
        db.add(stage)

    # Initial activity log
    log = models.ActivityLog(
        event_id=event.id,
        message=f"Event '{event_name}' created",
        log_type="success",
    )
    db.add(log)

    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role.value,
    )

@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role.value,
    }
