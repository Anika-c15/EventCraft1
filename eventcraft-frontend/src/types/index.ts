export type ParticipantLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'
export type ParticipantStatus = 'Active' | 'Pending' | 'Inactive' | 'Waitlisted'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApprovalType = 'Progression' | 'Team Formation' | 'Score Override' | 'Rule Change'
export type PipelineStage = 'Participant Intake' | 'Team Formation' | 'Evaluation' | 'Results' | 'Progression'
export type StageStatus = 'completed' | 'active' | 'pending'
export type CommStatus = 'Sent' | 'Draft' | 'Scheduled' | 'Failed'

export interface Participant {
  id: string
  name: string
  email: string
  institution: string
  level: ParticipantLevel
  skills: string[]
  status: ParticipantStatus
  teamId?: string
  registeredAt: string
}

export interface Team {
  id: string
  name: string
  memberIds: string[]
  status: 'Proposed' | 'Approved' | 'Active'
  rationale: string
  score?: number
  rank?: number
}

export interface Approval {
  id: string
  type: ApprovalType
  status: ApprovalStatus
  description: string
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface EvaluationScore {
  id: string
  judgeName: string
  judgeEmail: string
  teamId: string
  innovation: number
  execution: number
  presentation: number
  impact: number
  notes: string
  submittedAt: string
}

export interface Communication {
  id: string
  recipient: string
  subject: string
  status: CommStatus
  sentAt: string
  stage: string
}

export interface ActivityLog {
  id: string
  message: string
  timestamp: string
  type: 'info' | 'success' | 'warning' | 'error'
}

export interface FormationRules {
  eventName: string
  teamSize: number
  allowIncompleteTeams: boolean
  skillBalance: boolean
  institutionDiversity: boolean
  maxPerInstitution: number
  experienceLevelGrouping: 'mixed' | 'similar' | 'none'
  maxTeams: number
}

export interface Subscriber {
  id: string
  name: string
  email: string
  subscribedAt: string
  notified: boolean
}

// ── Social Scraping Types ───────────────────────────────────────────────────

export type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'mock'
export type SocialPollStatus = 'draft' | 'posted' | 'completed' | 'failed'
export type PollType = 'rating' | 'comparative' | 'hybrid' | 'linkedin_text_fallback' | 'twitter_text_fallback'

export interface SocialPoll {
  id: string
  event_id: string
  team_id: string | null
  platform: SocialPlatform
  poll_type: PollType
  question_text: string
  commentary: string | null
  options: { text: string; position: number }[]
  option_team_mapping: Record<string, string> | null
  platform_post_id: string | null
  platform_poll_id: string | null
  status: SocialPollStatus
  votes: Record<string, number> | null
  vote_snapshots: { ts: string; votes: Record<string, number> }[] | null
  total_votes: number
  normalized_score: number | null
  error_message: string | null
  flagged: boolean
  flag_reason: string | null
  admin_override_score: number | null
  manual_pending: boolean
  duration_minutes: number
  posted_at: string | null
  ends_at: string | null
  fetched_at: string | null
  locked_at: string | null
  created_at: string
  llm_provider_used?: string | null
}

export interface SocialConfig {
  enabled: boolean
  platforms: SocialPlatform[]
  poll_type: PollType
  poll_duration_minutes: number
  auto_post_on_evaluation: boolean
  auto_fetch_on_completion: boolean
  min_vote_threshold: number
  social_weight?: number
}

export interface PlatformAuthStatus {
  configured: boolean
  valid: boolean
  expires_at: string | null
  days_remaining: number | null
  status: 'healthy' | 'expiring_soon' | 'expired' | 'not_configured' | 'error'
  read_ok: boolean
}

export interface SocialAuthStatus {
  twitter: PlatformAuthStatus
  linkedin: PlatformAuthStatus
  instagram: PlatformAuthStatus
  mock: PlatformAuthStatus
}

export interface SocialCampaignSummary {
  total_polls: number
  total_votes: number
  avg_votes_per_poll: number
  flagged_polls: number
  team_scores: {
    team_id: string
    team_name: string
    score: number
    total_votes: number
  }[]
  ai_summary: string
  llm_provider_used?: string | null
}

export type PipelineStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'manual_pending'

export interface PollPipelineStatus {
  generate: Record<SocialPlatform, PipelineStepStatus>
  post: Record<SocialPlatform, PipelineStepStatus & { error?: string }>
  fetch: Record<SocialPlatform, PipelineStepStatus>
  calculate: PipelineStepStatus
}

