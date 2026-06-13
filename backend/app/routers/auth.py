import time
from collections import defaultdict
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import verify_password, create_access_token, get_current_user, hash_password
from ..schemas import LoginRequest, TokenResponse, RegisterRequest
from .. import models

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRateLimiter:
    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self.attempts = defaultdict(list)

    def is_rate_limited(self, ip: str) -> bool:
        now = time.time()
        self.attempts[ip] = [t for t in self.attempts[ip] if now - t < self.window]
        if len(self.attempts[ip]) >= self.limit:
            return True
        self.attempts[ip].append(now)
        return False


limiter = LoginRateLimiter(limit=5, window=60)


@router.post("/login", response_model=TokenResponse)
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    if limiter.is_rate_limited(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again in a minute.",
        )

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
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
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
        formation_rules=None,
    )
    db.add(event)
    db.flush()

    # No default pipeline stages — pipeline is configured by the AI Agent

    # Initial activity log
    log = models.ActivityLog(
        event_id=event.id,
        message=f"Event '{event_name}' created — configure the pipeline using the AI Agent",
        log_type="info",
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
