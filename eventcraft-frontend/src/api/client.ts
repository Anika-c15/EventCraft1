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
    localStorage.removeItem('ec_token')
    localStorage.removeItem('ec_event_id')
    window.location.href = '/login'
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
}

// ── Teams ──────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list: (eventId: string) => request<any[]>(`/api/events/${eventId}/teams`),
  form: (eventId: string) =>
    request<any[]>(`/api/events/${eventId}/teams/form`, { method: 'POST' }),
  clear: (eventId: string) =>
    request<any>(`/api/events/${eventId}/teams/clear`, { method: 'DELETE' }),
  leaderboard: (eventId: string) => request<any[]>(`/api/events/${eventId}/teams/leaderboard`),
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
}

// ── Approvals ──────────────────────────────────────────────────────────────────

export const approvalsApi = {
  list: (eventId: string) => request<any[]>(`/api/events/${eventId}/approvals`),
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
