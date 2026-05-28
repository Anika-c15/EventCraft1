from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, SessionLocal
from . import models
from .config import settings
from .auth import hash_password, create_portal_token
from .routers import auth, events, participants, teams, evaluations, approvals, communications, agent
from .routers.websocket import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    _migrate_db()
    _seed_db()
    yield


def _migrate_db():
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # Check columns of table 'teams'
        result = db.execute(text("PRAGMA table_info(teams)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "public_vote_score" not in columns:
            db.execute(text("ALTER TABLE teams ADD COLUMN public_vote_score FLOAT"))
            print("🚀 Migrated database: added public_vote_score to teams table")
            
        if "ai_proposed_score" not in columns:
            db.execute(text("ALTER TABLE teams ADD COLUMN ai_proposed_score FLOAT"))
            print("🚀 Migrated database: added ai_proposed_score to teams table")
            
        if "bias_rationale" not in columns:
            db.execute(text("ALTER TABLE teams ADD COLUMN bias_rationale TEXT"))
            print("🚀 Migrated database: added bias_rationale to teams table")
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️ Migration error: {e}")
    finally:
        db.close()



def _seed_db():
    db = SessionLocal()
    try:
        # ── Admin user ──────────────────────────────────────────────────────
        admin = db.query(models.User).filter(models.User.email == settings.ADMIN_EMAIL).first()
        if not admin:
            admin = models.User(
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                name="Admin",
                role=models.UserRole.admin,
            )
            db.add(admin)
            db.flush()
            print(f"✅ Admin created: {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")

        # ── Demo event (only if no events exist) ────────────────────────────
        if db.query(models.Event).count() == 0:
            _seed_demo_event(db)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️  Seed error: {e}")
    finally:
        db.close()


DEMO_STAGES = [
    {"name": "Participant Intake", "description": "Register and verify all participants, collect skill declarations and institutional affiliations.", "tasks": ["Open registration portal", "Collect participant profiles", "Verify institutional affiliations", "Approve participant roster"]},
    {"name": "Team Formation", "description": "AI-powered team formation based on skill complementarity, institution diversity, and experience levels.", "tasks": ["Configure formation rules", "Run AI team formation", "Review proposed teams", "Approve team compositions"]},
    {"name": "Evaluation", "description": "Judges evaluate team projects across innovation, execution, presentation, and impact dimensions.", "tasks": ["Open evaluation portal", "Collect judge scores", "Aggregate and normalize scores", "Flag anomalies for review"]},
    {"name": "Results", "description": "Compile final rankings, generate certificates, and prepare announcement materials.", "tasks": ["Calculate final rankings", "Generate result reports", "Prepare certificates", "Draft announcement communications"]},
    {"name": "Progression", "description": "Advance qualifying participants and teams to the next round or final event.", "tasks": ["Identify qualifying teams", "Send progression notifications", "Update participant statuses", "Archive event data"]},
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
    comms = [
        {
            "recipient": "All Participants",
            "subject": "Your Personal Portal Link — EventCraft Hackathon 2026",
            "body": "Dear {participant_name},\n\nWelcome to EventCraft Hackathon 2026!\n\nYou can access your personal participant portal using the link below.\nNo account or password is required — just click the link:\n\n{portal_url}\n\nYour portal shows:\n• Your current stage in the event journey\n• Team details and teammates (once teams are formed)\n• Key event dates and milestones\n• Progression status\n\nThis link is unique to you — please do not share it.\n\nBest regards,\nEventCraft Committee",
            "status": models.CommStatus.draft,
            "stage": "Participant Intake",
        },
        {
            "recipient": "All Participants",
            "subject": "Welcome to EventCraft Hackathon 2026 — Registration Confirmed",
            "body": "Dear {participant_name},\n\nWelcome to EventCraft Hackathon 2026! Your registration has been confirmed.\n\nHere's what to expect:\n1. Team Formation — Balanced teams will be formed based on your skills.\n2. Evaluation — Teams present solutions to expert judges.\n3. Results & Progression — Top teams advance to the final round.\n\nBest regards,\nEventCraft Committee",
            "status": models.CommStatus.sent,
            "stage": "Participant Intake",
        },
        {
            "recipient": "All Participants",
            "subject": "Team Formation Complete — Meet Your Team!",
            "body": "Dear {participant_name},\n\nTeams have been formed for EventCraft Hackathon 2026!\n\nLog in to your participant portal to see your team details and teammates.\n\nNext Steps:\n- Connect with your teammates\n- Review the problem statement\n- Begin planning your solution\n\nGood luck!\n\nEventCraft Committee",
            "status": models.CommStatus.draft,
            "stage": "Team Formation",
        },
        {
            "recipient": "Judges Panel",
            "subject": "Evaluation Portal Now Open — Submission Guidelines",
            "body": "Dear Judge,\n\nThe evaluation portal for EventCraft Hackathon 2026 is now open.\n\nPlease score each team on:\n• Innovation (0-10): Originality and creativity\n• Execution (0-10): Technical implementation quality\n• Presentation (0-10): Clarity of demo and communication\n• Impact (0-10): Real-world potential and scalability\n\nThank you for your time.\n\nEventCraft Committee",
            "status": models.CommStatus.draft,
            "stage": "Evaluation",
        },
        {
            "recipient": "All Participants",
            "subject": "Reminder: Project Submission Deadline Tomorrow",
            "body": "Dear {participant_name},\n\nFriendly reminder — project submission deadline is tomorrow!\n\nEnsure your team has:\n✅ Completed your solution\n✅ Prepared your demo\n✅ Submitted all materials\n\nGood luck!\n\nEventCraft Committee",
            "status": models.CommStatus.draft,
            "stage": "Evaluation",
        },
        {
            "recipient": "All Participants",
            "subject": "Results Announcement — EventCraft Hackathon 2026",
            "body": "Dear {participant_name},\n\nThe results for EventCraft Hackathon 2026 are in!\n\nThank you for your incredible effort and creativity. Final rankings are available in your participant portal.\n\nCongratulations to all teams!\n\nEventCraft Committee",
            "status": models.CommStatus.draft,
            "stage": "Results",
        },
        {
            "recipient": "Qualifying Teams",
            "subject": "Congratulations! You've Qualified for the Next Round",
            "body": "Dear {participant_name},\n\nCongratulations! Your team has qualified for the next round.\n\nPlease confirm your participation via your portal link.\n\nWe look forward to seeing you at the finals!\n\nEventCraft Committee",
            "status": models.CommStatus.draft,
            "stage": "Progression",
        },
    ]
    for c in comms:
        db.add(models.Communication(
            event_id=event_id,
            recipient=c["recipient"],
            subject=c["subject"],
            body=c["body"],
            status=c["status"],
            stage=c["stage"],
        ))

app = FastAPI(
    title="EventCraft API",
    description="Intelligent Event Orchestration System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(participants.router)
app.include_router(teams.router)
app.include_router(evaluations.router)
app.include_router(approvals.router)
app.include_router(communications.router)
app.include_router(agent.router)
app.include_router(ws_router)  # WebSocket


@app.get("/")
def root():
    return {"message": "EventCraft API", "version": "1.0.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
