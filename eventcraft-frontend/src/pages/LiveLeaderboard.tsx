import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trophy, Users, Zap, Wifi, WifiOff, Medal } from 'lucide-react'
import { eventsApi, teamsApi } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'

interface TeamRow {
  team_id: string
  team_name: string
  score: number | null
  rank: number
  member_count: number
  judges_count: number
  score_breakdown: Record<string, number>
}

// Rank styles have both dark and light variants
const RANK_CONFIGS: Record<number, {
  darkBg: string; lightBg: string
  darkText: string; lightText: string
  darkBorder: string; lightBorder: string
  icon: string
}> = {
  1: {
    darkBg: 'from-yellow-500/20 to-amber-500/10',
    lightBg: 'from-yellow-100 to-amber-50',
    darkText: 'text-yellow-400', lightText: 'text-yellow-600',
    darkBorder: 'border-yellow-500/40', lightBorder: 'border-yellow-300',
    icon: '🥇',
  },
  2: {
    darkBg: 'from-slate-400/20 to-slate-500/10',
    lightBg: 'from-slate-100 to-slate-50',
    darkText: 'text-slate-300', lightText: 'text-slate-600',
    darkBorder: 'border-slate-400/40', lightBorder: 'border-slate-300',
    icon: '🥈',
  },
  3: {
    darkBg: 'from-orange-700/20 to-orange-800/10',
    lightBg: 'from-orange-100 to-orange-50',
    darkText: 'text-orange-400', lightText: 'text-orange-600',
    darkBorder: 'border-orange-600/40', lightBorder: 'border-orange-300',
    icon: '🥉',
  },
}

const ScoreBar: React.FC<{ value: number; max?: number; color?: string; isDark: boolean }> = ({
  value, max = 10, color = '#E8450A', isDark,
}) => {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// Read and sync theme from localStorage / html class — no AppContext needed (public page)
function useLeaderboardTheme() {
  const getTheme = (): 'dark' | 'light' => {
    // Check the html element class first (set by AppContext on load)
    if (document.documentElement.classList.contains('dark')) return 'dark'
    const saved = localStorage.getItem('ec_theme')
    if (saved === 'dark' || saved === 'light') return saved
    const hour = new Date().getHours()
    return hour >= 18 || hour < 6 ? 'dark' : 'light'
  }

  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme)

  useEffect(() => {
    // Apply the theme to the html element so Tailwind dark: classes work on this standalone page
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    // Watch for external theme changes (e.g. admin sidebar toggle while leaderboard is open)
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // Also check localStorage periodically for cross-tab sync
    const interval = setInterval(() => {
      const saved = localStorage.getItem('ec_theme')
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved)
      }
    }, 2000)

    return () => { observer.disconnect(); clearInterval(interval) }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('ec_theme', next)
    localStorage.setItem('ec_theme_manual', '1')
  }

  return { theme, toggleTheme, isDark: theme === 'dark' }
}

