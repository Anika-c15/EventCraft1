from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime
from .models import (
    ParticipantStatus, ParticipantLevel, TeamStatus,
    ApprovalStatus, ApprovalType, CommStatus, StageStatus, UserRole
)


# ── Auth ───────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str = Field(..., max_length=128)

class RegisterRequest(BaseModel):
    name: str  # Changed from org_name to just name
    email: str
    password: str = Field(..., max_length=128)

    @field_validator('password')
    @classmethod
    def check_password(cls, v: str) -> str:
        import re
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[^a-zA-Z0-9]", v):
            raise ValueError("Password must contain at least one special character")
        return v

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str = Field(..., max_length=128)

    @field_validator('new_password')
    @classmethod
    def check_new_password(cls, v: str) -> str:
        import re
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[^a-zA-Z0-9]", v):
            raise ValueError("Password must contain at least one special character")
        return v

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


class EventUpdate(BaseModel):
    description: Optional[str] = None


class EventOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    current_stage_index: int
    is_active: bool
    pipeline_config: Optional[Any]
    formation_rules: Optional[Any]
    scoring_weights: Optional[Dict[str, float]] = None
    created_at: datetime
    current_stage: Optional[str] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    reopen_count: int = 0

    class Config:
        from_attributes = True


class ScoringWeightsUpdate(BaseModel):
    judge: float = Field(..., ge=0.0, le=100.0)
    peer: float = Field(..., ge=0.0, le=100.0)
    social: float = Field(..., ge=0.0, le=100.0)


# ── Pipeline Stage ─────────────────────────────────────────────────────────────

class StageOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    order_index: int
    status: StageStatus
    tasks: Optional[List[str]]
    allows_submission: bool = False
    is_evaluation: bool = False
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
    social_vote_override_score: Optional[float] = None
    social_vote_total_votes: Optional[int] = None
    public_vote_score: Optional[float] = None   # combined avg(social, peer)
    ai_proposed_score: Optional[float] = None
    bias_rationale: Optional[str] = None
    is_locked: Optional[bool] = False
    name_locked: Optional[bool] = False
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
    public_vote_score: float = Field(..., ge=0.0, le=10.0, description="Social scrape score (0–10)")


class LockScoreRequest(BaseModel):
    final_score: float = Field(..., ge=0.0, le=10.0, description="Final locked score (0–10)")
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

    @field_validator('scores')
    @classmethod
    def validate_score_range(cls, v: Dict[str, float]) -> Dict[str, float]:
        for key, val in v.items():
            if not (0.0 <= val <= 10.0):
                raise ValueError(f"Score '{key}' must be between 0 and 10, got {val}")
        return v


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


class ApprovalCreate(BaseModel):
    type: ApprovalType
    description: str
    payload: Optional[Any] = None


class ResumeParseRequest(BaseModel):
    text: str


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
    is_evaluation_unlocked: bool = False
    is_evaluation_closed: bool = False


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
    submission_portal_active: bool = False # True when team submission is open
    results_phase_active: bool = False # True when event is in results/announce phase
    showroom_teams: List[ShowroomTeam] = []  # other teams visible in showroom
    leaderboard: List[Dict[str, Any]] = []
    scoring_weights: Optional[Dict[str, float]] = None
    event_completed: bool = False


class StageSetPayload(BaseModel):
    stage_name: str


# ── Subscribers ────────────────────────────────────────────────────────────────

class SubscriberCreate(BaseModel):
    name: str
    email: str


class SubscriberOut(BaseModel):
    id: str
    name: str
    email: str
    notified: bool
    subscribed_at: datetime

    class Config:
        from_attributes = True


class NotifySubscribersRequest(BaseModel):
    event_name: str
    description: Optional[str] = None

    # ── Committee Invites ──────────────────────────────────────────────────────────
class CommitteeInviteCreate(BaseModel):
    email: EmailStr

class CommitteeInviteOut(BaseModel):
    id: str
    event_id: str
    email: str
    is_accepted: bool
    created_at: datetime
    event_name: Optional[str] = None

    class Config:
        from_attributes = True

# ── Social Scraping Schemas ───────────────────────────────────────────────────

class SocialConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    platforms: Optional[List[str]] = None
    poll_type: Optional[str] = None
    poll_duration_minutes: Optional[int] = None
    auto_post_on_evaluation: Optional[bool] = None
    auto_fetch_on_completion: Optional[bool] = None
    min_vote_threshold: Optional[int] = None

class InstagramIdPayload(BaseModel):
    story_media_id: str
    posted_at: Optional[datetime] = None

class SetPostIdPayload(BaseModel):
    post_id: str
    posted_at: Optional[datetime] = None

class ManualVotesPayload(BaseModel):
    votes: Dict[str, int]


# ── Ownership Transfer Schemas ───────────────────────────────────────────────

class TransferInitiatePayload(BaseModel):
    new_owner_id: str
    leave_completely: bool = True
    otp: str

class TransferClaimPayload(BaseModel):
    otp: str

class EventTransferRequestOut(BaseModel):
    id: str
    event_id: str
    old_owner_id: str
    new_owner_id: str
    leave_completely: bool
    status: str
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True


