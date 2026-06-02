import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, eventsApi, approvalsApi, communicationsApi } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

interface AppContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  authChecked: boolean          // true once the initial session check is done
  login: (email: string, password: string) => Promise<void>
  logout: () => void

  eventId: string | null
  setEventId: (id: string) => void
  eventName: string

  eventsList: any[]
  loadEventsList: () => Promise<any[]>

  approvals: any[]
  loadApprovals: () => Promise<void>
  resolveApproval: (id: string, status: 'approved' | 'rejected') => Promise<void>
  addApproval: (approval: { type: string; description: string; status?: string; payload?: any }) => Promise<void>

  dashboardStats: any | null
  loadDashboard: () => Promise<void>

  activityLog: any[]
  loadActivityLog: () => Promise<void>

  wsConnected: boolean
  lastWsMessage: any | null

  loading: boolean
  error: string | null
  clearError: () => void

  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]               = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)   // ← key fix
  const [eventId, setEventIdState]    = useState<string | null>(localStorage.getItem('ec_event_id'))
  const [eventsList, setEventsList]   = useState<any[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('ec_theme')
    if (saved) return saved as 'light' | 'dark'
    const hour = new Date().getHours()
    return hour >= 18 || hour < 6 ? 'dark' : 'light'
  })

  // Track if user has manually overridden the theme
  const [themeManuallySet, setThemeManuallySet] = useState<boolean>(
    () => !!localStorage.getItem('ec_theme_manual')
  )

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('ec_theme', theme)
  }, [theme])

  // Auto dark mode based on time (6 PM - 6 AM) — only if user hasn't manually set it
  useEffect(() => {
    const checkTime = () => {
      if (themeManuallySet) return  // respect manual override
      const hour = new Date().getHours()
      const shouldBeDark = hour >= 18 || hour < 6
      setTheme(shouldBeDark ? 'dark' : 'light')
    }
    const interval = setInterval(checkTime, 60000)
    return () => clearInterval(interval)
  }, [themeManuallySet])

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      return next
    })
    // Mark as manually set so auto-switch stops overriding
    setThemeManuallySet(true)
    localStorage.setItem('ec_theme_manual', '1')
  }
  const [eventName, setEventName]     = useState<string>('EventCraft Hackathon')
  const [approvals, setApprovals]     = useState<any[]>([])
  const [dashboardStats, setDashboardStats] = useState<any | null>(null)
  const [activityLog, setActivityLog] = useState<any[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'approval_resolved':
      case 'approval_created':
        loadApprovals(); loadDashboard(); break
      case 'score_submitted':
      case 'anomaly_flagged':
        loadDashboard(); loadActivityLog(); break
      case 'rationales_ready':
      case 'stage_advanced':
        loadDashboard(); loadActivityLog(); break
      case 'email_sent':
      case 'activity_log':
        loadActivityLog(); break
    }
  }, []) // eslint-disable-line

  const { connected: wsConnected, lastMessage: lastWsMessage } = useWebSocket(
    user ? eventId : null,
    handleWsMessage,
  )

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('ec_token')
    if (!token) {
      setAuthChecked(true)   // no token → skip check, go straight to login
      return
    }
    authApi.me()
      .then((u) => setUser(u))
      .catch(() => {
        localStorage.removeItem('ec_token')
        localStorage.removeItem('ec_event_id')
      })
      .finally(() => setAuthChecked(true))  // always mark done
  }, [])

  // ── Load event name when eventId changes ───────────────────────────────────
  useEffect(() => {
    if (eventId) {
      eventsApi.get(eventId).then((e) => setEventName(e.name)).catch(() => {})
    }
  }, [eventId])

  const loadEventsList = useCallback(async () => {
    if (!localStorage.getItem('ec_token')) return []
    try {
      const list = await eventsApi.list()
      setEventsList(list)
      return list
    } catch (e: any) {
      setError(e.message || 'Failed to load events list')
      return []
    }
  }, [])

  // ── Auth helpers ───────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.login(email, password)
      localStorage.setItem('ec_token', res.access_token)
      const userData = { id: res.user_id, email, name: res.name, role: res.role }
      setUser(userData)

      const events = await eventsApi.list()
      setEventsList(events)
      if (events.length > 0) {
        let activeEvent = null
        if (userData.role === 'admin') {
          activeEvent = events.find((e: any) => e.name.toLowerCase().includes('eventcraft hackathon 2026') || e.name.toLowerCase().includes('eventcraft hackathon'))
        }
        if (!activeEvent) {
          const savedId = localStorage.getItem('ec_event_id')
          activeEvent = events.find((e: any) => e.id === savedId) || events[0]
        }
        setEventIdState(activeEvent.id)
        localStorage.setItem('ec_event_id', activeEvent.id)
        setEventName(activeEvent.name)
      } else {
        setEventIdState(null)
        localStorage.removeItem('ec_event_id')
        setEventName('')
      }
    } catch (e: any) {
      setError(e.message || 'Login failed')
      throw e
    } finally {
      setLoading(false)
    }
  }

