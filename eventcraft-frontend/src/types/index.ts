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
