# EventCraft — Intelligent Event Orchestration System

> Built for the Texas Instruments Hackathon Problem Statement: Theme 4

An LLM-powered workflow automation system that orchestrates the full operational lifecycle of a competitive team event — from participant intake through team formation, evaluation, results, and progression.

The system supports **dynamic event configuration via a conversational AI agent** — describe your event in plain English and the AI configures the entire pipeline, team rules, scoring criteria, and draft communications automatically.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI (Python) + Uvicorn |
| Database | SQLite (via SQLAlchemy ORM) |
| LLM / AI | Groq API — `llama-3.3-70b-versatile` (free tier) |
| Auth | JWT (`python-jose`) — committee + portal + judge tokens |
| Async Tasks | Celery + Redis (optional, falls back to sync) |
| Email | SendGrid API → SMTP → console simulation |
| Real-time | WebSockets (FastAPI native) |
| Password Hashing | passlib + sha256_crypt |

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.11–3.13 | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any | `git --version` |

---

## Quick Start (Windows CMD)

### 1 — Backend setup

```cmd
cd C:\Users\Administrator\Desktop\EventCraft\backend

:: Create virtual environment
python -m venv venv

:: Install dependencies
venv\Scripts\pip install -r requirements.txt

:: Copy env template and fill in your keys
copy .env.example .env

:: Start the server
venv\Scripts\uvicorn app.main:app --reload --port 8000
```

Backend runs at: **http://localhost:8000**  
Swagger docs: **http://localhost:8000/docs**

On first run you will see:
```
✅ Admin created: admin@eventcraft.com / admin123
✅ Demo event seeded with 12 participants
```

### 2 — Add your API keys

Open `backend/.env` and set:

```env
# Required for all AI features (free tier)
# Get key at: https://console.groq.com → API Keys → Create
GROQ_API_KEY=gsk_your_key_here

# Required for real email delivery (free tier: 100 emails/day)
# Get key at: https://sendgrid.com → Settings → API Keys
SENDGRID_API_KEY=SG.your_key_here
EMAIL_FROM=your-verified-sender@yourdomain.com
```

### 3 — Frontend setup

Open a **second** CMD window:

```cmd
cd C:\Users\Administrator\Desktop\EventCraft\eventcraft-frontend

npm install
npm run dev
```

Frontend runs at: **http://localhost:5173**

### 4 — Login

Open **http://localhost:5173** in your browser.

```
Email:    admin@eventcraft.com
Password: admin123
```

---

## Project Structure

```
EventCraft/
│
├── backend/                        # Python FastAPI backend
│   ├── app/
│   │   ├── main.py                 # App entry point, DB init, demo data seed
│   │   ├── config.py               # All settings (reads from .env)
│   │   ├── database.py             # SQLAlchemy + SQLite setup
│   │   ├── models.py               # DB models: User, Event, Participant, Team, etc.
│   │   ├── schemas.py              # Pydantic request/response schemas
│   │   ├── auth.py                 # JWT auth — committee + portal + judge tokens
│   │   ├── llm.py                  # Groq llama-3.3-70b (rationale, comms, agent)
│   │   ├── team_formation.py       # Algorithmic team formation engine
│   │   ├── email_service.py        # SendGrid → SMTP → console fallback
│   │   ├── tasks.py                # Celery async tasks
│   │   ├── ws.py                   # WebSocket connection manager
│   │   └── routers/
│   │       ├── auth.py             # POST /api/auth/login, GET /api/auth/me
│   │       ├── events.py           # Event CRUD, dashboard stats, pipeline stages
│   │       ├── participants.py     # Roster CRUD, CSV import, participant portal
│   │       ├── teams.py            # AI team formation, leaderboard
│   │       ├── evaluations.py      # Score submission, anomaly detection
│   │       ├── approvals.py        # Approval gates (approve/reject)
│   │       ├── communications.py   # LLM email drafting, bulk send, portal links
│   │       ├── agent.py            # Conversational event config agent (Groq)
│   │       └── websocket.py        # ws://localhost:8000/ws/{event_id}
│   ├── .env                        # Your secrets — never committed
│   ├── .env.example                # Template — copy to .env
│   ├── eventcraft.db               # SQLite database (auto-created on first run)
│   └── requirements.txt
│
└── eventcraft-frontend/            # React + TypeScript + Tailwind CSS
    ├── src/
    │   ├── api/client.ts           # All API calls
    │   ├── context/AppContext.tsx  # Auth state, approvals, dashboard, WS
    │   ├── hooks/useWebSocket.ts   # Auto-reconnecting WebSocket hook
    │   └── pages/
    │       ├── Login.tsx           # Committee login
    │       ├── Dashboard.tsx       # Live stats, approvals, activity log
    │       ├── Participants.tsx    # Roster management + CSV import
    │       ├── Teams.tsx           # Team cards + leaderboard
    │       ├── Evaluations.tsx     # Score submission + judge invite
    │       ├── Communications.tsx  # Email drafting + sending
    │       ├── Pipeline.tsx        # Visual pipeline + stage advancement
    │       ├── Approvals.tsx       # All approval gates
    │       ├── FormationRules.tsx  # Team formation configuration
    │       ├── Agent.tsx           # Dynamic event config chat (Groq AI)
    │       ├── ParticipantPortal.tsx  # /portal/:token — no login needed
    │       └── JudgePortal.tsx     # /judge/:eventId?token= — no login needed
    ├── .env                        # VITE_API_URL — never committed
    └── package.json
```

