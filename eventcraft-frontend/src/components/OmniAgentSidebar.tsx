import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Send, Bot, User, Loader2, Sparkles, CheckCircle,
  AlertCircle, Users, BarChart2, ChevronRight, GripHorizontal, Minimize2
} from 'lucide-react'
import { omniAgentApi } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  action_result?: ActionResult | null
}

interface ActionResult {
  success: boolean
  action?: string
  message?: string
  error?: string
  teams?: Array<{ name: string; id: string; member_count: number }>
  scores?: Array<{
    team_name: string
    judge_name: string
    judge_email: string
    average: number
    scores: Record<string, number>
    notes: string
    is_anomaly: boolean
  }>
  teams_formed?: number
  from_stage?: string
  to_stage?: string
}

interface OmniAgentSidebarProps {
  eventId: string
  role: 'admin' | 'judge' | 'participant'
  token?: string
  isOpen: boolean
  onClose: () => void
}

// ── Action Result Cards ───────────────────────────────────────────────────────

const ActionResultCard: React.FC<{ result: ActionResult }> = ({ result }) => {
  if (!result.success) {
    return (
      <div className="mt-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 flex items-start gap-2">
        <AlertCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-red-700 dark:text-red-300">{result.error}</p>
      </div>
    )
  }

  if (result.action === 'form_teams' && result.teams) {
    return (
      <div className="mt-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30">
        <div className="flex items-center gap-1.5 mb-2">
          <Users size={12} className="text-emerald-600" />
          <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
            {result.teams_formed} Teams Proposed
          </span>
        </div>
        <div className="space-y-1">
          {result.teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 border border-emerald-100 dark:border-emerald-900/30"
            >
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{team.name}</span>
              <span className="text-[10px] text-gray-400">{team.member_count} members</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
          ↗ Visit Approvals page to finalize.
        </p>
      </div>
    )
  }

  if (result.action === 'show_scores' && result.scores) {
    if (result.scores.length === 0) {
      return (
        <div className="mt-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30">
          <p className="text-xs text-blue-700 dark:text-blue-300">No evaluation scores submitted yet.</p>
        </div>
      )
    }
    // Group by team
    const byTeam: Record<string, typeof result.scores> = {}
    result.scores.forEach((s) => {
      if (!byTeam[s.team_name]) byTeam[s.team_name] = []
      byTeam[s.team_name].push(s)
    })
    return (
      <div className="mt-2 space-y-2">
        {Object.entries(byTeam).map(([teamName, entries]) => (
          <div
            key={teamName}
            className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30"
          >
            <p className="text-[11px] font-bold text-indigo-800 dark:text-indigo-200 mb-1.5 flex items-center gap-1">
              <BarChart2 size={11} /> {teamName}
            </p>
            {entries.map((e, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 mb-1 border border-indigo-100 dark:border-indigo-900/30 last:mb-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                    {e.judge_name}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      e.is_anomaly
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    }`}
                  >
                    {e.average.toFixed(1)}/10{e.is_anomaly ? ' ⚠️' : ''}
                  </span>
                </div>
                {e.notes && (
                  <p className="text-[9px] text-gray-400 italic mt-0.5">"{e.notes}"</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (result.action === 'advance_stage') {
    return (
      <div className="mt-2 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 flex items-start gap-2">
        <ChevronRight size={13} className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-orange-800 dark:text-orange-300">
            {result.from_stage} → {result.to_stage}
          </p>
          <p className="text-[10px] text-orange-600 dark:text-orange-400">Stage advanced successfully</p>
        </div>
      </div>
    )
  }

  if (result.action === 'approve_formation') {
    return (
      <div className="mt-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 flex items-start gap-2">
        <CheckCircle size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          Team formation approved. All proposed teams are now active.
        </p>
      </div>
    )
  }

  return null
}

// ── Main Draggable Component ──────────────────────────────────────────────────

const POPUP_W = 390
const POPUP_H = 580

export const OmniAgentSidebar: React.FC<OmniAgentSidebarProps> = ({
  eventId,
  role,
  token,
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [minimized, setMinimized] = useState(false)

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const popupRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Initialise position (bottom-right) once on first open
  useEffect(() => {
    if (isOpen && pos === null) {
      setPos({
        x: window.innerWidth - POPUP_W - 24,
        y: window.innerHeight - POPUP_H - 96,
      })
    }
  }, [isOpen, pos])

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return // don't drag on close/minimize
    dragging.current = true
    const rect = popupRef.current!.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const newX = Math.min(Math.max(0, e.clientX - dragOffset.current.x), window.innerWidth - POPUP_W)
      const newY = Math.min(Math.max(0, e.clientY - dragOffset.current.y), window.innerHeight - 80)
      setPos({ x: newX, y: newY })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Touch drag support ───────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    const rect = popupRef.current!.getBoundingClientRect()
    const touch = e.touches[0]
    dragOffset.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }, [])

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return
      const touch = e.touches[0]
      const newX = Math.min(Math.max(0, touch.clientX - dragOffset.current.x), window.innerWidth - POPUP_W)
      const newY = Math.min(Math.max(0, touch.clientY - dragOffset.current.y), window.innerHeight - 80)
      setPos({ x: newX, y: newY })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  // ── Data ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && eventId) {
      setHistoryLoading(true)
      omniAgentApi.history(eventId, token)
        .then((data) => setMessages(data))
        .catch((err) => console.error('Failed to load agent history:', err))
        .finally(() => setHistoryLoading(false))
    }
  }, [isOpen, eventId, token])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading || !eventId) return
    const userMsg = textToSend
    setInput('')
    setLoading(true)
    setMinimized(false) // expand if minimized when sending

    const tempUserMsg: Message = {
      id: `temp-u-${Date.now()}`,
      role: 'user',
      content: userMsg,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const res = await omniAgentApi.chat(eventId, userMsg, token)
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { id: `u-${Date.now()}`, role: 'user', content: userMsg, created_at: new Date().toISOString() },
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.message.content,
          created_at: res.message.created_at,
          action_result: res.action_result || null,
        },
      ])
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, something went wrong: ${err.message || 'Unknown error'}. Please try again.`,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const getSuggestions = () => {
    if (role === 'admin') {
      return ['Form teams now', 'Show judge scores', 'Advance to next stage', 'Approve team formation']
    } else if (role === 'judge') {
      return ['Explain criteria rubrics', 'Show my evaluations', 'Summarize team submissions']
    } else {
      return ['Critique our project pitch', 'Brainstorm AI features', 'How do we score better?']
    }
  }

  if (!isOpen || pos === null) return null

  const currentHeight = minimized ? 'auto' : POPUP_H

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: POPUP_W,
        height: currentHeight,
        zIndex: 9999,
      }}
      className="flex flex-col rounded-2xl shadow-2xl shadow-black/25 dark:shadow-black/60 overflow-hidden border border-slate-200/60 dark:border-slate-700/50 bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl"
    >

      {/* ── Drag Handle / Header ─────────────────────────────────────────────── */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="flex items-center justify-between px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-r from-orange-500/10 to-red-500/8 dark:from-orange-900/25 dark:to-red-900/20 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2.5">
          {/* Drag grip dots */}
          <GripHorizontal size={14} className="text-slate-400 flex-shrink-0" />
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-red-500 flex items-center justify-center shadow-md shadow-orange-500/20">
            <Bot size={15} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              {role === 'admin' ? 'EventCraft Copilot' : role === 'judge' ? 'Judge Assistant' : 'Project Mentor'}
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </h3>
            <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
              {role === 'admin' ? '⚡ Full Command Access' : role === 'judge' ? '📋 Evaluation Mode' : '🎓 Mentor Mode'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Minimize / Expand */}
          <button
            onClick={() => setMinimized((m) => !m)}
            className="p-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Body (hidden when minimized) ────────────────────────────────────── */}
      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {historyLoading ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-12">
                <Loader2 className="animate-spin text-orange-500" size={22} />
                <p className="text-xs text-slate-400 font-medium">Loading session...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-4 text-center space-y-3 py-10">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 flex items-center justify-center">
                  <Sparkles size={22} className="animate-bounce text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {role === 'admin'
                      ? 'Copilot Ready'
                      : role === 'judge'
                      ? 'Assistant Ready'
                      : 'Your Mentor is Here'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
                    {role === 'admin'
                      ? 'I can form teams, show scores, advance stages, approve formations, or answer any event question.'
                      : role === 'judge'
                      ? 'Ask me about rubrics, team submissions, or recall your own scoring notes.'
                      : "Tell me about your project — I'll help you build, refine, and pitch it better."}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5 ${
                      msg.role === 'user'
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        : 'bg-gradient-to-tr from-orange-500 to-red-500 text-white'
                    }`}
                  >
                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <div
                    className={`max-w-[78%] flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-tr-sm'
                          : 'bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                      }`}
                    >
                      <div className="whitespace-pre-line">{msg.content}</div>
                    </div>
                    {msg.role === 'assistant' && msg.action_result && (
                      <div className="w-full">
                        <ActionResultCard result={msg.action_result} />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-orange-500 to-red-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Bot size={12} />
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm flex items-center gap-2">
                  <Loader2 className="animate-spin text-orange-500" size={12} />
                  <span className="text-xs text-slate-400 font-semibold">
                    {role === 'admin' ? 'Executing...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestion Pills */}
          {!loading && !historyLoading && (
            <div className="px-3 py-2 flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/60 flex-shrink-0">
              {getSuggestions().map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(sug)}
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-500 rounded-full px-2.5 py-1 cursor-pointer transition-all shadow-sm hover:shadow-md"
                >
                  ✨ {sug}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend(input)
            }}
            className="px-3 py-2.5 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-950/40 flex items-center gap-2 flex-shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                loading
                  ? role === 'admin' ? 'Executing command...' : 'AI is thinking...'
                  : role === 'admin'
                  ? 'Command or question...'
                  : 'Ask your AI companion...'
              }
              disabled={loading || historyLoading}
              className="flex-1 border rounded-xl px-3.5 py-2 text-xs bg-slate-50/70 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all disabled:opacity-50 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={loading || historyLoading || !input.trim()}
              className="p-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl cursor-pointer disabled:opacity-40 transition-all active:scale-95 shadow-md shadow-orange-500/15"
            >
              <Send size={13} />
            </button>
          </form>
        </>
      )}
    </div>
  )
}
