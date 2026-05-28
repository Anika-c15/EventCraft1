from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text,
    DateTime, ForeignKey, JSON, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
import uuid

from .database import Base
from datetime import datetime

def gen_uuid():
    return str(uuid.uuid4())


# ── Enums ──────────────────────────────────────────────────────────────────────

class ParticipantStatus(str, enum.Enum):
    active = "Active"
    pending = "Pending"
    inactive = "Inactive"
    waitlisted = "Waitlisted"


class ParticipantLevel(str, enum.Enum):
    beginner = "Beginner"
    intermediate = "Intermediate"
    advanced = "Advanced"
    expert = "Expert"


class TeamStatus(str, enum.Enum):
    proposed = "Proposed"
    approved = "Approved"
    active = "Active"
    rejected = "Rejected"


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ApprovalType(str, enum.Enum):
    progression = "Progression"
    team_formation = "Team Formation"
    score_override = "Score Override"
    rule_change = "Rule Change"
    communication = "Communication"


class CommStatus(str, enum.Enum):
    sent = "Sent"
    draft = "Draft"
    scheduled = "Scheduled"
    failed = "Failed"


class StageStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    completed = "completed"


class UserRole(str, enum.Enum):
    admin = "admin"
    committee = "committee"
    judge = "judge"
    participant = "participant"


# ── Models ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # nullable for JWT-link users
    name = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.committee)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    current_stage_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Dynamic pipeline — stored as JSON list of stage definitions
    pipeline_config = Column(JSON, nullable=True)  # set by conversational agent
    formation_rules = Column(JSON, nullable=True)

    stages = relationship("PipelineStage", back_populates="event", cascade="all, delete-orphan")
    participants = relationship("Participant", back_populates="event", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="event", cascade="all, delete-orphan")
    approvals = relationship("Approval", back_populates="event", cascade="all, delete-orphan")
    communications = relationship("Communication", back_populates="event", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="event", cascade="all, delete-orphan")
    agent_messages = relationship("AgentMessage", back_populates="event", cascade="all, delete-orphan")


class PipelineStage(Base):
    __tablename__ = "pipeline_stages"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=False)
    status = Column(SAEnum(StageStatus), default=StageStatus.pending)
    tasks = Column(JSON, nullable=True)  # list of task strings
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    event = relationship("Event", back_populates="stages")


class Participant(Base):
    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    institution = Column(String, nullable=True)
    level = Column(SAEnum(ParticipantLevel), default=ParticipantLevel.intermediate)
    skills = Column(JSON, default=list)  # list of strings
    status = Column(SAEnum(ParticipantStatus), default=ParticipantStatus.active)
    metadata_json = Column(JSON, nullable=True)  # extra fields from CSV
    team_id = Column(String, ForeignKey("teams.id"), nullable=True)
    portal_token = Column(String, nullable=True, unique=True)  # JWT for portal access
    registered_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="participants")
    team = relationship("Team", back_populates="members", foreign_keys=[team_id])


class Team(Base):
    __tablename__ = "teams"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    name = Column(String, nullable=False)
    status = Column(SAEnum(TeamStatus), default=TeamStatus.proposed)
    rationale = Column(Text, nullable=True)  # LLM-generated
    challenge = Column(Text, nullable=True)
    # Links for the Project Showroom (participants fill in)
    github_link = Column(String, nullable=True)
    demo_link = Column(String, nullable=True)
    project_title = Column(String, nullable=True)
    project_description = Column(Text, nullable=True)
    github_url = Column(String, nullable=True)
    video_url = Column(String, nullable=True)
    presentation_url = Column(String, nullable=True)
    submission_status = Column(String, default="Draft", server_default="Draft")
    final_score = Column(Float, nullable=True)
    rank = Column(Integer, nullable=True)
    judge_avg_score = Column(Float, nullable=True)       # cached judge panel average
    social_vote_score = Column(Float, nullable=True)     # raw score from social scraping
    public_vote_score = Column(Float, nullable=True)     # combined avg(social, peer) — the 30%
    ai_proposed_score = Column(Float, nullable=True)
    bias_rationale = Column(Text, nullable=True)
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="teams")
    members = relationship("Participant", back_populates="team", foreign_keys=[Participant.team_id])
    scores = relationship("EvaluationScore", back_populates="team", cascade="all, delete-orphan")
    peer_reviews_received = relationship("PeerReview", back_populates="to_team",
                                         foreign_keys="PeerReview.to_team_id",
                                         cascade="all, delete-orphan")


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"

    id = Column(String, primary_key=True, default=gen_uuid)
    team_id = Column(String, ForeignKey("teams.id"), nullable=False)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    judge_name = Column(String, nullable=False)
    judge_email = Column(String, nullable=False)
    scores_json = Column(JSON, nullable=False)  # {"innovation": 7, "execution": 8, ...}
    notes = Column(Text, nullable=True)
    average = Column(Float, nullable=True)
    is_anomaly = Column(Boolean, default=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    team = relationship("Team", back_populates="scores")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    type = Column(SAEnum(ApprovalType), nullable=False)
    status = Column(SAEnum(ApprovalStatus), default=ApprovalStatus.pending)
    description = Column(Text, nullable=False)
    payload = Column(JSON, nullable=True)  # extra data for the action
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String, nullable=True)

    event = relationship("Event", back_populates="approvals")


class Communication(Base):
    __tablename__ = "communications"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    recipient = Column(String, nullable=False)
    recipient_email = Column(String, nullable=True)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    status = Column(SAEnum(CommStatus), default=CommStatus.draft)
    stage = Column(String, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="communications")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    message = Column(Text, nullable=False)
    log_type = Column(String, default="info")  # info | success | warning | error
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="activity_logs")


class AgentMessage(Base):
    """Stores the conversational agent chat history for dynamic event config."""
    __tablename__ = "agent_messages"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="agent_messages")


class PeerReview(Base):
    """Stores peer ratings submitted by one team for another during the scoring phase."""
    __tablename__ = "peer_reviews"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    from_team_id = Column(String, ForeignKey("teams.id"), nullable=False)
    to_team_id = Column(String, ForeignKey("teams.id"), nullable=False)
    score = Column(Float, nullable=False)  # 0-10 scale
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    to_team = relationship("Team", back_populates="peer_reviews_received",
                           foreign_keys=[to_team_id])
    from_team = relationship("Team", foreign_keys=[from_team_id])

