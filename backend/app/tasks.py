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
        import redis
        # 1. Configure SSL options for Upstash (rediss://)
        redis_kwargs = {"socket_connect_timeout": 5}
        if settings.REDIS_URL.startswith("rediss://"):
            redis_kwargs["ssl_cert_reqs"] = None  # Disable certificate validation for cloud Redis
        
        # 2. Connectivity check
        r = redis.from_url(settings.REDIS_URL, **redis_kwargs)
        r.ping()

        from celery import Celery
        app = Celery(
            "eventcraft",
            broker=settings.REDIS_URL,
            backend=settings.REDIS_URL,
            include=["app.tasks"],
        )
        
        # 3. Configure SSL for Celery (broker and backend)
        app.conf.update(
            task_serializer="json",
            result_serializer="json",
            accept_content=["json"],
            timezone="UTC",
            enable_utc=True,
            task_always_eager=False,
            task_acks_late=True,
            worker_prefetch_multiplier=1,
            task_max_retries=3,
            task_default_retry_delay=30,
            # If using SSL, Celery needs these settings
            broker_use_ssl={'ssl_cert_reqs': None} if settings.REDIS_URL.startswith("rediss://") else None,
            redis_backend_use_ssl={'ssl_cert_reqs': None} if settings.REDIS_URL.startswith("rediss://") else None,
        )
        
        logger.info("✅ Celery connected to Redis")
        return app, True
    except Exception as e:
        logger.warning(f"⚠️ Redis unavailable ({e}) — tasks will run synchronously")
        return None, False


celery_app, CELERY_AVAILABLE = None, False


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
        # --- FIX: Ensure every team dict has a 'members' key ---
        for team_dict in team_data:
            if "members" not in team_dict:
                team_dict["members"] = [] 

        # Now pass the safe data to the LLM
        rationales = llm.generate_all_team_rationales(team_data, rules)

        for team_dict in team_data:
            team = db.query(models.Team).filter(models.Team.id == team_dict["id"]).first()
            if team:
                # Use .get() to avoid KeyError if the name is missing
                r = rationales.get(team_dict.get("name", "Unknown Team"), "")
                
                # Use static fallback if LLM returned an error or is empty
                if not r or r.startswith("["):
                    from .routers.teams import STATIC_RATIONALES
                    # Safe index calculation
                    idx = next(
                        (i for i, t in enumerate(team_data) if t.get("id") == team_dict["id"]), 0
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

class MockTask:
    """Fakes the Celery task interface so safe_execute doesn't crash."""
    def __init__(self, func):
        self.func = func
    
    def apply_async(self, args=None, kwargs=None):
        # When Celery isn't there, we just run the function directly
        return self.func(*(args or []), **(kwargs or {}))

if CELERY_AVAILABLE and celery_app:
    # Register as actual Celery tasks
    generate_team_rationales_task = celery_app.task(
        name="tasks.generate_rationales",
        bind=False,
    )(_generate_rationales)

    send_bulk_email_task = celery_app.task(
        name="tasks.send_bulk_email",
        bind=False,
    )(_send_bulk_email)
else:
    # Use the Mock wrapper so the code never sees a 'None' value
    generate_team_rationales_task = MockTask(_generate_rationales)
    send_bulk_email_task = MockTask(_send_bulk_email)