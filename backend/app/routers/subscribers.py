from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import asyncio

from ..database import get_db
from ..auth import get_current_user
from ..email_service import send_email
from ..config import settings
from .. import models, schemas

router = APIRouter(prefix="/api/subscribers", tags=["subscribers"])


# ── Email builder ──────────────────────────────────────────────────────────────

def _build_notification_email(name: str, event_name: str, description: str, unsubscribe_url: str) -> tuple[str, str]:
    """Returns (subject, html_body)."""
    subject = f"New Event Announced: {event_name}"

    plain = (
        f"Hi {name},\n\n"
        f"A new event has been announced: {event_name}\n\n"
        f"{description}\n\n"
        f"Stay tuned for more details.\n\n"
        f"Regards,\nEventCraft Team\n\n"
        f"---\n"
        f"To unsubscribe, visit: {unsubscribe_url}"
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#E8450A;padding:20px 28px;border-radius:12px 12px 0 0">
            <span style="color:white;font-size:20px;font-weight:700;letter-spacing:-0.5px">EventCraft</span>
            <span style="color:rgba(255,255,255,0.7);font-size:11px;margin-left:8px;text-transform:uppercase;letter-spacing:2px">Orchestration System</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:white;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;font-size:14px;line-height:1.7;color:#374151">
            <p style="margin:0 0 12px 0">Hi <strong>{name}</strong>,</p>
            <p style="margin:0 0 20px 0">A new event has been announced:</p>

            <div style="background:#FFF7F5;border-left:4px solid #E8450A;border-radius:6px;padding:16px 20px;margin-bottom:20px">
              <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#E8450A">{event_name}</p>
              <p style="margin:0;font-size:13px;color:#6b7280">{description}</p>
            </div>

            <p style="margin:0;color:#6b7280;font-size:13px">Stay tuned for registration details and updates.</p>
          </td>
        </tr>

        <!-- Unsubscribe footer -->
        <tr>
          <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 28px;text-align:center">
            <p style="margin:0 0 6px 0;font-size:12px;color:#9ca3af">
              You're receiving this because you subscribed to EventCraft event notifications.
            </p>
            <p style="margin:0;font-size:12px;color:#9ca3af">
              Don't want future emails?
              <a href="{unsubscribe_url}" style="color:#E8450A;text-decoration:underline">Unsubscribe here</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    return subject, html


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
    reason: str = ""

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


# ── Committee: notify all — sends real emails ──────────────────────────────────

@router.post("/notify", response_model=dict)
async def notify_subscribers(
    data: schemas.NotifySubscribersRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    unnotified = db.query(models.Subscriber).filter(models.Subscriber.notified == False).all()
    if not unnotified:
        return {"notified": 0, "sent": 0, "failed": 0}

    unsubscribe_url = f"{settings.FRONTEND_URL}/subscribe"
    description = data.description or "Stay tuned for more details and registration information."

    async def _send_one(sub: models.Subscriber):
        subject, html = _build_notification_email(
            name=sub.name,
            event_name=data.event_name,
            description=description,
            unsubscribe_url=unsubscribe_url,
        )
        return await send_email(
            to_email=sub.email,
            subject=subject,
            body=f"New Event: {data.event_name}\n\n{description}\n\nUnsubscribe: {unsubscribe_url}",
            to_name=sub.name,
            html_body=html,
        )

    results = await asyncio.gather(*[_send_one(s) for s in unnotified], return_exceptions=True)

    sent = sum(1 for r in results if r is True)
    failed = len(results) - sent

    # Mark as notified regardless (so they aren't spammed on retry)
    for sub in unnotified:
        sub.notified = True
    db.commit()

    return {"notified": len(unnotified), "sent": sent, "failed": failed}
