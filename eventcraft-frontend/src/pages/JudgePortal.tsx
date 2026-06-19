/**
 * Judge Portal — accessible via a signed JWT link, no account required.
 * URL: /judge/{event_id}?token={jwt}
 */
import { QAChat } from '../components/QAChat'
import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle, ClipboardList, Send, Star, Github, Youtube,
  ExternalLink, Sun, Moon, Bot, Sparkles, BookOpen,
  ChevronDown, ChevronUp, Loader2, Lock,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useAppContext } from '../context/AppContext'
import { useToast } from '../context/ToastAndConfirmContext'
import { OmniAgentSidebar } from '../components/OmniAgentSidebar'
import logoImage from '../assets/logo.png'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const getCriteriaDescription = (criterion: string): string => {
  const norm = criterion.toLowerCase().replace(/[^a-z0-9]/g, '');
  const descriptions: Record<string, string> = {
    innovation: 'Originality and creativity of the solution',
    execution: 'Technical implementation and code quality',
    presentation: 'Clarity of demo and communication',
    impact: 'Real-world potential and scalability',
    pitch: 'Quality and delivery of the final pitch',
    usability: 'User interface design and ease of use',
    technicaldepth: 'Complexity and soundness of the technical solution',
    designpitch: 'Clarity, aesthetics, and delivery of the design presentation',
    codequality: 'Technical implementation and code quality',
  }
  return descriptions[norm] || `Evaluation of ${criterion}`
}

