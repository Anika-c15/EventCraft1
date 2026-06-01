import React, { useEffect, useState, useRef, useCallback } from 'react'
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

const RANK_COLORS: Record<number, { bg: string; text: string; border: string; icon: string }> = {
  1: { bg: 'from-yellow-500/20 to-amber-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/40', icon: '🥇' },
  2: { bg: 'from-slate-400/20 to-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-400/40',  icon: '🥈' },
  3: { bg: 'from-orange-700/20 to-orange-800/10', text: 'text-orange-400',  border: 'border-orange-600/40', icon: '🥉' },
}

const ScoreBar: React.FC<{ value: number; max?: number; color?: string }> = ({ value, max = 10, color = '#E8450A' }) => {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

export const LiveLeaderboard: React.FC = () => {
  const [eventId, setEventId] = useState<string | null>(null)
  const [eventName, setEventName] = useState('EventCraft')
  const [rows, setRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const prevRanks = useRef<Record<string, number>>({})

  // Load event id on mount
  useEffect(() => {
    eventsApi.getActiveEvent()
      .then(d => { setEventId(d.event_id); setEventName(d.event_name) })
      .catch(() => {})
  }, [])

  const loadLeaderboard = useCallback(async (id: string) => {
    try {
      const data = await teamsApi.publicLeaderboard(id)
      const scored = data.filter((t: any) => t.score !== null)
      const unscored = data.filter((t: any) => t.score === null)

      // Detect rank changes for flash animation
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

  // Poll every 30s as fallback
  useEffect(() => {
    if (!eventId) return
    const interval = setInterval(() => loadLeaderboard(eventId), 30000)
    return () => clearInterval(interval)
  }, [eventId, loadLeaderboard])

  // Real-time WS updates
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
    <div className="min-h-screen bg-[#0a0f1e] text-white overflow-x-hidden">

      {/* ── Animated background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] bg-purple-600/8 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-10">

        {/* ── Header ── */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-4 shadow-lg shadow-primary/20">
            <Trophy size={30} className="text-primary" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-1">
            <span className="text-white">Live </span>
            <span className="text-primary">Leaderboard</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">{eventName}</p>

          {/* Status bar */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              connected
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
            }`}>
              {connected
                ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping absolute" /><Wifi size={12} /> Live</>
                : <><WifiOff size={12} /> Reconnecting…</>
              }
            </div>
            {lastUpdated && (
              <span className="text-xs text-slate-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading rankings…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-24">
            <Medal size={48} className="text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-semibold">No scores yet</p>
            <p className="text-slate-600 text-sm mt-1">Rankings will appear once judges submit scores</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((team, idx) => {
              const style = RANK_COLORS[team.rank] || null
              const isFlashing = flashIds.has(team.team_id)
              const hasScore = team.score !== null

              return (
                <div
                  key={team.team_id}
                  className={`
                    relative rounded-2xl border p-5 transition-all duration-500
                    ${style
                      ? `bg-gradient-to-r ${style.bg} ${style.border}`
                      : 'bg-white/5 border-white/10'
                    }
                    ${isFlashing ? 'ring-2 ring-primary/60 scale-[1.01]' : ''}
                    hover:bg-white/8 hover:border-white/20
                  `}
                  style={{
                    animationDelay: `${idx * 60}ms`,
                  }}
                >
                  <div className="flex items-center gap-4">

                    {/* Rank badge */}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black
                      ${style ? 'bg-white/10' : 'bg-white/5'}`}>
                      {style ? style.icon : (
                        <span className="text-slate-400 text-base font-bold">#{team.rank}</span>
                      )}
                    </div>

                    {/* Team info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold text-base truncate ${style ? style.text : 'text-white'}`}>
                          {team.team_name}
                        </h3>
                        {isFlashing && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full animate-pulse">
                            <Zap size={9} /> Updated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Users size={11} /> {team.member_count} members</span>
                        <span>{team.judges_count} judge{team.judges_count !== 1 ? 's' : ''}</span>
                      </div>

                      {/* Criteria breakdown bars */}
                      {hasScore && Object.keys(team.score_breakdown).length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {criteria.filter(c => team.score_breakdown[c] !== undefined).map(c => (
                            <div key={c}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <span className="text-slate-500 capitalize">{c}</span>
                                <span className="font-semibold" style={{ color: criteriaColors[c] }}>
                                  {team.score_breakdown[c]?.toFixed(1)}
                                </span>
                              </div>
                              <ScoreBar value={team.score_breakdown[c] || 0} color={criteriaColors[c]} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score */}
                    <div className="flex-shrink-0 text-right">
                      {hasScore ? (
                        <>
                          <div className={`text-3xl font-black tabular-nums ${style ? style.text : 'text-white'}`}>
                            {(team.score as number).toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">/ 10</div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-600 font-semibold">Pending</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-700 mt-10">
          EventCraft · Live Rankings · Updates automatically
        </p>
      </div>
    </div>
  )
}
