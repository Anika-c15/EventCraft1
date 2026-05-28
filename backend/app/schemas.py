from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from .models import (
    ParticipantStatus, ParticipantLevel, TeamStatus,
    ApprovalStatus, ApprovalType, CommStatus, StageStatus, UserRole
)


# ── Auth ───────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    role: str


# ── Event ──────────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    name: str
    description: Optional[str] = None


class EventOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    current_stage_index: int
    is_active: bool
    pipeline_config: Optional[Any]
    formation_rules: Optional[Any]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Pipeline Stage ─────────────────────────────────────────────────────────────

class StageOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    order_index: int
    status: StageStatus
    tasks: Optional[List[str]]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Participant ────────────────────────────────────────────────────────────────

class ParticipantCreate(BaseModel):
    name: str
    email: str
    institution: Optional[str] = None
    level: ParticipantLevel = ParticipantLevel.intermediate
    skills: List[str] = []
    status: ParticipantStatus = ParticipantStatus.active
    metadata_json: Optional[Dict[str, Any]] = None


class ParticipantOut(BaseModel):
    id: str
    event_id: str
    name: str
    email: str
    institution: Optional[str]
    level: ParticipantLevel
    skills: List[str]
    status: ParticipantStatus
    team_id: Optional[str]
    portal_token: Optional[str]
    registered_at: datetime

    class Config:
        from_attributes = True


# ── Team ───────────────────────────────────────────────────────────────────────

class TeamOut(BaseModel):
    id: str
    event_id: str
    name: str
    status: TeamStatus
    rationale: Optional[str]
    challenge: Optional[str]
    github_link: Optional[str] = None
    demo_link: Optional[str] = None
    project_title: Optional[str] = None
    project_description: Optional[str] = None
    github_url: Optional[str] = None
    video_url: Optional[str] = None
    presentation_url: Optional[str] = None
    submission_status: Optional[str] = "Draft"
    final_score: Optional[float]
    rank: Optional[int]
    judge_avg_score: Optional[float] = None
    social_vote_score: Optional[float] = None
    public_vote_score: Optional[float] = None   # combined avg(social, peer)
    ai_proposed_score: Optional[float] = None
    bias_rationale: Optional[str] = None
    is_locked: Optional[bool] = False
    members: List[ParticipantOut] = []
    created_at: datetime

    class Config:
        from_attributes = True


class TeamSubmissionUpdate(BaseModel):
    github_link: Optional[str] = None
    demo_link: Optional[str] = None
    lock: Optional[bool] = False


class TeamSubmissionDraft(BaseModel):
    project_title: Optional[str] = None
    project_description: Optional[str] = None
    github_url: Optional[str] = None
    video_url: Optional[str] = None
    presentation_url: Optional[str] = None
    token: str


class TeamSubmissionFinal(BaseModel):
    project_title: str
    project_description: str
    github_url: str
    video_url: str
    presentation_url: str
    token: str


class PublicVoteInput(BaseModel):
    public_vote_score: float  # the social scrape score (0-10)


class LockScoreRequest(BaseModel):
    final_score: float
    bias_rationale: Optional[str] = None


# ── Peer Review ────────────────────────────────────────────────────────────────

class PeerReviewCreate(BaseModel):
    to_team_id: str
    score: float  # 0-10


class PeerReviewOut(BaseModel):
    id: str
    event_id: str
    from_team_id: str
    to_team_id: str
    score: float
    created_at: datetime

    class Config:
        from_attributes = True


class ShowroomTeam(BaseModel):
    """Lightweight team card shown in the Project Showroom."""
    id: str
    name: str
    challenge: Optional[str]
    github_link: Optional[str]
    demo_link: Optional[str]
    project_title: Optional[str] = None
    project_description: Optional[str] = None
    github_url: Optional[str] = None
    video_url: Optional[str] = None
    presentation_url: Optional[str] = None
    submission_status: Optional[str] = "Draft"
    member_count: int
    my_vote: Optional[float]  # score this participant's team has already given



class FormTeamsRequest(BaseModel):
    event_id: str


# ── Formation Rules ────────────────────────────────────────────────────────────

class FormationRulesUpdate(BaseModel):
    event_name: Optional[str] = None
    team_size: int = 3
    allow_incomplete_teams: bool = False
    skill_balance: bool = True
    institution_diversity: bool = True
    max_per_institution: int = 1
    experience_level_grouping: str = "mixed"  # mixed | similar | none
    max_teams: int = 10


# ── Evaluation ─────────────────────────────────────────────────────────────────

class ScoreSubmit(BaseModel):
    team_id: str
    judge_name: str
    judge_email: str
    scores: Dict[str, float]  # {"innovation": 7, "execution": 8, ...}
    notes: Optional[str] = None


class EvaluationScoreOut(BaseModel):
    id: str
    team_id: str
    judge_name: str
    judge_email: str
    scores_json: Dict[str, float]
    notes: Optional[str]
    average: Optional[float]
    is_anomaly: bool
    submitted_at: datetime

    class Config:
        from_attributes = True


# ── Approval ───────────────────────────────────────────────────────────────────

class ApprovalOut(BaseModel):
    id: str
    event_id: str
    type: ApprovalType
    status: ApprovalStatus
    description: str
    payload: Optional[Any]
    created_at: datetime
    resolved_at: Optional[datetime]
    resolved_by: Optional[str]

    class Config:
        from_attributes = True


class ApprovalResolve(BaseModel):
    status: ApprovalStatus  # approved | rejected


# ── Communication ──────────────────────────────────────────────────────────────

class CommunicationCreate(BaseModel):
    recipient: str
    recipient_email: Optional[str] = None
    subject: str
    body: str
    stage: Optional[str] = None


class CommunicationOut(BaseModel):
    id: str
    event_id: str
    recipient: str
    recipient_email: Optional[str]
    subject: str
    body: str
    status: CommStatus
    stage: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class DraftCommunicationRequest(BaseModel):
    stage: str
    recipient_type: str  # "all_participants" | "judges" | "team" | "winners"
    team_id: Optional[str] = None
    extra_context: Optional[str] = None


# ── Activity Log ───────────────────────────────────────────────────────────────

class ActivityLogOut(BaseModel):
    id: str
    message: str
    log_type: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Agent (Dynamic Config) ─────────────────────────────────────────────────────

class AgentMessageIn(BaseModel):
    content: str


class AgentMessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class AgentChatResponse(BaseModel):
    message: AgentMessageOut
    pipeline_configured: bool = False
    pipeline_config: Optional[Any] = None
    needs_clarification: bool = False


# ── Dashboard ──────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_participants: int
    active_participants: int
    teams_formed: int
    pending_approvals: int
    anomaly_flags: int
    current_stage: Optional[str]
    current_stage_index: int


# ── CSV Import ─────────────────────────────────────────────────────────────────

class CSVImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


# ── Participant Portal ─────────────────────────────────────────────────────────

class PortalTokenRequest(BaseModel):
    participant_id: str


class PortalData(BaseModel):
    participant: ParticipantOut
    team: Optional[TeamOut]
    current_stage: Optional[str]
    current_stage_index: int
    key_dates: List[Dict[str, Any]]
    event_name: str
    progression_eligible: bool
    scoring_phase_active: bool = False   # True when showroom & peer voting unlock
    showroom_teams: List[ShowroomTeam] = []  # other teams visible in showroom
    leaderboard: List[Dict[str, Any]] = []
