# EventCraft — Intelligent Event Orchestration System

> Built for the Texas Instruments Hackathon Problem Statement: Theme 4

An LLM-powered workflow automation system that orchestrates the full operational lifecycle of a competitive team event — from participant intake through team formation, evaluation, results, and progression.

---

## Prerequisites

Make sure these are installed on your machine before starting:

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.11 or 3.12 (NOT 3.13 on Windows — use 3.12) | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any | `git --version` |

> **Windows note:** If you have multiple Python versions (e.g. msys64), always use the full path:
> `C:\Users\<you>\AppData\Local\Programs\Python\Python312\python.exe`

---

## Quick Start (Windows CMD)

### Step 1 — Clone / open the project

```cmd
cd C:\Users\Administrator\Desktop\EventCraft\backend
```

### Step 2 — Backend setup

```cmd
cd C:\Users\Administrator\Desktop\EventCraft\backend

:: Create virtual environment
python -m venv venv

:: Install dependencies
venv\Scripts\pip install -r requirements.txt

:: Start the server
venv\Scripts\uvicorn app.main:app --reload --port 8000
```

Backend runs at: **http://localhost:8000**  
API docs (Swagger): **http://localhost:8000/docs**

On first run you will see:
```
✅ Admin created: admin@eventcraft.com / admin123
✅ Demo event seeded with 12 participants
```

### Step 3 — Add your Gemini API key

Open `backend/.env` and set:
```
GEMINI_API_KEY=your-key-here
```

Get a **free** key at: https://aistudio.google.com/app/apikey  
(Sign in with Google → Create API key → Copy)

### Step 4 — Frontend setup

Open a **second** CMD window:

```cmd
cd C:\Users\Administrator\Desktop\EventCraft\eventcraft-frontend

npm install
npm run dev
```

Frontend runs at: **http://localhost:5173**

### Step 5 — Login

Open http://localhost:5173 in your browser.

```
Email:    admin@eventcraft.com
Password: admin123
```

---

## Running on a Team Member's Machine

Every team member follows the exact same steps above. The only things needed:

1. The project folder (share via Git, USB, or zip)
2. Python 3.11/3.12 installed
3. Node.js 18+ installed
4. A Gemini API key (each person can use their own free key)

The database (`backend/eventcraft.db`) is created automatically on first run — no setup needed.

---

## PowerShell vs CMD

If you get `running scripts is disabled` errors in PowerShell, either:

**Option A** — Use CMD instead (recommended):
Press `Win + R` → type `cmd` → Enter

**Option B** — Fix PowerShell execution policy (run as Administrator):
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## Optional: Celery + Redis (Async Task Queue)

By default, LLM tasks (team rationale generation, bulk email) run synchronously.  
To run them asynchronously via Celery + Redis:

1. Install Redis: https://github.com/microsoftarchive/redis/releases (Windows)  
   Or via WSL: `sudo apt install redis-server && redis-server`

2. Start Redis (it runs on port 6379 by default)

3. Open a **third** CMD window and run the Celery worker:
```cmd
cd C:\Users\<your-name>\Desktop\EventCraft\backend
venv\Scripts\celery -A app.tasks worker --loglevel=info --pool=solo
```

The app automatically detects Redis and switches to async mode.

---

## Optional: Real Email via SendGrid

By default, emails are printed to the backend console (simulated).  
To send real emails:

