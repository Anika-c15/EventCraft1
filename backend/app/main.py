from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import os

from .database import engine, SessionLocal
from . import models
from .config import settings
from .auth import hash_password, create_portal_token
from .routers import auth, events, participants, teams, evaluations, approvals, communications, agent, omni_agent
from .routers import peer_review
from .routers.websocket import router as ws_router
from .routers import qa
from .routers import subscribers as subscribers_router
from .routers import social_scraping
from .scheduler import start_scheduler, scheduler
from .rate_limiter import limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    _migrate_db()
    _seed_db()
    start_scheduler()
    yield
    scheduler.shutdown()


def _migrate_db():
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()

        # ── teams table migrations ──────────────────────────────────────────
        if "teams" in existing_tables:
            columns = [col["name"] for col in inspector.get_columns("teams")]
            for col, col_type in [
                ("public_vote_score",  "FLOAT"),
                ("ai_proposed_score",  "FLOAT"),
                ("bias_rationale",     "TEXT"),
                ("judge_avg_score",    "FLOAT"),
                ("social_vote_score",  "FLOAT"),
                ("social_vote_total_votes", "INTEGER DEFAULT 0"),
                ("social_vote_last_updated", "TIMESTAMP"),
                ("github_link",        "TEXT"),
                ("demo_link",          "TEXT"),
                ("is_locked",          "BOOLEAN DEFAULT FALSE"),
                ("name_locked",        "BOOLEAN DEFAULT FALSE"),
                ("project_title",      "TEXT"),
                ("project_description","TEXT"),
                ("github_url",         "TEXT"),
                ("video_url",          "TEXT"),
                ("presentation_url",   "TEXT"),
                ("submission_status",  "TEXT DEFAULT 'Draft'"),
            ]:
                if col not in columns:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE teams ADD COLUMN {col} {col_type}"))
                        print(f"🚀 Migrated: added {col} to teams")
                    except Exception as col_err:
                        print(f"⚠️ Could not add column {col} to teams: {col_err}")

        # ── events table migrations ──────────────────────────────────────────
        if "events" in existing_tables:
            columns_events = [col["name"] for col in inspector.get_columns("events")]
            if "owner_id" not in columns_events:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE events ADD COLUMN owner_id VARCHAR(255)"))
                    print("🚀 Migrated: added owner_id to events")
                except Exception as col_err:
                    print(f"⚠️ Could not add owner_id to events: {col_err}")
            if "scoring_weights" not in columns_events:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE events ADD COLUMN scoring_weights JSON"))
                    print("🚀 Migrated: added scoring_weights to events")
                except Exception as col_err:
                    print(f"⚠️ Could not add scoring_weights to events: {col_err}")

        # ── peer_reviews table ──────────────────────────────────────────────
        if "peer_reviews" not in existing_tables:
            try:
                with engine.begin() as conn:
                    conn.execute(text("""
                        CREATE TABLE peer_reviews (
                            id          TEXT PRIMARY KEY,
                            event_id    TEXT NOT NULL REFERENCES events(id),
                            from_team_id TEXT NOT NULL REFERENCES teams(id),
                            to_team_id  TEXT NOT NULL REFERENCES teams(id),
                            score       FLOAT NOT NULL,
                            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                print("🚀 Migrated: created peer_reviews table")
            except Exception as tbl_err:
                print(f"⚠️ Could not create peer_reviews table: {tbl_err}")

        # ── subscribers table ───────────────────────────────────────────────
        if "subscribers" not in existing_tables:
            try:
                with engine.begin() as conn:
                    conn.execute(text("""
                        CREATE TABLE subscribers (
                             id            TEXT PRIMARY KEY,
                             name          TEXT NOT NULL,
                             email         TEXT NOT NULL UNIQUE,
                             notified      BOOLEAN DEFAULT FALSE,
                             subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                print("🚀 Migrated: created subscribers table")
            except Exception as tbl_err:
                 print(f"⚠️ Could not create subscribers table: {tbl_err}")

        # ── social_polls table ──────────────────────────────────────────────
        if "social_polls" not in existing_tables:
            try:
                with engine.begin() as conn:
                    conn.execute(text("""
                        CREATE TABLE social_polls (
                            id                  TEXT PRIMARY KEY,
                            event_id            TEXT NOT NULL REFERENCES events(id),
                            team_id             TEXT REFERENCES teams(id),
                            platform            TEXT NOT NULL,
                            poll_type           TEXT NOT NULL,
                            question_text       TEXT NOT NULL,
                            commentary          TEXT,
                            options             JSON NOT NULL,
                            option_team_mapping JSON,
                            platform_post_id    TEXT,
                            platform_poll_id    TEXT,
                            status              TEXT NOT NULL,
                            votes               JSON,
                            vote_snapshots      JSON,
                            total_votes         INTEGER DEFAULT 0,
                            normalized_score    FLOAT,
                            error_message       TEXT,
                            flagged             BOOLEAN DEFAULT FALSE,
                            flag_reason         TEXT,
                            admin_override_score FLOAT,
                            manual_pending      BOOLEAN DEFAULT FALSE,
                            duration_minutes    INTEGER DEFAULT 1440,
                            posted_at           TIMESTAMP,
                            ends_at             TIMESTAMP,
                            fetched_at          TIMESTAMP,
                            locked_at           TIMESTAMP,
                            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                print("🚀 Migrated: created social_polls table")
            except Exception as tbl_err:
                print(f"⚠️ Could not create social_polls table: {tbl_err}")

        # ── social_posts table ──────────────────────────────────────────────
        if "social_posts" not in existing_tables:
            try:
                with engine.begin() as conn:
                    conn.execute(text("""
                        CREATE TABLE social_posts (
                            id                  TEXT PRIMARY KEY,
                            team_id             TEXT NOT NULL REFERENCES teams(id),
                            event_id            TEXT NOT NULL REFERENCES events(id),
                            platform            TEXT NOT NULL,
                            url                 TEXT NOT NULL,
                            status              TEXT DEFAULT 'pending',
                            likes               INTEGER DEFAULT 0,
                            shares              INTEGER DEFAULT 0,
                            screenshot_url      TEXT,
                            screenshot_hash     TEXT,
                            last_scraped_at     TIMESTAMP,
                            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                print("🚀 Migrated: created social_posts table")
            except Exception as tbl_err:
                print(f"⚠️ Could not create social_posts table: {tbl_err}")
        else:
            columns_sp = [col["name"] for col in inspector.get_columns("social_posts")]
            if "screenshot_hash" not in columns_sp:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE social_posts ADD COLUMN screenshot_hash TEXT"))
                    print("🚀 Migrated: added screenshot_hash to social_posts")
                except Exception as col_err:
                    print(f"⚠️ Could not add screenshot_hash to social_posts: {col_err}")
            if "rejection_reason" not in columns_sp:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE social_posts ADD COLUMN rejection_reason TEXT"))
                    print("🚀 Migrated: added rejection_reason to social_posts")
                except Exception as col_err:
                    print(f"⚠️ Could not add rejection_reason to social_posts: {col_err}")
            if "retry_count" not in columns_sp:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE social_posts ADD COLUMN retry_count INTEGER DEFAULT 0"))
                    print("🚀 Migrated: added retry_count to social_posts")
                except Exception as col_err:
                    print(f"⚠️ Could not add retry_count to social_posts: {col_err}")

        # ── agent_messages table migrations ─────────────────────────────────
        if "agent_messages" in existing_tables:
            columns_agent = [col["name"] for col in inspector.get_columns("agent_messages")]
            for col, col_type in [
                ("user_id", "VARCHAR(255)"),
                ("user_role", "VARCHAR(50)"),
            ]:
                if col not in columns_agent:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE agent_messages ADD COLUMN {col} {col_type}"))
                        print(f"🚀 Migrated: added {col} to agent_messages")
                    except Exception as col_err:
                        print(f"⚠️ Could not add {col} to agent_messages: {col_err}")

        # ── pipeline_stages table migrations ─────────────────────────────────
        if "pipeline_stages" in existing_tables:
            columns_stages = [col["name"] for col in inspector.get_columns("pipeline_stages")]
            for col, col_type in [
                ("allows_submission", "BOOLEAN DEFAULT FALSE"),
                ("is_evaluation",     "BOOLEAN DEFAULT FALSE"),
                ("portal_description", "TEXT"),
            ]:
                if col not in columns_stages:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE pipeline_stages ADD COLUMN {col} {col_type}"))
                        print(f"🚀 Migrated: added {col} to pipeline_stages")
                    except Exception as col_err:
                        print(f"⚠️ Could not add column {col} to pipeline_stages: {col_err}")

    except Exception as e:
        print(f"⚠️ Migration error: {e}")



def _seed_db():
    db = SessionLocal()
    try:
        # ── Admin user ──────────────────────────────────────────────────────
        admin_email = settings.ADMIN_EMAIL or "admin@eventcraft.com"
        admin_password = settings.ADMIN_PASSWORD
        
        if not admin_password:
            import secrets
            admin_password = secrets.token_urlsafe(12)
            print(f"⚠️  ADMIN_PASSWORD not set. Generated secure temporary password: {admin_password}")
            
        admin = db.query(models.User).filter(models.User.email == admin_email).first()
        if not admin:
            admin = models.User(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                name="Admin",
                role=models.UserRole.admin,
            )
            db.add(admin)
            db.flush()
            print(f"✅ Admin created: {admin_email} / {admin_password}")

        # ── Demo event (only if no events exist) ────────────────────────────
        if db.query(models.Event).count() == 0:
            _seed_demo_event(db)

        # Make sure the admin owns the seeded demo event if it has no owner
        seeded = db.query(models.Event).filter(models.Event.name == "EventCraft Hackathon 2026").first()
        if seeded and seeded.owner_id is None:
            seeded.owner_id = admin.id
            db.flush()

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️  Seed error: {e}")
    finally:
        db.close()


DEMO_STAGES = [
    {"name": "Participant Intake", "description": "Register and verify all participants, collect skill declarations and institutional affiliations.", "tasks": ["Open registration portal", "Collect participant profiles", "Verify institutional affiliations", "Approve participant roster"], "allows_submission": False, "is_evaluation": False, "portal_description": "Registration is open. Your profile has been received."},
    {"name": "Team Formation", "description": "AI-powered team formation based on skill complementarity, institution diversity, and experience levels.", "tasks": ["Configure formation rules", "Run AI team formation", "Review proposed teams", "Approve team compositions"], "allows_submission": False, "is_evaluation": False, "portal_description": "Teams are being formed. You'll receive an email once your team assignment is confirmed."},
    {"name": "Hacking", "description": "Teams work on their AI/ML projects.", "tasks": ["Provide project guidelines", "Offer mentorship and support", "Monitor progress", "Ensure resource availability"], "allows_submission": True, "is_evaluation": False, "portal_description": "Hacking is in progress! Build your project and submit it using the My Submission Hub."},
    {"name": "Evaluation", "description": "Judges evaluate team projects across innovation, execution, presentation, and impact dimensions.", "tasks": ["Open evaluation portal", "Collect judge scores", "Aggregate and normalize scores", "Flag anomalies for review"], "allows_submission": False, "is_evaluation": True, "portal_description": "Evaluation is underway. Judges are reviewing all team submissions."},
    {"name": "Results", "description": "Compile final rankings, generate certificates, and prepare announcement materials.", "tasks": ["Calculate final rankings", "Generate result reports", "Prepare certificates", "Draft announcement communications"], "allows_submission": False, "is_evaluation": False, "portal_description": "Results are being compiled. Final rankings will be announced soon."},
    {"name": "Progression", "description": "Advance qualifying participants and teams to the next round or final event.", "tasks": ["Identify qualifying teams", "Send progression notifications", "Update participant statuses", "Archive event data"], "allows_submission": False, "is_evaluation": False, "portal_description": "Qualifying teams are being notified for the next round."},
]

DEMO_PARTICIPANTS = [
    {"name": "Rohan Sharma",   "email": "rohan.sharma@iitd.ac.in",       "institution": "IIT Delhi",       "level": "Intermediate", "skills": ["Python", "Machine Learning", "TensorFlow"]},
    {"name": "Ananya Singh",   "email": "ananya.singh@iitb.ac.in",       "institution": "IIT Bombay",      "level": "Intermediate", "skills": ["React", "Node.js", "UI/UX"]},
    {"name": "Vikram Nair",    "email": "vikram.nair@iitm.ac.in",        "institution": "IIT Madras",      "level": "Intermediate", "skills": ["Embedded Systems", "C", "IoT"]},
    {"name": "Priya Iyer",     "email": "priya.iyer@iitk.ac.in",         "institution": "IIT Kanpur",      "level": "Intermediate", "skills": ["Data Science", "SQL", "R"]},
    {"name": "Aryan Gupta",    "email": "aryan.gupta@iitg.ac.in",        "institution": "IIT Guwahati",    "level": "Intermediate", "skills": ["Go", "Kubernetes", "Backend"]},
    {"name": "Sneha Reddy",    "email": "sneha.reddy@bits-pilani.ac.in", "institution": "BITS Pilani",     "level": "Intermediate", "skills": ["Flutter", "Firebase", "Mobile"]},
    {"name": "Karan Mehta",    "email": "karan.mehta@iitd.ac.in",        "institution": "IIT Delhi",       "level": "Advanced",     "skills": ["Rust", "Systems Programming", "WebAssembly"]},
    {"name": "Divya Patel",    "email": "divya.patel@iitb.ac.in",        "institution": "IIT Bombay",      "level": "Intermediate", "skills": ["Blockchain", "Solidity", "Web3"]},
    {"name": "Rahul Verma",    "email": "rahul.verma@nit.ac.in",         "institution": "NIT Trichy",      "level": "Beginner",     "skills": ["Java", "Spring Boot", "MySQL"]},
    {"name": "Meera Krishnan", "email": "meera.k@iisc.ac.in",            "institution": "IISc Bangalore",  "level": "Expert",       "skills": ["Computer Vision", "PyTorch", "CUDA"]},
    {"name": "Aditya Joshi",   "email": "aditya.joshi@iitm.ac.in",       "institution": "IIT Madras",      "level": "Intermediate", "skills": ["DevOps", "Docker", "CI/CD"]},
    {"name": "Pooja Nambiar",  "email": "pooja.n@bits-pilani.ac.in",     "institution": "BITS Pilani",     "level": "Intermediate", "skills": ["NLP", "Transformers", "Python"]},
]


def _seed_demo_event(db):
    import uuid

    event = models.Event(
        name="EventCraft Hackathon 2026",
        description="A 2-day AI/ML hackathon for top engineering students across India.",
        formation_rules={
            "event_name": "EventCraft Hackathon 2026",
            "team_size": 3,
            "allow_incomplete_teams": False,
            "skill_balance": True,
            "institution_diversity": True,
            "max_per_institution": 1,
            "experience_level_grouping": "mixed",
            "max_teams": 10,
        },
    )
    db.add(event)
    db.flush()

    # Pipeline stages
    for i, s in enumerate(DEMO_STAGES):
        stage = models.PipelineStage(
            event_id=event.id,
            name=s["name"],
            description=s["description"],
            order_index=i,
            status=models.StageStatus.active if i == 0 else models.StageStatus.pending,
            tasks=s["tasks"],
            allows_submission=s.get("allows_submission", False),
            is_evaluation=s.get("is_evaluation", False),
            portal_description=s.get("portal_description", None),
        )
        db.add(stage)

    # Participants
    level_map = {
        "Beginner": models.ParticipantLevel.beginner,
        "Intermediate": models.ParticipantLevel.intermediate,
        "Advanced": models.ParticipantLevel.advanced,
        "Expert": models.ParticipantLevel.expert,
    }
    status_map = {
        "Pooja Nambiar": models.ParticipantStatus.waitlisted,
        "Rahul Verma": models.ParticipantStatus.pending,
    }

    for p_data in DEMO_PARTICIPANTS:
        p_id = str(uuid.uuid4())
        p = models.Participant(
            id=p_id,
            event_id=event.id,
            name=p_data["name"],
            email=p_data["email"],
            institution=p_data["institution"],
            level=level_map[p_data["level"]],
            skills=p_data["skills"],
            status=status_map.get(p_data["name"], models.ParticipantStatus.active),
        )
        p.portal_token = create_portal_token(p_id)
        db.add(p)

    # Seed activity log
    for msg, log_type in [
        ("Demo event 'EventCraft Hackathon 2026' created with 12 participants", "success"),
        ("Formation rules configured: team size 3, institution diversity enabled", "info"),
        ("Pipeline initialized: 5 stages ready", "info"),
    ]:
        db.add(models.ActivityLog(event_id=event.id, message=msg, log_type=log_type))

    # Seed a pending approval
    db.add(models.Approval(
        event_id=event.id,
        type=models.ApprovalType.team_formation,
        status=models.ApprovalStatus.pending,
        description="12 participants loaded. Click 'Form Teams with AI' on the Teams page to generate team compositions, then approve here.",
        payload={},
    ))

    # Seed draft communications
    _seed_communications(db, event.id)

    db.flush()
    print(f"✅ Demo event seeded: {event.id} with {len(DEMO_PARTICIPANTS)} participants")


def _seed_communications(db, event_id: str):
    # Only seed if no communications exist for this event yet
    existing_count = db.query(models.Communication).filter(
        models.Communication.event_id == event_id
    ).count()
    if existing_count > 0:
        return  # Already seeded — don't duplicate

    # Try to generate AI drafts via Groq; fall back to static templates
    from . import llm as _llm

    stage_configs = [
        ("Participant Intake",  "all_participants", "All Participants",   models.CommStatus.draft),
        ("Team Formation",      "all_participants", "All Participants",   models.CommStatus.draft),
        ("Evaluation",          "judges",           "Judges Panel",       models.CommStatus.draft),
        ("Evaluation",          "all_participants", "All Participants",   models.CommStatus.draft),
        ("Results",             "all_participants", "All Participants",   models.CommStatus.draft),
        ("Progression",         "winners",          "Qualifying Teams",   models.CommStatus.draft),
    ]

    # Static fallbacks keyed by (stage, recipient_type)
    static_fallbacks = {
        ("Participant Intake", "all_participants"): {
            "subject": "Welcome to EventCraft Hackathon 2026 — Registration Confirmed",
            "body": "Dear {participant_name},\n\nWelcome to EventCraft Hackathon 2026! Your registration has been confirmed.\n\nHere's what to expect:\n1. Team Formation — Balanced teams will be formed based on your skills.\n2. Evaluation — Teams present solutions to expert judges.\n3. Results & Progression — Top teams advance to the final round.\n\nBest regards,\nEventCraft Committee",
        },
        ("Team Formation", "all_participants"): {
            "subject": "Team Formation Complete — Meet Your Team!",
            "body": "Dear {participant_name},\n\nTeams have been formed for EventCraft Hackathon 2026!\n\nLog in to your participant portal to see your team details and teammates.\n\nNext Steps:\n- Connect with your teammates\n- Review the problem statement\n- Begin planning your solution\n\nGood luck!\n\nEventCraft Committee",
        },
        ("Evaluation", "judges"): {
            "subject": "Evaluation Portal Now Open — Submission Guidelines",
            "body": "Dear Judge,\n\nThe evaluation portal for EventCraft Hackathon 2026 is now open.\n\nPlease score each team on:\n• Innovation (0-10): Originality and creativity\n• Execution (0-10): Technical implementation quality\n• Presentation (0-10): Clarity of demo and communication\n• Impact (0-10): Real-world potential and scalability\n\nThank you for your time.\n\nEventCraft Committee",
        },
        ("Evaluation", "all_participants"): {
            "subject": "Reminder: Project Submission Deadline Tomorrow",
            "body": "Dear {participant_name},\n\nFriendly reminder — project submission deadline is tomorrow!\n\nEnsure your team has:\n✅ Completed your solution\n✅ Prepared your demo\n✅ Submitted all materials\n\nGood luck!\n\nEventCraft Committee",
        },
        ("Results", "all_participants"): {
            "subject": "Results Announcement — EventCraft Hackathon 2026",
            "body": "Dear {participant_name},\n\nThe results for EventCraft Hackathon 2026 are in!\n\nThank you for your incredible effort and creativity. Final rankings are available in your participant portal.\n\nCongratulations to all teams!\n\nEventCraft Committee",
        },
        ("Progression", "winners"): {
            "subject": "Congratulations! You've Qualified for the Next Round",
            "body": "Dear {participant_name},\n\nCongratulations! Your team has qualified for the next round.\n\nPlease confirm your participation via your portal link.\n\nWe look forward to seeing you at the finals!\n\nEventCraft Committee",
        },
    }

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    event_name = event.name if event else "EventCraft Hackathon 2026"

    for stage, recipient_type, recipient_label, status in stage_configs:
        try:
            drafted = _llm.draft_communication(
                stage=stage,
                recipient_type=recipient_type,
                event_name=event_name,
            )
            subject = drafted.get("subject", "")
            body = drafted.get("body", "")
            # Validate — if LLM returned empty/error, use fallback
            if not subject or not body or subject.startswith("[") or len(body) < 50:
                raise ValueError("LLM returned invalid draft")
        except Exception:
            fallback = static_fallbacks.get((stage, recipient_type), {})
            subject = fallback.get("subject", f"{stage} Update")
            body = fallback.get("body", f"Dear participant,\n\nUpdate for {stage} stage.\n\nEventCraft Committee")

        db.add(models.Communication(
            event_id=event_id,
            recipient=recipient_label,
            subject=subject,
            body=body,
            status=status,
            stage=stage,
        ))
        print(f"✅ Seeded communication: [{stage}] {subject[:60]}")

app = FastAPI(
    title="EventCraft API",
    description="Intelligent Event Orchestration System",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Rate Limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded. {exc.detail}",
            "retry_after": getattr(exc, 'retry_after', None),
        },
    )

app.add_middleware(SlowAPIMiddleware)

# Ensure uploads directory exists and mount static files serving
os.makedirs("static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "https://eventcraft-c.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(participants.router)
app.include_router(teams.router)
from .routers.teams import submission_router
app.include_router(submission_router)
app.include_router(evaluations.router)
app.include_router(approvals.router)
app.include_router(communications.router)
app.include_router(agent.router)
app.include_router(omni_agent.router)
app.include_router(social_scraping.router)
app.include_router(peer_review.router)  # Peer review scoring
app.include_router(ws_router)  # WebSocket

app.include_router(qa.router, tags=["qa"])
app.include_router(subscribers_router.router)

@app.get("/")
def root():
    return {"message": "EventCraft API", "version": "1.0.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
