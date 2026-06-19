from fastapi import HTTPException
from sqlalchemy.orm import Session
from .models import Event

def require_event_not_completed(event_id: str, db: Session):
    """Raise 400 if the event is completed/locked. Call at the top of write endpoints."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.is_completed:
        raise HTTPException(400, "This event is completed and locked. No modifications are allowed.")
