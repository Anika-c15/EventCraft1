"""
Email service with three tiers:
  1. SendGrid API  — if SENDGRID_API_KEY is set (recommended for production)
  2. SMTP          — if SMTP_USER + SMTP_PASSWORD are set
  3. Console log   — simulated send for local development
"""
import asyncio
import logging
from typing import Optional
import jwt
from datetime import datetime, timedelta
from .config import settings

logger = logging.getLogger(__name__)


# ── SendGrid ───────────────────────────────────────────────────────────────────

async def _send_via_sendgrid(
    to_email: str,
    subject: str,
    body: str,
    to_name: Optional[str] = None,
) -> bool:
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail, Email, To, Content

        sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)

        from_email = Email(
            email=settings.EMAIL_FROM.split("<")[-1].strip(">").strip()
            if "<" in settings.EMAIL_FROM else settings.EMAIL_FROM,
            name=settings.EMAIL_FROM_NAME,
        )
        to_addr = To(email=to_email, name=to_name or to_email)

        html_body = _to_html(body)

        message = Mail(
            from_email=from_email,
            to_emails=to_addr,
            subject=subject,
        )
        message.add_content(Content("text/plain", body))
        message.add_content(Content("text/html", html_body))

        # Run blocking SDK call in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: sg.send(message))

        if response.status_code in (200, 202):
            logger.info(f"[SendGrid] Sent to {to_email}: {subject}")
            return True
        else:
            logger.error(f"[SendGrid] Failed ({response.status_code}) to {to_email}")
            return False

    except Exception as e:
        logger.error(f"[SendGrid] Error sending to {to_email}: {e}")
        return False


# ── SMTP ───────────────────────────────────────────────────────────────────────

async def _send_via_smtp(
    to_email: str,
    subject: str,
    body: str,
    to_name: Optional[str] = None,
) -> bool:
    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email

        msg.attach(MIMEText(body, "plain"))
        msg.attach(MIMEText(_to_html(body), "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info(f"[SMTP] Sent to {to_email}: {subject}")
        return True

    except Exception as e:
        logger.error(f"[SMTP] Error sending to {to_email}: {e}")
        return False


# ── Console (dev fallback) ─────────────────────────────────────────────────────

async def _send_console(
    to_email: str,
    subject: str,
    body: str,
    to_name: Optional[str] = None,
) -> bool:
    print(
        f"\n{'='*60}\n"
        f"[SIMULATED EMAIL]\n"
        f"To:      {to_name or to_email} <{to_email}>\n"
        f"Subject: {subject}\n"
        f"Body:\n{body}\n"
        f"{'='*60}\n"
    )
    logger.info(f"[Console] Simulated email to {to_email}: {subject}")
    return True


# ── Public API ─────────────────────────────────────────────────────────────────

async def send_email(
    to_email: str,
    subject: str,
    body: str,
    to_name: Optional[str] = None,
) -> bool:
    """
    Send a single email. Automatically picks the best available transport.
    Priority: SendGrid > SMTP > Console
    """
    if settings.SENDGRID_API_KEY:
        return await _send_via_sendgrid(to_email, subject, body, to_name)
    elif settings.SMTP_USER and settings.SMTP_PASSWORD:
        return await _send_via_smtp(to_email, subject, body, to_name)
    else:
        return await _send_console(to_email, subject, body, to_name)


async def send_bulk_emails(
    recipients: list[dict],
    subject: str,
    body_template: str,
) -> dict:
    """
    Send personalised emails to multiple recipients concurrently.

    recipients: [{"email": "...", "name": "...", "vars": {"participant_name": "..."}}]
    body_template: string with {participant_name} placeholders
    """
    results = {"sent": 0, "failed": 0, "details": []}

    async def _send_one(r: dict):
        body = body_template
        for key, val in r.get("vars", {}).items():
            body = body.replace(f"{{{key}}}", str(val))
        ok = await send_email(r["email"], subject, body, r.get("name"))
        return {"email": r["email"], "ok": ok}

    outcomes = await asyncio.gather(
        *[_send_one(r) for r in recipients],
        return_exceptions=True,
    )

    for outcome in outcomes:
        if isinstance(outcome, Exception):
            results["failed"] += 1
            results["details"].append({"ok": False, "error": str(outcome)})
        elif outcome.get("ok"):
            results["sent"] += 1
            results["details"].append(outcome)
        else:
            results["failed"] += 1
            results["details"].append(outcome)

    return results

async def send_portal_link_email(
    name: str,
    email: str,
    event_name: str,
    token: str,
    event_id: str,        # ← add this
    role: str = "participant"
) -> bool:
    from .config import settings

    portal_map = {
        "participant": f"{settings.FRONTEND_URL}/portal",
        "judge": f"{settings.FRONTEND_URL}/judge",
        "committee": f"{settings.FRONTEND_URL}/dashboard"
    }
    link = f"{portal_map.get(role, settings.FRONTEND_URL)}/{token}?event={event_id}"
    subject = f"Welcome to {event_name} — Your Portal Access"

    body = f"""Hi {name},

Welcome to {event_name}! 🎉

You have been successfully registered as a {role.capitalize()}.

Access your personal portal using the link below:

👉 {link}

⚠️  This link is valid for 48 hours.
    No login or password required — just click and you're in.

If you did not register for this event, please ignore this email.

Regards,
EventCraft Team"""

    return await send_email(
        to_email=email,
        subject=subject,
        body=body,
        to_name=name
    )


def generate_portal_token(participant_id: str, email: str, event_id: str, role: str = "participant") -> str:
    from .config import settings
    payload = {
        "participant_id": participant_id,
        "email": email,
        "event_id": event_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=48)
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_html(plain_text: str) -> str:
    """Convert plain text email body to simple branded HTML."""
    body_html = plain_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    body_html = body_html.replace("\n", "<br>")
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:Inter,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#E8450A;padding:20px 28px;border-radius:12px 12px 0 0">
            <span style="color:white;font-size:20px;font-weight:700;letter-spacing:-0.5px">
              EventCraft
            </span>
            <span style="color:rgba(255,255,255,0.7);font-size:11px;margin-left:8px;
                         text-transform:uppercase;letter-spacing:2px">
              Orchestration System
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:white;padding:28px;border:1px solid #e5e7eb;
                     border-top:none;border-radius:0 0 12px 12px;
                     font-size:14px;line-height:1.7;color:#374151">
            {body_html}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 0;text-align:center;
                     font-size:12px;color:#9ca3af">
            EventCraft Intelligent Event Orchestration System
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
