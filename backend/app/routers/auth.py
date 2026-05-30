import time
from collections import defaultdict
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import verify_password, create_access_token, get_current_user
from ..schemas import LoginRequest, TokenResponse
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


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role.value,
    }