---

## Feature Checklist

### Core Features

| Feature | Status |
|---------|--------|
| Participant roster intake (name, email, institution, skills, level) | ✅ |
| CSV bulk import | ✅ |
| Team formation rules (size, skill balance, institution diversity, experience grouping) | ✅ |
| AI team formation (algorithmic engine + Groq rationale generation) | ✅ |
| Approval gate before team assignments are communicated | ✅ |
| LLM-drafted communications for each pipeline stage | ✅ |
| Pre-seeded draft emails for all 5 stages on first run | ✅ |
| Evaluation guide generation per team (Groq) | ✅ |
| Multi-judge score submission | ✅ |
| Judge link-based access (no account needed) | ✅ |
| Score anomaly detection + hold results for review | ✅ |
| Real-time dashboard via WebSocket | ✅ |
| Participant read-only portal (JWT link, no login) | ✅ |
| Pipeline stage management with approval gate | ✅ |
| Human approval gates for all irreversible actions | ✅ |

### Advanced Features

| Feature | Status |
|---------|--------|
| **Dynamic event config via conversational AI agent (Groq)** | ✅ |
| Agent detects incomplete/contradictory descriptions and asks clarifying questions | ✅ |
| Agent auto-generates pipeline stages, team rules, scoring criteria, draft emails | ✅ |
| Full event run driven entirely by agent description — no hardcoded assumptions | ✅ |
| WebSocket real-time updates across all pages | ✅ |
| Celery + Redis async task queue (optional) | ✅ |
| SendGrid email delivery (verified working) | ✅ |
| JWT portal tokens (participant + judge, no account) | ✅ |
| Score consolidation + final rankings + leaderboard | ✅ |

---

## Dynamic Event Configuration Agent

The most ambitious feature — the AI agent removes all hardcoded assumptions about event format.

**How it works:**

1. Go to **AI Agent** in the sidebar
2. Describe your event in plain English:
   > *"I want to run a 2-day hackathon with 60 participants, teams of 4, judged on innovation and execution"*
3. If the description is **incomplete or contradictory**, the agent asks clarifying questions before proceeding
4. Once it has enough info, it automatically configures:
   - Pipeline stages (custom phases in order)
   - Team formation rules (size, skill balance, institution diversity)
   - Evaluation criteria + scoring weights
   - Draft communications for every stage
   - An approval gate for committee review
5. After approval, the event runs end-to-end from roster intake through final results

**Supported event types (no code changes needed):**
- Hackathons
- Case competitions
- Coding contests
- Design sprints
- Any custom format

---

## How the Approval Gate Works

Every irreversible action requires committee sign-off:

| Action | Approval Type |
|--------|--------------|
| Form Teams with AI | Team Formation |
| Request Stage Advance | Progression |
| Score anomaly detected | Score Override |
| AI Agent configures pipeline | Rule Change |

**Flow:** Action triggered → Approval item created → Committee reviews → Approve/Reject → Action executes only on Approve.

---

## JWT Link-Based Access

### Participant Portal
- Each participant gets a unique signed JWT link (no account needed)
- URL: `http://localhost:5173/portal/{token}?event={event_id}`
- Shows: current stage, team details, teammates, key dates, progression status

### Judge Portal
- Committee generates a signed link per judge (Evaluations → Invite Judge)
- URL: `http://localhost:5173/judge/{event_id}?token={jwt}`
- Judge opens link, sees all teams, submits scores — token expires in 7 days

---

## Environment Variables

```env
# backend/.env

SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Groq LLM — free tier, fast inference
# Get key at: https://console.groq.com
GROQ_API_KEY=gsk_your_key_here

# SendGrid email (optional — falls back to console log)
# Get key at: https://sendgrid.com
SENDGRID_API_KEY=SG.your_key_here
EMAIL_FROM=your-sender@yourdomain.com
EMAIL_FROM_NAME=EventCraft

# Redis for Celery (optional — falls back to sync)
REDIS_URL=redis://localhost:6379/0

# Database
DATABASE_URL=sqlite:///./eventcraft.db

# Frontend URL (for CORS and email links)
FRONTEND_URL=http://localhost:5173

# Admin credentials
ADMIN_EMAIL=admin@eventcraft.com
ADMIN_PASSWORD=admin123
```

---

## Troubleshooting

**`running scripts is disabled` in PowerShell**
→ Use CMD instead, or: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

**Port 8000 already in use**
→ `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`

**AI features not working**
→ Check `GROQ_API_KEY` is set in `backend/.env`. Get a free key at https://console.groq.com

**Emails not sending**
→ Check `SENDGRID_API_KEY` in `backend/.env`. Without it, emails are printed to the backend console.

**Database issues / want a fresh start**
→ `del backend\eventcraft.db` then restart the backend — it re-seeds automatically.

**Login page flashes then disappears**
→ Fixed — the app shows a loading spinner while restoring your session.
