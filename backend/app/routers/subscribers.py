from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api/subscribers", tags=["subscribers"])


# ── Public: subscribe ──────────────────────────────────────────────────────────

@router.post("", response_model=schemas.SubscriberOut, status_code=201)
def subscribe(data: schemas.SubscriberCreate, db: Session = Depends(get_db)):
    """Anyone can subscribe — no auth required."""
    existing = db.query(models.Subscriber).filter(
        models.Subscriber.email == data.email.lower().strip()
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This email is already subscribed.")

    sub = models.Subscriber(
        name=data.name.strip(),
        email=data.email.lower().strip(),
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


# ── Public: unsubscribe ────────────────────────────────────────────────────────

class UnsubscribeRequest(BaseModel):
    email: str

@router.post("/unsubscribe", status_code=200)
def unsubscribe(data: UnsubscribeRequest, db: Session = Depends(get_db)):
    """Anyone can unsubscribe by email — no auth required."""
    sub = db.query(models.Subscriber).filter(
        models.Subscriber.email == data.email.lower().strip()
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="This email is not subscribed.")
    db.delete(sub)
    db.commit()
    return {"message": "You have been unsubscribed successfully."}


# ── Committee: list all subscribers ───────────────────────────────────────────

@router.get("", response_model=list[schemas.SubscriberOut])
def list_subscribers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Subscriber).order_by(models.Subscriber.subscribed_at.desc()).all()


# ── Committee: delete a subscriber ────────────────────────────────────────────

@router.delete("/{subscriber_id}", status_code=204)
def remove_subscriber(
    subscriber_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscriber not found.")
    db.delete(sub)
    db.commit()


# ── Committee: mark all as notified ───────────────────────────────────────────

@router.post("/notify", response_model=dict)
def notify_subscribers(
    data: schemas.NotifySubscribersRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    unnotified = db.query(models.Subscriber).filter(models.Subscriber.notified == False).all()
    count = len(unnotified)
    for sub in unnotified:
        sub.notified = True
    db.commit()
    return {"notified": count}
