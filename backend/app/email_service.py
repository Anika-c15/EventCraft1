"""
Email service with three tiers:
  1. SendGrid API  — if SENDGRID_API_KEY is set (recommended for production)
  2. SMTP          — if SMTP_USER + SMTP_PASSWORD are set
  3. Console log   — simulated send for local development
"""
import asyncio
import logging
from typing import Optional
from .config import settings

logger = logging.getLogger(__name__)


# ── SendGrid ───────────────────────────────────────────────────────────────────

async def _send_via_sendgrid(
    to_email: str,
    subject: str,
    body: str,
    to_name: Optional[str] = None,
    html_body: Optional[str] = None,
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

        # If html_body provided use it directly, otherwise convert plain text
        final_html = html_body if html_body else _to_html(body)
        # Plain text: strip HTML tags if body looks like HTML
        plain = body if not body.strip().startswith("<") else "Please view this email in an HTML-capable email client."

        message = Mail(
            from_email=from_email,
            to_emails=to_addr,
            subject=subject,
        )
        message.add_content(Content("text/plain", plain))
        message.add_content(Content("text/html", final_html))

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: sg.send(message))

        if response.status_code in (200, 202):
            logger.info(f"[SendGrid] Sent to {to_email}: {subject}")
            return True
        else:
            logger.error(f"[SendGrid] Failed ({response.status_code}) to {to_email}: {response.body}")
            print(f"[SendGrid] FAILED status={response.status_code} body={response.body}")
            return False

    except Exception as e:
        logger.error(f"[SendGrid] Error sending to {to_email}: {e}")
        print(f"[SendGrid] EXCEPTION sending to {to_email}: {e}")
        return False


# ── SMTP ───────────────────────────────────────────────────────────────────────

async def _send_via_smtp(
    to_email: str,
    subject: str,
    body: str,
    to_name: Optional[str] = None,
    html_body: Optional[str] = None,
) -> bool:
    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
        msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email

        # Plain text
        plain = body if not body.strip().startswith("<") else "Please view this email in an HTML-capable email client."
        # HTML
        final_html = html_body if html_body else _to_html(body)

        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(final_html, "html"))

        tls_context = None
        if settings.SMTP_SKIP_TLS_VERIFY:
            import ssl
            tls_context = ssl.create_default_context()
            tls_context.check_hostname = False
            tls_context.verify_mode = ssl.CERT_NONE

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            tls_context=tls_context,
        )
        logger.info(f"[SMTP] Sent to {to_email}: {subject}")
        print(f"[SMTP] ✅ Sent to {to_email}: {subject}")
        return True

    except Exception as e:
        logger.error(f"[SMTP] Error sending to {to_email}: {e}")
        print(f"[SMTP] ❌ Error sending to {to_email}: {e}")
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
    html_body: Optional[str] = None,
) -> bool:
    if settings.SENDGRID_API_KEY:
        return await _send_via_sendgrid(to_email, subject, body, to_name, html_body)
    elif settings.SMTP_USER and settings.SMTP_PASSWORD:
        return await _send_via_smtp(to_email, subject, body, to_name, html_body)
    else:
        return await _send_console(to_email, subject, body, to_name)


async def send_bulk_emails(
    recipients: list[dict],
    subject: str,
    body_template: str,
) -> dict:
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
    event_id: str,
    role: str = "participant"
) -> bool:
    portal_map = {
        "participant": f"{settings.FRONTEND_URL}/portal",
        "judge": f"{settings.FRONTEND_URL}/judge",
        "committee": f"{settings.FRONTEND_URL}/dashboard"
    }
    link = f"{portal_map.get(role, settings.FRONTEND_URL)}/{token}?event={event_id}"

    body = (
        f"Hi {name},\n\n"
        f"Welcome to {event_name}!\n\n"
        f"You have been successfully registered as a {role.capitalize()}.\n"
        f"Access your portal using the link below:\n\n"
        f"{link}\n\n"
        f"This link is valid for 48 hours.\n"
        f"No login or password required.\n\n"
        f"If you did not register, please ignore this email.\n\n"
        f"Regards,\n"
        f"EventCraft Team"
    )

    return await send_email(
        to_email=email,
        subject=f"Welcome to {event_name} — Your Portal Access",
        body=body,
        to_name=name
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_html(plain_text: str) -> str:
    body_html = plain_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    body_html = body_html.replace("\n", "<br>")
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:Inter,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
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
        <tr>
          <td style="background:white;padding:28px;border:1px solid #e5e7eb;
                     border-top:none;border-radius:0 0 12px 12px;
                     font-size:14px;line-height:1.7;color:#374151">
            {body_html}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;text-align:center;font-size:12px;color:#9ca3af">
            EventCraft Intelligent Event Orchestration System
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""