const logout = () => {
  localStorage.removeItem('ec_token')
  localStorage.removeItem('ec_event_id')
  setUser(null)
  setEventIdState(null)
  setEventsList([])
  setApprovals([])
  setDashboardStats(null)
  window.location.href = '/'
}

  const setEventId = (id: string) => {
    setEventIdState(id)
    localStorage.setItem('ec_event_id', id)
  }

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadApprovals = useCallback(async () => {
    if (!eventId) return
    try { setApprovals(await approvalsApi.list(eventId)) }
    catch (e: any) { setError(e.message) }
  }, [eventId])

  const resolveApproval = async (id: string, status: 'approved' | 'rejected') => {
    if (!eventId) return
    try {
      await approvalsApi.resolve(eventId, id, status)
      await loadApprovals()
      await loadDashboard()
    } catch (e: any) { setError(e.message); throw e }
  }

  const addApproval = async (approval: { type: string; description: string; status?: string; payload?: any }) => {
    let evId = eventId
    if (!evId) {
      try {
        const events = await eventsApi.list()
        if (events.length > 0) {
          evId = events[0].id
        }
      } catch (e) {
        console.error("Failed to fetch events:", e)
      }
    }
    if (!evId) return
    try {
      await approvalsApi.create(evId, {
        type: approval.type,
        description: approval.description,
        payload: approval.payload,
      })
      if (!!user) {
        await loadApprovals()
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create approval')
    }
  }

  const loadDashboard = useCallback(async () => {
    if (!eventId) return
    try { setDashboardStats(await eventsApi.dashboard(eventId)) }
    catch (e: any) { setError(e.message) }
  }, [eventId])

  const loadActivityLog = useCallback(async () => {
    if (!eventId) return
    try { setActivityLog(await communicationsApi.activityLog(eventId)) }
    catch (e: any) { setError(e.message) }
  }, [eventId])

  // Auto-load when user is available (checks and updates eventsList)
  useEffect(() => {
    if (user) {
      loadEventsList().then((list) => {
        if (list && list.length > 0) {
          const currentId = localStorage.getItem('ec_event_id')
          let activeEvent = list.find((e: any) => e.id === currentId)
          if (!activeEvent) {
            if (user.role === 'admin') {
              activeEvent = list.find((e: any) => e.name.toLowerCase().includes('eventcraft hackathon 2026') || e.name.toLowerCase().includes('eventcraft hackathon'))
            }
            if (!activeEvent) {
              activeEvent = list[0]
            }
            localStorage.setItem('ec_event_id', activeEvent.id)
          }
          setEventIdState(activeEvent.id)
          setEventName(activeEvent.name)
        } else {
          setEventIdState(null)
          localStorage.removeItem('ec_event_id')
          setEventName('')
        }
      })
    }
  }, [user, loadEventsList])

  // Auto-load details when both user and eventId are available
  useEffect(() => {
    if (eventId && user) {
      loadApprovals()
      loadDashboard()
      loadActivityLog()
    }
  }, [eventId, user, loadApprovals, loadDashboard, loadActivityLog])

  return (
    <AppContext.Provider value={{
      user, isAuthenticated: !!user, authChecked,
      login, logout,
      eventId, setEventId, eventName,
      eventsList, loadEventsList,
      approvals, loadApprovals, resolveApproval, addApproval,
      dashboardStats, loadDashboard,
      activityLog, loadActivityLog,
      wsConnected, lastWsMessage,
      loading, error, clearError: () => setError(null),
      theme, toggleTheme,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
