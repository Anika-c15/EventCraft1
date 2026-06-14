import time
import random
import string
from pydantic import BaseModel, EmailStr
from collections import defaultdict
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import verify_password, create_access_token, get_current_user, hash_password
from ..schemas import LoginRequest, TokenResponse, RegisterRequest
from .. import models
from datetime import datetime, timedelta
from ..email_service import send_email
from ..models import OTPVerification

router = APIRouter(prefix="/api/auth", tags=["auth"])

def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))

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

class SendOTPRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str


@router.post("/send-otp")
async def send_otp(
    payload: SendOTPRequest,
    db: Session = Depends(get_db)
):
    # delete existing OTPs for this email
    db.query(OTPVerification).filter(
        OTPVerification.email == payload.email
    ).delete()

    # generate new OTP
    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    otp_record = OTPVerification(
        email=payload.email,
        otp=otp,
        expires_at=expires_at,
    )
    db.add(otp_record)
    db.commit()

    # send email
    await send_email(
        to_email=payload.email,
        subject="EventCraft — Your OTP Verification Code",
        body=f"""Hi,

Your OTP for EventCraft registration is:

🔐 {otp}

This code is valid for 10 minutes.
Do not share this code with anyone.

If you did not request this, please ignore this email.

Regards,
EventCraft Team"""
    )

    return {"message": f"OTP sent to {payload.email}"}


@router.post("/verify-otp")
def verify_otp(
    payload: VerifyOTPRequest,
    db: Session = Depends(get_db)
):
    record = db.query(OTPVerification).filter(
        OTPVerification.email == payload.email,
        OTPVerification.is_verified == False
    ).order_by(OTPVerification.created_at.desc()).first()

    if not record:
        raise HTTPException(400, "No OTP found for this email")

    # check expiry
    if datetime.utcnow() > record.expires_at.replace(tzinfo=None):
        raise HTTPException(400, "OTP has expired. Please request a new one")

    # check OTP
    if record.otp != payload.otp:
        raise HTTPException(400, "Invalid OTP")

    # mark verified
    record.is_verified = True
    db.commit()

    return {"message": "Email verified successfully", "verified": True}



@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if limiter.is_rate_limited(client_ip):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")

    user = db.query(models.User).filter(models.User.email == payload.email).first()

    if not user or not user.hashed_password:
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(403, "Account disabled")

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user_id=user.id, name=user.name, role=user.role.value)


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    otp_verified = db.query(OTPVerification).filter(
        OTPVerification.email == payload.email,
        OTPVerification.is_verified == True
    ).first()
    
    if not otp_verified:
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your email via OTP first.")

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
    event_name = f"{payload.name}'s Hackathon 2026"
    event = models.Event(
        name=event_name,
        description=f"AI-Powered event space for {payload.name}.",
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
    return TokenResponse(access_token=token, user_id=user.id, name=user.name, role=user.role.value)


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role.value,
    }
