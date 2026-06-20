const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

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
  sendOtp: (email: string) =>
    request<{ message: string }>('/api/auth/send-otp', {
      method: 'POST', body: JSON.stringify({ email }),
    }, true),
  verifyOtp: (email: string, otp: string) =>
    request<{ message: string; verified: boolean }>('/api/auth/verify-otp', {
      method: 'POST', body: JSON.stringify({ email, otp }),
    }, true),
  forgotPassword: (email: string) =>
    request<any>(
      '/api/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) },
      true,
    ),
  resetPassword: (email: string, otp: string, new_password: string) =>
    request<any>(
      '/api/auth/reset-password',
      { method: 'POST', body: JSON.stringify({ email, otp, new_password }) },
      true,
    ),
}

// ── Events ─────────────────────────────────────────────────────────────────────

export const eventsApi = {
  list: () => request<any[]>('/api/events'),
  getDemoPortal: () => request<{ token: string; event_id: string }>('/api/events/public/demo-portal', {}, true),
  getActiveEvent: () => request<{ event_id: string; event_name: string }>('/api/events/public/active-event', {}, true),
  verifyEventName: (name: string) => request<{ event_id: string; event_name: string }>(`/api/events/public/verify-name?name=${encodeURIComponent(name)}`, {}, true),
  getIntakeStatus: (eventId: string) => request<{ intake_open: boolean; reason: string }>(`/api/events/public/intake-status?event_id=${encodeURIComponent(eventId)}`, {}, true),
  create: (name: string, description?: string) =>
    request<any>('/api/events', { method: 'POST', body: JSON.stringify({ name, description }) }),
  get: (id: string) => request<any>(`/api/events/${id}`),
  update: (id: string, payload: { description?: string }) =>
    request<any>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  dashboard: (id: string) => request<any>(`/api/events/${id}/dashboard`),
  stages: (id: string) => request<any[]>(`/api/events/${id}/stages`),
  updateFormationRules: (id: string, rules: any) =>
    request<any>(`/api/events/${id}/formation-rules`, {
      method: 'PUT',
      body: JSON.stringify(rules),
    }),
  updateScoringWeights: (id: string, weights: { judge: number; peer: number; social: number }) =>
    request<any>(`/api/events/${id}/scoring-weights`, {
      method: 'PUT',
      body: JSON.stringify(weights),
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
  complete: (id: string) =>
    request<any>(`/api/events/${id}/complete`, { method: 'POST' }),
  reopen: (id: string) =>
    request<any>(`/api/events/${id}/reopen`, { method: 'POST' }),
  transferOwnershipInitiateOtp: (id: string) =>
    request<any>(`/api/events/${id}/transfer-ownership/initiate/request-otp`, { method: 'POST' }),
  transferOwnershipInitiateConfirm: (id: string, payload: { new_owner_id: string; leave_completely: boolean; otp: string }) =>
    request<any>(`/api/events/${id}/transfer-ownership/initiate/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTransferOwnershipStatus: (id: string) =>
    request<any>(`/api/events/${id}/transfer-ownership/status`),
  cancelTransferOwnership: (id: string) =>
    request<any>(`/api/events/${id}/transfer-ownership/cancel`, { method: 'POST' }),
  transferOwnershipClaimOtp: (id: string) =>
    request<any>(`/api/events/${id}/transfer-ownership/claim/request-otp`, { method: 'POST' }),
  transferOwnershipClaimConfirm: (id: string, payload: { otp: string }) =>
    request<any>(`/api/events/${id}/transfer-ownership/claim/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
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
  unlockScore: (eventId: string, teamId: string) =>
    request<any>(`/api/events/${eventId}/evaluations/teams/${teamId}/unlock-score`, {
      method: 'POST',
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
  /** Public — check if already subscribed */
  checkSubscription: (email: string, eventId: string) =>
    request<{ subscribed: boolean }>(`/api/subscribers/check?email=${encodeURIComponent(email)}&event_id=${encodeURIComponent(eventId)}`, {}, true),

  /** Public — no auth needed */
  subscribe: (name: string, email: string, eventId: string) =>
    request<any>(`/api/subscribers?event_id=${encodeURIComponent(eventId)}`, {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    }, true),

  /** Public — no auth needed */
  unsubscribe: (email: string, eventId: string, reason?: string) =>
    request<{ message: string }>(`/api/subscribers/unsubscribe?event_id=${encodeURIComponent(eventId)}`, {
      method: 'POST',
      body: JSON.stringify({ email, reason: reason || '' }),
    }, true),

  /** Committee — requires auth */
  list: (eventId: string) => request<any[]>(`/api/subscribers?event_id=${encodeURIComponent(eventId)}`),

  remove: (id: string) =>
    request<void>(`/api/subscribers/${id}`, { method: 'DELETE' }),

  notifyAll: (eventId: string, eventName: string, description?: string) =>
    request<{ notified: number }>(`/api/subscribers/notify?event_id=${encodeURIComponent(eventId)}`, {
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

// ── Social Scraping ────────────────────────────────────────────────────────────

export const socialScrapingApi = {
  getSocialConfig: (eventId: string) =>
    request<any>(`/api/events/${eventId}/social-scraping/config`),
  
  updateSocialConfig: (eventId: string, config: any) =>
    request<any>(`/api/events/${eventId}/social-scraping/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  
  getAuthStatus: (eventId: string) =>
    request<any>(`/api/events/${eventId}/social-scraping/auth-status`),

  // ── Participant Methods ──
  getTeamSocialPosts: (eventId: string, teamId: string) =>
    request<any[]>(`/api/events/${eventId}/social-scraping/teams/${teamId}/social-posts`, {}, true),

  submitSocialPost: async (eventId: string, teamId: string, url: string, file?: File) => {
    const formData = new FormData()
    formData.append('url', url)
    if (file) {
      formData.append('screenshot_file', file)
    }
    const res = await fetch(`${BASE_URL}/api/events/${eventId}/social-scraping/teams/${teamId}/social-posts`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Post submission failed' }))
      throw new Error(err.detail || 'Post submission failed')
    }
    return res.json()
  },

  uploadPostProof: async (eventId: string, teamId: string, postId: string, file: File) => {
    const formData = new FormData()
    formData.append('screenshot_file', file)
    const res = await fetch(`${BASE_URL}/api/events/${eventId}/social-scraping/teams/${teamId}/social-posts/${postId}/proof`, {
      method: 'PUT',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Proof upload failed' }))
      throw new Error(err.detail || 'Proof upload failed')
    }
    return res.json()
  },

  deleteSocialPost: (eventId: string, teamId: string, postId: string) =>
    request<any>(`/api/events/${eventId}/social-scraping/teams/${teamId}/social-posts/${postId}`, {
      method: 'DELETE',
    }, true),

  // ── Admin Methods ──
  listAllSocialPosts: (eventId: string, filters?: { teamId?: string; status?: string }) => {
    let query = ''
    if (filters) {
      const parts = []
      if (filters.teamId) parts.push(`team_id=${filters.teamId}`)
      if (filters.status) parts.push(`status=${filters.status}`)
      if (parts.length > 0) query = '?' + parts.join('&')
    }
    return request<any[]>(`/api/events/${eventId}/social-scraping/social-posts${query}`)
  },

  verifyPostManually: (eventId: string, postId: string, data: { likes: number; shares: number; approve: boolean; rejection_reason?: string }) =>
    request<any>(`/api/events/${eventId}/social-scraping/social-posts/${postId}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  calculateSocialScores: (eventId: string) =>
    request<any>(`/api/events/${eventId}/social-scraping/calculate-scores`, { method: 'POST' }),
  
  runFullPipeline: (eventId: string) =>
    request<any>(`/api/events/${eventId}/social-scraping/run-pipeline`, { method: 'POST' }),
  
  getCampaignSummary: (eventId: string) =>
    request<any>(`/api/events/${eventId}/social-scraping/campaign-summary`),
  
  resetCampaign: (eventId: string) =>
    request<{ status: string; message: string }>(`/api/events/${eventId}/social-scraping/reset-campaign`, { method: 'POST' }),

  overrideTeamSocialScore: (eventId: string, teamId: string, overrideScore: number | null) =>
    request<any>(`/api/events/${eventId}/social-scraping/teams/${teamId}/override-score`, {
      method: 'POST',
      body: JSON.stringify({ override_score: overrideScore }),
    }),

  retryPostProof: async (eventId: string, teamId: string, postId: string, screenshotFile?: File) => {
    const formData = new FormData()
    if (screenshotFile) {
      formData.append('screenshot_file', screenshotFile)
    }
    const res = await fetch(`${BASE_URL}/api/events/${eventId}/social-scraping/teams/${teamId}/social-posts/${postId}/retry`, {
      method: 'PUT',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Retry failed' }))
      throw new Error(err.detail || 'Retry failed')
    }
    return res.json()
  },
}


