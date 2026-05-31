from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from . import models

pwd_context = CryptContext(schemes=["bcrypt", "sha256_crypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_portal_token(participant_id: str) -> str:
    """JWT for participant portal — expires in 14 days."""
    data = {
        "sub": participant_id,
        "type": "portal",
        "exp": datetime.utcnow() + timedelta(days=14),
    }
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_portal_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        if payload.get("type") != "portal":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def create_judge_token(judge_email: str, event_id: str) -> str:
    """Signed JWT for judge link-based access. Expires in 7 days."""
    data = {
        "sub": judge_email,
        "type": "judge",
        "event_id": event_id,
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_judge_token(token: str) -> Optional[dict]:
    """Returns {"email": str, "event_id": str} or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "judge":
            return None
        return {"email": payload.get("sub"), "event_id": payload.get("event_id")}
    except JWTError:
        return None


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_committee(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role not in (models.UserRole.admin, models.UserRole.committee):
        raise HTTPException(status_code=403, detail="Committee access required")
    return current_user
