const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken(): string | null {
  return localStorage.getItem('ec_token')
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (!skipAuth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    // Only redirect to login if we're not on a public portal page
    const pathname = window.location.pathname
    const isPublicPage =
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/subscribe' ||
      pathname === '/candidate' ||
      pathname.startsWith('/portal/') ||
      pathname.startsWith('/judge/')
    if (!isPublicPage) {
      localStorage.removeItem('ec_token')
      localStorage.removeItem('ec_event_id')
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user_id: string; name: string; role: string }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      true,
    ),
  me: () => request<{ id: string; email: string; name: string; role: string }>('/api/auth/me'),
}

// ── Events ─────────────────────────────────────────────────────────────────────

export const eventsApi = {
  list: () => request<any[]>('/api/events'),
  getDemoPortal: () => request<{ token: string; event_id: string }>('/api/events/public/demo-portal', {}, true),
  getActiveEvent: () => request<{ event_id: string; event_name: string }>('/api/events/public/active-event', {}, true),
  verifyEventName: (name: string) => request<{ event_id: string; event_name: string }>(`/api/events/public/verify-name?name=${encodeURIComponent(name)}`, {}, true),
  create: (name: string, description?: string) =>
    request<any>('/api/events', { method: 'POST', body: JSON.stringify({ name, description }) }),
  get: (id: string) => request<any>(`/api/events/${id}`),
  dashboard: (id: string) => request<any>(`/api/events/${id}/dashboard`),
  stages: (id: string) => request<any[]>(`/api/events/${id}/stages`),
  updateFormationRules: (id: string, rules: any) =>
    request<any>(`/api/events/${id}/formation-rules`, {
      method: 'PUT',
      body: JSON.stringify(rules),
    }),
  advanceStage: (id: string) =>
    request<any>(`/api/events/${id}/advance-stage`, { method: 'POST' }),
  setStageDirect: (id: string, stageName: string) =>
    request<any>(`/api/events/${id}/set-stage-direct`, {
      method: 'POST',
      body: JSON.stringify({ stage_name: stageName }),
    }),
  delete: (id: string) =>
    request<any>(`/api/events/${id}`, { method: 'DELETE' }),
}

// ── Participants ───────────────────────────────────────────────────────────────