export const JudgePortal: React.FC = () => {
  const { theme, toggleTheme } = useAppContext()
  const toast = useToast()
  const { eventId } = useParams<{ eventId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [portalData, setPortalData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [scoringTeam, setScoringTeam] = useState<any>(null)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<string[]>([])
  const [isAgentOpen, setIsAgentOpen] = useState(false)

  // Evaluation guide state — per team
  const [guides, setGuides] = useState<Record<string, string>>({})
  const [loadingGuides, setLoadingGuides] = useState<Record<string, boolean>>({})
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!eventId || !token) {
      setError('Invalid judge link — missing event or token.')
      setLoading(false)
      return
    }
    fetch(`${BASE_URL}/api/events/${eventId}/evaluations/judge-portal?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Invalid or expired judge link')
        return r.json()
      })
      .then((data) => {
        setPortalData(data)
        const init: Record<string, number> = {}
        ;(data.criteria || []).forEach((c: string) => { init[c.toLowerCase()] = 7 })
        setScores(init)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [eventId, token])

  const openScoring = (team: any) => {
    setScoringTeam(team)
    const init: Record<string, number> = {}
    ;(portalData?.criteria || []).forEach((c: string) => { init[c.toLowerCase()] = 7 })
    setScores(init)
    setNotes('')
  }

  const handleSubmit = async () => {
    if (!scoringTeam || !eventId) return
    setSubmitting(true)
    try {
      const res = await fetch(
        `${BASE_URL}/api/events/${eventId}/evaluations/judge-submit?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_id: scoringTeam.id,
            judge_name: portalData.judge_email.split('@')[0],
            judge_email: portalData.judge_email,
            scores,
            notes: notes || undefined,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Submission failed')
      }
      toast.success(`Score submitted for ${scoringTeam.name}!`)
      setSubmitted((prev) => [...prev, scoringTeam.id])
      setScoringTeam(null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const avg = Object.values(scores).length
    ? (Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length).toFixed(2)
    : '0.00'

  const loadGuide = async (teamId: string) => {
    if (guides[teamId] || loadingGuides[teamId]) return
    setLoadingGuides(prev => ({ ...prev, [teamId]: true }))
    try {
      const res = await fetch(`${BASE_URL}/api/events/${eventId}/evaluations/assessment-guide/${teamId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGuides(prev => ({ ...prev, [teamId]: data.guide }))
    } catch {
      setGuides(prev => ({ ...prev, [teamId]: 'Could not generate guide — please try again.' }))
    } finally {
      setLoadingGuides(prev => ({ ...prev, [teamId]: false }))
    }
  }

  const toggleGuide = (teamId: string) => {
    const nowExpanded = !expandedGuides[teamId]
    setExpandedGuides(prev => ({ ...prev, [teamId]: nowExpanded }))
    if (nowExpanded) loadGuide(teamId)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark:bg-slate-950 flex items-center justify-center transition-colors duration-0">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-slate-400">Loading judge portal...</p>
        </div>
      </div>
    )
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-background dark:bg-slate-950 flex items-center justify-center transition-colors duration-0">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-gray-500 dark:text-slate-400 text-sm">{error || 'Invalid judge link.'}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">Contact the event committee for a new link.</p>
        </div>
      </div>
    )
  }

  const allTeams = portalData.teams || []
  const scoredCount = allTeams.filter((t: any) => t.already_scored || submitted.includes(t.id)).length

  return (
    <div className="min-h-screen bg-[#F5F4F0] dark:bg-slate-950 transition-colors duration-200">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-6 py-4 transition-colors duration-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg overflow-hidden">
              <img src={logoImage} alt="EventCraft" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">EventCraft</div>
              <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-widest font-bold">Judge Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer bg-white dark:bg-slate-900 flex items-center justify-center"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} className="text-yellow-500" />}
            </button>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-slate-400">Signed in as</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{portalData.judge_email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-primary to-orange-400 rounded-2xl p-6 text-white mb-6">
          <p className="text-sm opacity-80 mb-1">Judge Portal</p>
          <h1 className="text-2xl font-bold mb-1">{portalData.event_name}</h1>
          <p className="text-sm opacity-80">{scoredCount} of {allTeams.length} teams scored</p>
          <div className="mt-3 bg-white/20 rounded-lg h-2">
            <div
              className="bg-white h-2 rounded-lg transition-all duration-500"
              style={{ width: `${allTeams.length ? (scoredCount / allTeams.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {portalData?.event_completed && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex items-start gap-3 shadow-sm mb-6">
            <Lock className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" size={18} />
            <div>
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">This event is completed and locked</h4>
              <p className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                All team submissions and evaluation scores are finalized and read-only.
              </p>
            </div>
          </div>
        )}

        {/* Scoring Criteria */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5 mb-6 transition-colors duration-200">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">Scoring Criteria</h2>
          <div className="grid grid-cols-2 gap-3">
            {(portalData.criteria || []).map((c: string) => (
              <div key={c} className="flex items-start gap-2">
                <Star size={14} className="text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{c}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{getCriteriaDescription(c)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Teams */}
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Teams to Evaluate</h2>
        <div className="space-y-4">
          {allTeams.map((team: any) => {
            const isScored = team.already_scored || submitted.includes(team.id)
            return (
              <div
                key={team.id}
                className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-5 transition-all duration-200 hover:shadow-md ${
                  isScored
                    ? 'border-green-200 dark:border-green-900/40 opacity-90'
                    : 'border-gray-100 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3 min-w-0">

                    {/* Team name + scored badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-gray-900 dark:text-white">{team.name}</h3>
                      {isScored && (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle size={11} /> Scored
                        </Badge>
                      )}
                    </div>

                    {/* Members */}
                    <div className="flex flex-wrap gap-1.5">
                      {(team.members || []).map((m: any) => (
                        <div key={m.name} className="flex items-center gap-1 bg-gray-50 dark:bg-slate-800 rounded-lg px-2.5 py-1 border border-gray-100 dark:border-slate-700">
                          <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">{m.name}</span>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">· {m.institution}</span>
                        </div>
                      ))}
                    </div>

                    {/* Project details */}
                    <div className="bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 rounded-xl p-4 space-y-2">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                        {team.project_title || 'Untitled Project'}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                        {team.project_description || 'No project description provided.'}
                      </p>
                      <div className="flex gap-2 flex-wrap pt-1">
                        {team.github_url && (
                          <a href={team.github_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                            <Github size={13} /> GitHub
                          </a>
                        )}
                        {team.video_url && (
                          <a href={team.video_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/40 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                            <Youtube size={13} /> Demo
                          </a>
                        )}
                        {team.presentation_url && (
                          <a href={team.presentation_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900/40 px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors">
                            <ExternalLink size={13} /> Slides
                          </a>
                        )}
                      </div>
                    </div>

                    {/* AI Evaluation Guide */}
                    <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleGuide(team.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen size={14} className="text-primary flex-shrink-0" />
                          <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                            AI Evaluation Guide
                          </span>
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                            Personalized
                          </span>
                        </div>
                        {expandedGuides[team.id]
                          ? <ChevronUp size={14} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                          : <ChevronDown size={14} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        }
                      </button>

                      {expandedGuides[team.id] && (
                        <div className="px-4 py-4 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700">
                          {loadingGuides[team.id] ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                              <Loader2 size={13} className="animate-spin text-primary" />
                              Generating personalized evaluation guide...
                            </div>
                          ) : guides[team.id] ? (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles size={11} /> AI-generated · Based on team composition & skills
                              </p>
                              <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {guides[team.id]}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Q&A Chat */}
                    <div className="mt-1">
                      <QAChat
                        eventId={eventId!}
                        teamId={team.id}
                        senderName={portalData.judge_email}
                        senderRole="judge"
                        disabled={portalData.event_completed === true}
                      />
                    </div>
                  </div>

                  {!isScored && !portalData.event_completed && (
                    <Button variant="primary" size="sm" onClick={() => openScoring(team)} className="flex-shrink-0">
                      <ClipboardList size={14} className="mr-1" />
                      Score
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {scoredCount === allTeams.length && allTeams.length > 0 && (
          <div className="mt-6 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-xl p-5 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-green-800 dark:text-green-400">All teams scored!</p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">
              Thank you for your evaluations. The committee will be notified.
            </p>
          </div>
        )}
      </div>

      {/* Score Modal */}
      <Modal
        isOpen={!!scoringTeam}
        onClose={() => setScoringTeam(null)}
        title={`Score: ${scoringTeam?.name}`}
        maxWidth="max-w-xl"
      >
        {scoringTeam && (
          <div className="space-y-5">
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Members</p>
              <div className="flex flex-wrap gap-2">
                {(scoringTeam.members || []).map((m: any) => (
                  <span key={m.name} className="text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded px-2 py-1 text-gray-700 dark:text-slate-200">
                    {m.name} · {m.institution}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20 rounded-xl p-4 space-y-2">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">{scoringTeam.project_title || 'Untitled Project'}</h4>
              <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                {scoringTeam.project_description || 'No project description provided.'}
              </p>
              <div className="flex gap-2 flex-wrap pt-1">
                {scoringTeam.github_url && (
                  <a href={scoringTeam.github_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    <Github size={13} /> GitHub
                  </a>
                )}
                {scoringTeam.video_url && (
                  <a href={scoringTeam.video_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/40 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                    <Youtube size={13} /> Demo
                  </a>
                )}
                {scoringTeam.presentation_url && (
                  <a href={scoringTeam.presentation_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900/40 px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors">
                    <ExternalLink size={13} /> Slides
                  </a>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Scoring Criteria</p>
                <span className="text-sm font-bold text-primary">Avg: {avg}/10</span>
              </div>
              <div className="space-y-4">
                {(portalData.criteria || []).map((criterion: string) => {
                  const key = criterion.toLowerCase()
                  const val = scores[key] ?? 7
                  return (
                    <div key={criterion}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{criterion}</span>
                          <span className="text-xs text-gray-400 dark:text-slate-500">{getCriteriaDescription(criterion)}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 dark:text-white w-8 text-right">{val}</span>
                      </div>
                      <input
                        type="range" min={0} max={10} step={0.5} value={val}
                        disabled={portalData.event_completed}
                        onChange={(e) => setScores({ ...scores, [key]: parseFloat(e.target.value) })}
                        className="w-full"
                        style={{ background: `linear-gradient(to right, #E8450A ${val * 10}%, #e5e7eb ${val * 10}%)` }}
                      />
                      <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                        <span>0</span><span>5</span><span>10</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={portalData.event_completed}
                rows={3}
                className="w-full border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
                placeholder="Additional observations..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setScoringTeam(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting || portalData.event_completed}>
                <Send size={14} />
                {submitting ? 'Submitting...' : 'Submit Score'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Floating AI Companion */}
      {eventId && token && (
        <>
          <button
            onClick={() => setIsAgentOpen(!isAgentOpen)}
            className="fixed bottom-6 right-6 z-40 p-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all cursor-pointer flex items-center justify-center border border-white/10"
          >
            <div className="relative">
              <Bot size={22} className="animate-pulse" />
              <Sparkles size={11} className="absolute -top-1.5 -right-1.5 text-yellow-300 animate-bounce" />
            </div>
          </button>
          <OmniAgentSidebar
            eventId={eventId}
            role="judge"
            token={token}
            isOpen={isAgentOpen}
            onClose={() => setIsAgentOpen(false)}
          />
        </>
      )}
    </div>
  )
}
