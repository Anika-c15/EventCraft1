"""
Celery async task queue.
- Uses Redis as broker + backend.
- Falls back to synchronous in-process execution if Redis is unavailable.
- Workers are started separately: `celery -A app.tasks worker --loglevel=info`
"""
import logging
from typing import List, Dict, Any

from fastapi import BackgroundTasks
logger = logging.getLogger(__name__)


def safe_execute(bg_tasks: BackgroundTasks, task, func, *args, **kwargs):
    """Try Redis, fall back to FastAPI BackgroundTasks if it fails."""
    if CELERY_AVAILABLE and celery_app and task:
        try:
            task.apply_async(args=args, kwargs=kwargs)
            return
        except Exception as e:
            logger.warning(f"⚠️ Celery failed, falling back to BackgroundTasks: {e}")
    bg_tasks.add_task(func, *args, **kwargs)

# ── Celery setup ───────────────────────────────────────────────────────────────

def _make_celery():
    from .config import settings
    try:
        import redis as redis_lib
        # Quick connectivity check before creating Celery app
        redis_url = settings.REDIS_URL or ""
        if redis_url.startswith("rediss://"):
            _sep = "&" if "?" in redis_url else "?"
            redis_url = f"{redis_url}{_sep}ssl_cert_reqs=none"
            
        r = redis_lib.from_url(redis_url, socket_connect_timeout=1)
        r.ping()

        from celery import Celery
        app = Celery(
            "eventcraft",
            broker=redis_url,
            backend=redis_url,
            include=["app.tasks"],
        )
        app.conf.update(
            task_serializer="json",
            result_serializer="json",
            accept_content=["json"],
            timezone="UTC",
            enable_utc=True,
            task_always_eager=False,
            task_acks_late=True,
            worker_prefetch_multiplier=1,
            # Retry failed tasks up to 3 times
            task_max_retries=3,
            task_default_retry_delay=30,
        )
        logger.info("✅ Celery connected to Redis")
        return app, True
    except Exception as e:
        logger.warning(f"⚠️  Redis unavailable ({e}) — tasks will run synchronously")
        return None, False


celery_app, CELERY_AVAILABLE = _make_celery()


def run_async(func, *args, **kwargs):
    """Dispatch to Celery if available, otherwise run inline."""
    if CELERY_AVAILABLE and celery_app:
        return func.apply_async(args=args, kwargs=kwargs)
    return func(*args, **kwargs)


# ── Task: Generate team rationales via Gemini ──────────────────────────────────

def _generate_rationales(event_id: str, team_data: List[Dict], rules: Dict):
    from .database import SessionLocal
    from . import models, llm
    from .ws import broadcast_sync

    db = SessionLocal()
    try:
        rationales = llm.generate_all_team_rationales(team_data, rules)

        for team_dict in team_data:
            team = db.query(models.Team).filter(models.Team.id == team_dict["id"]).first()
            if team:
                r = rationales.get(team_dict["name"], "")
                # Use static fallback if LLM returned an error
                if not r or r.startswith("["):
                    from .routers.teams import STATIC_RATIONALES
                    idx = next(
                        (i for i, t in enumerate(team_data) if t["id"] == team_dict["id"]), 0
                    )
                    r = STATIC_RATIONALES[idx % len(STATIC_RATIONALES)]
                team.rationale = r

        db.commit()

        log = models.ActivityLog(
            event_id=event_id,
            message=f"AI rationales generated for {len(team_data)} teams",
            log_type="success",
        )
        db.add(log)
        db.commit()

        # Push WebSocket update
        broadcast_sync(event_id, {"type": "rationales_ready", "team_count": len(team_data)})

    except Exception as e:
        logger.error(f"Rationale generation error: {e}")
    finally:
        db.close()


# ── Task: Send bulk emails ─────────────────────────────────────────────────────

def _send_bulk_email(
    event_id: str,
    comm_id: str,
    recipients: List[Dict],
    subject: str,
    body_template: str,
):
    import asyncio
    from datetime import datetime
    from .database import SessionLocal
    from . import models
    from .email_service import send_bulk_emails
    from .ws import broadcast_sync

    db = SessionLocal()
    try:
        results = asyncio.run(send_bulk_emails(recipients, subject, body_template))

        comm = db.query(models.Communication).filter(models.Communication.id == comm_id).first()
        if comm:
            comm.status = models.CommStatus.sent if results["failed"] == 0 else models.CommStatus.failed
            comm.sent_at = datetime.utcnow()
            db.commit()

        log_type = "success" if results["failed"] == 0 else "warning"
        log = models.ActivityLog(
            event_id=event_id,
            message=f"Emails sent: {results['sent']} delivered, {results['failed']} failed",
            log_type=log_type,
        )
        db.add(log)
        db.commit()

        # Push WebSocket update
        broadcast_sync(event_id, {
            "type": "email_sent",
            "sent": results["sent"],
            "failed": results["failed"],
            "comm_id": comm_id,
        })

    except Exception as e:
        logger.error(f"Bulk email error: {e}")
    finally:
        db.close()




# ── Register as Celery tasks ─────────────────────────────────────────────────

if CELERY_AVAILABLE and celery_app:
    generate_team_rationales_task = celery_app.task(
        name="tasks.generate_rationales",
        bind=False,
    )(_generate_rationales)

    send_bulk_email_task = celery_app.task(
        name="tasks.send_bulk_email",
        bind=False,
    )(_send_bulk_email)
else:
    # Plain functions — called synchronously
    generate_team_rationales_task = None
    send_bulk_email_task = None