export const LiveLeaderboard: React.FC = () => {
  const { theme, toggleTheme, isDark } = useLeaderboardTheme()
  const [searchParams] = useSearchParams()

  const [eventId, setEventId] = useState<string | null>(null)
  const [eventName, setEventName] = useState('EventCraft')
  const [rows, setRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const prevRanks = useRef<Record<string, number>>({})

  useEffect(() => {
    const paramEventId = searchParams.get('event')
    if (paramEventId) {
      // Use the event_id from URL — fetch its name directly
      setEventId(paramEventId)
      eventsApi.getActiveEvent()
        .then(d => {
          // Only use active event name if it matches, otherwise just keep default
          if (d.event_id === paramEventId) setEventName(d.event_name)
        })
        .catch(() => {})
      // Also try fetching the event name via public leaderboard data
    } else {
      // Fallback: no event in URL, use whatever the backend considers active
      eventsApi.getActiveEvent()
        .then(d => { setEventId(d.event_id); setEventName(d.event_name) })
        .catch(() => {})
    }
  }, [searchParams])

  const loadLeaderboard = useCallback(async (id: string) => {
    try {
      const data = await teamsApi.publicLeaderboard(id)
      // If the API returns event_name, use it
      if (data.event_name) setEventName(data.event_name)
      const teams = Array.isArray(data) ? data : (data.teams ?? [])
      const scored = teams.filter((t: any) => t.score !== null)
      const unscored = teams.filter((t: any) => t.score === null)

      const newFlash = new Set<string>()
      scored.forEach((t: any) => {
        if (prevRanks.current[t.team_id] !== undefined && prevRanks.current[t.team_id] !== t.rank) {
          newFlash.add(t.team_id)
        }
        prevRanks.current[t.team_id] = t.rank
      })

      if (newFlash.size > 0) {
        setFlashIds(newFlash)
        setTimeout(() => setFlashIds(new Set()), 1500)
      }

      setRows([...scored, ...unscored])
      setLastUpdated(new Date())
    } catch (e) {
      console.error('Failed to load leaderboard', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (eventId) loadLeaderboard(eventId)
  }, [eventId, loadLeaderboard])

  useEffect(() => {
    if (!eventId) return
    const interval = setInterval(() => loadLeaderboard(eventId), 30000)
    return () => clearInterval(interval)
  }, [eventId, loadLeaderboard])

  const handleWsMessage = useCallback((msg: any) => {
    if (
      msg.type === 'leaderboard_update' ||
      msg.type === 'score_locked' ||
      msg.type === 'score_submitted' ||
      msg.type === 'stage_advanced'
    ) {
      if (eventId) loadLeaderboard(eventId)
    }
  }, [eventId, loadLeaderboard])

  const { connected } = useWebSocket(eventId, handleWsMessage)

  const criteria = ['innovation', 'execution', 'presentation', 'impact']
  const criteriaColors: Record<string, string> = {
    innovation: '#818cf8',
    execution: '#34d399',
    presentation: '#f472b6',
    impact: '#fb923c',
  }

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-200 ${
      isDark
        ? 'bg-[#0a0f1e] text-white'
        : 'bg-gradient-to-br from-orange-50 via-white to-slate-100 text-gray-900'
    }`}>

      {/* ── Animated background blobs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] animate-pulse ${
          isDark ? 'bg-primary/10' : 'bg-primary/5'
        }`} />
        <div className={`absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] animate-pulse ${
          isDark ? 'bg-indigo-600/10' : 'bg-indigo-400/5'
        }`} style={{ animationDelay: '1s' }} />
        <div className={`absolute top-[40%] left-[50%] w-[300px] h-[300px] rounded-full blur-[80px] animate-pulse ${
          isDark ? 'bg-purple-600/8' : 'bg-purple-400/5'
        }`} style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-10">

        {/* ── Header ── */}
        <div className="text-center mb-10">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg ${
            isDark
              ? 'bg-primary/20 border border-primary/30 shadow-primary/20'
              : 'bg-primary/10 border border-primary/20 shadow-primary/10'
          }`}>
            <Trophy size={30} className="text-primary" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-1">
            <span className={isDark ? 'text-white' : 'text-gray-900'}>Live </span>
            <span className="text-primary">Leaderboard</span>
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{eventName}</p>

          {/* Status bar */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              connected
                ? 'bg-green-500/10 border-green-500/30 text-green-500'
                : isDark
                  ? 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                  : 'bg-gray-100 border-gray-300 text-gray-500'
            }`}>
              {connected
                ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping absolute" /><Wifi size={12} /> Live</>
                : <><WifiOff size={12} /> Reconnecting…</>
              }
            </div>
            {lastUpdated && (
              <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {isDark ? '☀ Light' : '🌙 Dark'}
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Loading rankings…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-24">
            <Medal size={48} className={`mx-auto mb-4 ${isDark ? 'text-slate-600' : 'text-gray-300'}`} />
            <p className={`font-semibold ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>No scores yet</p>
            <p className={`text-sm mt-1 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              Rankings will appear once judges submit scores
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((team, idx) => {
              const cfg = RANK_CONFIGS[team.rank] || null
              const isFlashing = flashIds.has(team.team_id)
              const hasScore = team.score !== null

              const bgClass = cfg
                ? `bg-gradient-to-r ${isDark ? cfg.darkBg : cfg.lightBg} ${isDark ? cfg.darkBorder : cfg.lightBorder}`
                : isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white border-gray-200 shadow-sm'

              const nameTextClass = cfg
                ? (isDark ? cfg.darkText : cfg.lightText)
                : (isDark ? 'text-white' : 'text-gray-800')

              return (
                <div
                  key={team.team_id}
                  className={`
                    relative rounded-2xl border p-5 transition-all duration-500
                    ${bgClass}
                    ${isFlashing ? 'ring-2 ring-primary/60 scale-[1.01]' : ''}
                    ${isDark ? 'hover:bg-white/8 hover:border-white/20' : 'hover:shadow-md'}
                  `}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="flex items-center gap-4">

                    {/* Rank badge */}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black ${
                      cfg
                        ? isDark ? 'bg-white/10' : 'bg-white/60'
                        : isDark ? 'bg-white/5' : 'bg-gray-100'
                    }`}>
                      {cfg ? cfg.icon : (
                        <span className={`text-base font-bold ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                          #{team.rank}
                        </span>
                      )}
                    </div>

                    {/* Team info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold text-base truncate ${nameTextClass}`}>
                          {team.team_name}
                        </h3>
                        {isFlashing && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full animate-pulse">
                            <Zap size={9} /> Updated
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                        <span className="flex items-center gap-1"><Users size={11} /> {team.member_count} members</span>
                        <span>{team.judges_count} judge{team.judges_count !== 1 ? 's' : ''}</span>
                      </div>

                      {/* Criteria breakdown bars */}
                      {hasScore && Object.keys(team.score_breakdown).length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {criteria.filter(c => team.score_breakdown[c] !== undefined).map(c => (
                            <div key={c}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <span className={`capitalize ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{c}</span>
                                <span className="font-semibold" style={{ color: criteriaColors[c] }}>
                                  {team.score_breakdown[c]?.toFixed(1)}
                                </span>
                              </div>
                              <ScoreBar
                                value={team.score_breakdown[c] || 0}
                                color={criteriaColors[c]}
                                isDark={isDark}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score */}
                    <div className="flex-shrink-0 text-right">
                      {hasScore ? (
                        <>
                          <div className={`text-3xl font-black tabular-nums ${nameTextClass}`}>
                            {(team.score as number).toFixed(2)}
                          </div>
                          <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>/ 10</div>
                        </>
                      ) : (
                        <div className={`text-sm font-semibold ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
                          Pending
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <p className={`text-center text-xs mt-10 ${isDark ? 'text-slate-700' : 'text-gray-400'}`}>
          EventCraft · Live Rankings · Updates automatically
        </p>
      </div>
    </div>
  )
}