1. Sign up at https://sendgrid.com (free tier: 100 emails/day)
2. Create an API key
3. Add to `backend/.env`:
```
SENDGRID_API_KEY=SG.your-key-here
EMAIL_FROM=EventCraft <your-verified-sender@yourdomain.com>
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
│   │   ├── models.py               # All DB models (User, Event, Participant, Team, etc.)
│   │   ├── schemas.py              # Pydantic request/response schemas
│   │   ├── auth.py                 # JWT auth — committee login + portal tokens + judge tokens
│   │   ├── llm.py                  # Gemini 2.0 Flash integration (rationale, comms, agent)
│   │   ├── team_formation.py       # Algorithmic team formation engine
│   │   ├── email_service.py        # SendGrid → SMTP → console fallback
│   │   ├── tasks.py                # Celery async tasks (rationale gen, bulk email)
│   │   ├── ws.py                   # WebSocket connection manager
│   │   └── routers/
│   │       ├── auth.py             # POST /api/auth/login, GET /api/auth/me
│   │       ├── events.py           # Event CRUD, dashboard stats, pipeline stages
│   │       ├── participants.py     # Roster CRUD, CSV import, participant portal
│   │       ├── teams.py            # AI team formation, leaderboard
│   │       ├── evaluations.py      # Score submission, anomaly detection, judge portal
│   │       ├── approvals.py        # Approval gates (approve/reject)
│   │       ├── communications.py   # LLM email drafting, bulk send
│   │       ├── agent.py            # Conversational event config agent
│   │       └── websocket.py        # ws://localhost:8000/ws/{event_id}
│   ├── .env                        # Your secrets (never commit this)
│   ├── .env.example                # Template for .env
│   └── requirements.txt
│
└── eventcraft-frontend/            # React + TypeScript + Tailwind CSS
    ├── src/
    │   ├── api/client.ts           # All API + WebSocket calls
    │   ├── context/AppContext.tsx  # Auth state, approvals, dashboard, WS
    │   ├── hooks/useWebSocket.ts   # Auto-reconnecting WebSocket hook
    │   └── pages/
    │       ├── Login.tsx           # Committee login
    │       ├── Dashboard.tsx       # Live stats, pending approvals, activity log
    │       ├── Participants.tsx    # Roster management + CSV import
    │       ├── Teams.tsx           # Team cards + leaderboard
    │       ├── Evaluations.tsx     # Score submission + judge invite
    │       ├── Communications.tsx  # Email drafting + sending
    │       ├── Pipeline.tsx        # Visual pipeline + stage advancement
    │       ├── Approvals.tsx       # All approval gates
    │       ├── FormationRules.tsx  # Team formation configuration
    │       ├── Agent.tsx           # Dynamic event config chat (Gemini)
    │       ├── ParticipantPortal.tsx  # /portal/:token — no login needed
    │       └── JudgePortal.tsx     # /judge/:eventId?token= — no login needed
    ├── .env                        # VITE_API_URL=http://localhost:8000
    └── package.json
```

---

## Feature Checklist

### Core MVP Features

| Feature | Status | How to use |
|---------|--------|------------|
| Participant roster intake (name, email, institution, skills, level) | ✅ | Participants page → Add Participant or Bulk Import CSV |
| CSV bulk import | ✅ | Participants → Bulk Import (format: name, email, institution, level, skills) |
| Team formation rules (size, skill balance, institution diversity, experience grouping) | ✅ | Formation Rules page |
| AI team formation (algorithmic + Gemini rationale) | ✅ | Teams → Form Teams with AI |
| Approval gate before team assignments communicated | ✅ | Approvals page → approve Team Formation item |
| LLM-drafted communications for each stage | ✅ | Communications → New Communication → Draft with Gemini AI |
| Pre-seeded draft emails for all 5 stages | ✅ | Communications page (6 drafts ready on first run) |
| Evaluation guide generation per team | ✅ | Evaluations → Assessment Guide → select team |
| Multi-judge score submission | ✅ | Evaluations → Submit Score |
| Judge link-based access (no account) | ✅ | Evaluations → Invite Judge → copy link → share |
| Score anomaly detection + hold results | ✅ | Auto-creates approval when deviation > 2.5 points |
| Real-time dashboard (stage, approvals, leaderboard, activity log) | ✅ | Dashboard — live via WebSocket |
| Participant read-only portal (no login) | ✅ | Participants → View Portal link |
| Pipeline stage management with approval gate | ✅ | Pipeline → Request Stage Advance → Approvals → Approve |
| Human approval gates for all irreversible actions | ✅ | All actions create approval items before executing |

### Advanced Features

| Feature | Status | How to use |
|---------|--------|------------|
| Dynamic event config via conversational agent | ✅ | AI Agent page — describe your event in natural language |
| WebSocket real-time updates | ✅ | Dashboard auto-refreshes on any backend event |
| Celery + Redis async task queue | ✅ | Optional — falls back to sync if Redis unavailable |
| SendGrid email delivery | ✅ | Optional — add SENDGRID_API_KEY to .env |
| JWT portal tokens (participant + judge, no account) | ✅ | Built into all portal links |
| Score consolidation + final rankings | ✅ | Evaluations → Consolidate Scores |