export const participantsApi = {
  list: (eventId: string, search?: string) =>
    request<any[]>(`/api/events/${eventId}/participants${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  add: (eventId: string, data: any) =>
    request<any>(`/api/events/${eventId}/participants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (eventId: string, participantId: string) =>
    request<any>(`/api/events/${eventId}/participants/${participantId}`, { method: 'DELETE' }),
  importCsv: async (eventId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const token = getToken()
    const res = await fetch(`${BASE_URL}/api/events/${eventId}/participants/import-csv`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (!res.ok) throw new Error('CSV import failed')
    return res.json()
  },
  portal: (eventId: string, token: string) =>
    request<any>(`/api/events/${eventId}/participants/portal/${token}`, {}, true),
  updateTeamSubmission: (eventId: string, token: string, data: { github_link?: string; demo_link?: string; lock?: boolean }) =>
    request<any>(`/api/events/${eventId}/participants/portal/${token}/team`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true),
  parseResume: async (eventId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE_URL}/api/events/${eventId}/participants/parse-resume`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Resume parsing failed' }))
      throw new Error(err.detail || 'Resume parsing failed')
    }
    return res.json()
  },
}

export const teamsApi = {
  saveSubmissionDraft: (data: {
    project_title?: string;
    project_description?: string;
    github_url?: string;
    video_url?: string;
    presentation_url?: string;
    token: string;
  }) =>
    request<any>('/api/teams/submission/save-draft', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true),
  submitFinalSubmission: (data: {
    project_title: string;
    project_description: string;
    github_url: string;
    video_url: string;
    presentation_url: string;
    token: string;
  }) =>
    request<any>('/api/teams/submission/submit-final', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true),
  list: (eventId: string) => request<any[]>(`/api/events/${eventId}/teams`),
  form: (eventId: string) =>
    request<any[]>(`/api/events/${eventId}/teams/form`, { method: 'POST' }),
  clear: (eventId: string) =>
    request<any>(`/api/events/${eventId}/teams/clear`, { method: 'DELETE' }),
  leaderboard: (eventId: string) => request<any[]>(`/api/events/${eventId}/teams/leaderboard`),
  publicLeaderboard: (eventId: string) =>
    request<{ event_name: string; teams: any[] }>(`/api/events/${eventId}/teams/leaderboard/public`, {}, true),

  renameTeam: (token: string, name: string) =>
    request<{ message: string; name: string; name_locked: boolean }>(
      '/api/teams/submission/rename',
      { method: 'POST', body: JSON.stringify({ token, name }) },
      true,
    ),
}

// ── Evaluations ────────────────────────────────────────────────────────────────

export const evaluationsApi = {
  list: (eventId: string, teamId?: string) =>
    request<any[]>(`/api/events/${eventId}/evaluations${teamId ? `?team_id=${teamId}` : ''}`),
  submit: (eventId: string, data: any) =>
    request<any>(`/api/events/${eventId}/evaluations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  consolidate: (eventId: string) =>
    request<any>(`/api/events/${eventId}/evaluations/consolidate`, { method: 'POST' }),
  assessmentGuide: (eventId: string, teamId: string) =>
    request<any>(`/api/events/${eventId}/evaluations/assessment-guide/${teamId}`),
  savePublicVote: (eventId: string, teamId: string, publicScore: number) =>
    request<any>(`/api/events/${eventId}/evaluations/teams/${teamId}/public-vote`, {
      method: 'PUT',
      body: JSON.stringify({ public_vote_score: publicScore }),
    }),
  getBiasMitigation: (eventId: string) =>
    request<any[]>(`/api/events/${eventId}/evaluations/bias-mitigation`),
  lockScore: (eventId: string, teamId: string, data: { final_score: number; bias_rationale?: string }) =>
    request<any>(`/api/events/${eventId}/evaluations/teams/${teamId}/lock-score`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listInvitations: (eventId: string) =>
    request<any[]>(`/api/events/${eventId}/evaluations/judge-invitations`),
  revokeInvitation: (eventId: string, inviteId: string) =>
    request<any>(`/api/events/${eventId}/evaluations/judge-invitations/${inviteId}/revoke`, {
      method: 'POST',
    }),
}

// ── Approvals ──────────────────────────────────────────────────────────────────

export const approvalsApi = {
  list: (eventId: string) => request<any[]>(`/api/events/${eventId}/approvals`),
  create: (eventId: string, data: { type: string; description: string; payload?: any }) =>
    request<any>(`/api/events/${eventId}/approvals`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resolve: (eventId: string, approvalId: string, status: 'approved' | 'rejected') =>
    request<any>(`/api/events/${eventId}/approvals/${approvalId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
}

// ── Communications ─────────────────────────────────────────────────────────────

export const communicationsApi = {
  list: (eventId: string) => request<any[]>(`/api/events/${eventId}/communications`),
  draft: (eventId: string, data: any) =>
    request<any>(`/api/events/${eventId}/communications/draft`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  create: (eventId: string, data: any) =>
    request<any>(`/api/events/${eventId}/communications`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  send: (eventId: string, commId: string) =>
    request<any>(`/api/events/${eventId}/communications/${commId}/send`, { method: 'POST' }),
  activityLog: (eventId: string) =>
    request<any[]>(`/api/events/${eventId}/communications/activity-log`),
  sendPortalLinks: (eventId: string) =>
    request<any>(`/api/events/${eventId}/communications/send-portal-links`, { method: 'POST' }),
}

// ── Agent ──────────────────────────────────────────────────────────────────────

export const agentApi = {
  history: (eventId: string) => request<any[]>(`/api/events/${eventId}/agent/history`),
  chat: (eventId: string, content: string) =>
    request<any>(`/api/events/${eventId}/agent/chat`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  clearHistory: (eventId: string) =>
    request<any>(`/api/events/${eventId}/agent/history`, { method: 'DELETE' }),
}

// ── Peer Reviews ───────────────────────────────────────────────────────────────

export const peerReviewApi = {
  /** Submit (or update) a peer vote for a team using a participant portal token */
  submitVote: (eventId: string, token: string, toTeamId: string, score: number) =>
    request<any>(
      `/api/events/${eventId}/peer-reviews?token=${encodeURIComponent(token)}`,
      { method: 'POST', body: JSON.stringify({ to_team_id: toTeamId, score }) },
      true,  // skip auth header — token is in query string
    ),

  /** Get the map of {to_team_id: score} for already-submitted votes */
  getMyVotes: (eventId: string, token: string) =>
    request<Record<string, number>>(
      `/api/events/${eventId}/peer-reviews/my-votes?token=${encodeURIComponent(token)}`,
      {},
      true,
    ),

  /** Get showroom cards for all other teams */
  getShowroom: (eventId: string, token: string) =>
    request<any[]>(
      `/api/events/${eventId}/peer-reviews/showroom?token=${encodeURIComponent(token)}`,
      {},
      true,
    ),
}

// ── Subscribers ────────────────────────────────────────────────────────────────

export const subscribersApi = {
  /** Public — no auth needed */
  subscribe: (name: string, email: string) =>
    request<any>('/api/subscribers', {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    }, true),

  /** Public — no auth needed */
  unsubscribe: (email: string, reason?: string) =>
    request<{ message: string }>('/api/subscribers/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ email, reason: reason || '' }),
    }, true),

  /** Committee — requires auth */
  list: () => request<any[]>('/api/subscribers'),

  remove: (id: string) =>
    request<void>(`/api/subscribers/${id}`, { method: 'DELETE' }),

  notifyAll: (eventName: string, description?: string) =>
    request<{ notified: number }>('/api/subscribers/notify', {
      method: 'POST',
      body: JSON.stringify({ event_name: eventName, description }),
    }),
}


// ── Omni Agent ──────────────────────────────────────────────────────────────────

export const omniAgentApi = {
  history: (eventId: string, customToken?: string) => {
    const headers = customToken ? { 'Authorization': `Bearer ${customToken}` } : undefined
    return request<any[]>(
      `/api/events/${eventId}/omni-agent/history`,
      { headers },
      !!customToken
    )
  },
  chat: (eventId: string, content: string, customToken?: string) => {
    const headers = customToken ? { 'Authorization': `Bearer ${customToken}` } : undefined
    return request<any>(
      `/api/events/${eventId}/omni-agent/chat`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content }),
      },
      !!customToken
    )
  }
}