---

## How the Approval Gate Works

Every irreversible action requires committee sign-off:

```
Action                          → Creates approval item
──────────────────────────────────────────────────────
Form Teams with AI              → "Team Formation" approval
Request Stage Advance           → "Progression" approval  
Score anomaly detected          → "Score Override" approval
Consolidate scores              → "Progression" approval (top N teams)
```

**Flow:**
1. Action is triggered (e.g. Form Teams)
2. Approval item appears in Dashboard + Approvals page
3. Committee reviews and clicks **Approve** or **Reject**
4. Only on Approve does the action execute (teams confirmed, stage advances, etc.)

---

## JWT Link-Based Access (No Account Required)

### Participant Portal
- Each participant gets a unique signed JWT link
- Click "View Portal" on the Participants page
- URL: `http://localhost:5173/portal/{token}?event={event_id}`
- Shows: current stage, team details, teammates, key dates, progression status

### Judge Portal
- Committee generates a signed link per judge (Evaluations → Invite Judge)
- URL: `http://localhost:5173/judge/{event_id}?token={jwt}`
- Judge opens link, sees all teams, submits scores with sliders
- Token expires in 7 days, email is locked to token

---

## Dynamic Event Configuration (AI Agent)

The AI Agent page lets you configure any event format without hardcoding:

1. Go to **AI Agent** in the sidebar
2. Describe your event: *"I want to run a 2-day hackathon with 60 participants, teams of 4, judged on innovation and execution"*
3. Gemini asks clarifying questions if needed
4. Once complete, it generates a full pipeline configuration
5. The pipeline stages, formation rules, and evaluation criteria are applied to your event

---

## Environment Variables Reference

```env
# backend/.env

SECRET_KEY=your-secret-key          # JWT signing key (change in production)
GEMINI_API_KEY=                     # Required for AI features
REDIS_URL=redis://localhost:6379/0  # Optional — for Celery async tasks
SENDGRID_API_KEY=                   # Optional — for real email delivery
SMTP_HOST=smtp.gmail.com            # Optional — SMTP fallback
SMTP_USER=                          # Optional
SMTP_PASSWORD=                      # Optional
DATABASE_URL=sqlite:///./eventcraft.db
FRONTEND_URL=http://localhost:5173
ADMIN_EMAIL=admin@eventcraft.com
ADMIN_PASSWORD=admin123
ANOMALY_THRESHOLD=2.5               # Score deviation threshold for flagging
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI (Python) + Uvicorn |
| Database | SQLite (via SQLAlchemy ORM) |
| LLM | Google Gemini 2.0 Flash (`google-genai` SDK) |
| Auth | JWT (`python-jose`) — committee + portal + judge tokens |
| Async Tasks | Celery + Redis (optional, falls back to sync) |
| Email | SendGrid API → SMTP → console simulation |
| Real-time | WebSockets (FastAPI native) |
| Password Hashing | passlib + sha256_crypt |

---

## Troubleshooting

**`running scripts is disabled` in PowerShell**
→ Use CMD instead, or run: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

**`pydantic-core` build fails**
→ You're on Python 3.13. Use Python 3.12: `C:\...\Python312\python.exe -m venv venv`

**`gemini-1.5-flash not found` error**
→ Already fixed — we use `gemini-2.0-flash-lite`. Restart the backend.

**`RESOURCE_EXHAUSTED` / quota exceeded from Gemini**
→ Free tier has rate limits. Wait 1 minute and retry. Or upgrade at https://aistudio.google.com

**Teams show "Generating AI rationale..."**
→ Gemini quota hit — static fallback rationales are shown automatically after a few seconds.

**Login page flashes then disappears**
→ Fixed — the app now shows a loading spinner while restoring your session.

**Port 8000 already in use**
→ `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`

**Database issues / want a fresh start**
→ `del backend\eventcraft.db` then restart the backend — it re-seeds automatically.
