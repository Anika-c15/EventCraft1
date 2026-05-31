/**
 * Judge Portal — accessible via a signed JWT link, no account required.
 * URL: /judge/{event_id}?token={jwt}
 *
 * Judges can:
 * - See all teams assigned to them
 * - Submit scores for each team
 * - See which teams they've already scored
 */
import { QAChat } from '../components/QAChat'
import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle, ClipboardList, Send, Star, Github, Youtube, ExternalLink, Sun, Moon } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useAppContext } from '../context/AppContext'


const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const CRITERIA_DESCRIPTIONS: Record<string, string> = {
  Innovation: 'Originality and creativity of the solution',
  Execution: 'Technical implementation and code quality',
  Presentation: 'Clarity of demo and communication',
  Impact: 'Real-world potential and scalability',
}

export const JudgePortal: React.FC = () => {
  const { theme, toggleTheme } = useAppContext()
  const { eventId } = useParams<{ eventId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [portalData, setPortalData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Score modal state
  const [scoringTeam, setScoringTeam] = useState<any>(null)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<string[]>([])

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
        // Init scores
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
      setSubmitted((prev) => [...prev, scoringTeam.id])
      setScoringTeam(null)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const avg = Object.values(scores).length
    ? (Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length).toFixed(2)
    : '0.00'

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading judge portal...</p>
        </div>
      </div>
    )
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">{error || 'Invalid judge link.'}</p>
          <p className="text-xs text-gray-400 mt-2">Contact the event committee for a new link.</p>
        </div>
      </div>
    )
  }

  const allTeams = portalData.teams || []
  const scoredCount = allTeams.filter((t: any) => t.already_scored || submitted.includes(t.id)).length

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 transition-colors duration-200">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-6 py-4 transition-colors duration-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">EC</span>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">EventCraft</div>
              <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-widest font-bold">Judge Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer bg-white dark:bg-slate-900 flex items-center justify-center shadow-sm"
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
        {/* Welcome */}
        <div className="bg-gradient-to-r from-primary to-orange-400 rounded-2xl p-6 text-white mb-6">
          <p className="text-sm opacity-80 mb-1">Judge Portal</p>
          <h1 className="text-2xl font-bold mb-1">{portalData.event_name}</h1>
          <p className="text-sm opacity-80">
            {scoredCount} of {allTeams.length} teams scored
          </p>
          <div className="mt-3 bg-white/20 rounded-lg h-2">
            <div
              className="bg-white h-2 rounded-lg transition-all"
              style={{ width: `${allTeams.length ? (scoredCount / allTeams.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Criteria reminder */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Scoring Criteria</h2>
          <div className="grid grid-cols-2 gap-3">
            {(portalData.criteria || []).map((c: string) => (
              <div key={c} className="flex items-start gap-2">
                <Star size={14} className="text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{c}</p>
                  <p className="text-xs text-gray-500">
                    {CRITERIA_DESCRIPTIONS[c] || 'Score 0–10'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Teams */}
        <h2 className="text-base font-semibold text-gray-900 mb-3">Teams to Evaluate</h2>
        <div className="space-y-3">
          {allTeams.map((team: any) => {
            const isScored = team.already_scored || submitted.includes(team.id)
            return (
              <div
                key={team.id}
                className={`bg-white rounded-xl border shadow-sm p-5 transition-all hover:shadow-md ${
                  isScored ? 'border-green-200 opacity-90' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-gray-900">{team.name}</h3>
                      {isScored && (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle size={11} />
                          Scored
                        </Badge>
                      )}
                    </div>

                    {/* Team Members */}
                    <div className="flex flex-wrap gap-1.5">
                      {(team.members || []).map((m: any) => (
                        <div key={m.name} className="flex items-center gap-1 bg-gray-50 rounded-lg px-2.5 py-1 border border-gray-100">
                          <span className="text-xs font-semibold text-gray-700">{m.name}</span>
                          <span className="text-[10px] text-gray-400">· {m.institution}</span>
                        </div>
                      ))}
                    </div>

                    {/* Project Submission Details */}
                    <div className="bg-orange-50/30 border border-orange-100/50 rounded-xl p-4 mt-2 space-y-2">
                      <h4 className="font-bold text-sm text-gray-900">{team.project_title || 'Untitled Project'}</h4>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {team.project_description || 'No project description provided.'}
                      </p>
                      
                      {/* Submission Links */}
                      <div className="flex gap-2 flex-wrap pt-1">
                        {team.github_url ? (
                          <a href={team.github_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                            <Github size={13} /> GitHub Repository
                          </a>
                        ) : null}
                        {team.video_url ? (
                          <a href={team.video_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 bg-white border border-red-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-50 transition-colors">
                            <Youtube size={13} /> Video Demo
                          </a>
                        ) : null}
                        {team.presentation_url ? (
                          <a href={team.presentation_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-indigo-50 transition-colors">
                            <ExternalLink size={13} /> Presentation Slides
                          </a>
                        ) : null}
                      </div>
                    </div>

                    {/* Q&A Chat */}
                    <div className="mt-3">
                      <QAChat
                        eventId={eventId!}
                        teamId={team.id}
                        senderName={portalData.judge_email}
                        senderRole="judge"
                      />
                    </div>
                  </div>

                 

                  {!isScored && (
                    <Button variant="primary" size="sm" onClick={() => openScoring(team)} className="flex-shrink-0">
                      <ClipboardList size={14} className="mr-1" />
                      Score Project
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {scoredCount === allTeams.length && allTeams.length > 0 && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-green-800">All teams scored!</p>
            <p className="text-xs text-green-600 mt-1">
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
            {/* Team members */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Members</p>
              <div className="flex flex-wrap gap-2">
                {(scoringTeam.members || []).map((m: any) => (
                  <span key={m.name} className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
                    {m.name} · {m.institution}
                  </span>
                ))}
              </div>
            </div>

            {/* Project Submission */}
            <div className="bg-orange-50/40 border border-orange-100/50 rounded-xl p-4 space-y-2">
              <h4 className="font-bold text-sm text-gray-900">{scoringTeam.project_title || 'Untitled Project'}</h4>
              <p className="text-xs text-gray-600 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                {scoringTeam.project_description || 'No project description provided.'}
              </p>
              <div className="flex gap-2 flex-wrap pt-1">
                {scoringTeam.github_url && (
                  <a href={scoringTeam.github_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                    <Github size={13} /> GitHub Repository
                  </a>
                )}
                {scoringTeam.video_url && (
                  <a href={scoringTeam.video_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 bg-white border border-red-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-50 transition-colors">
                    <Youtube size={13} /> Video Demo
                  </a>
                )}
                {scoringTeam.presentation_url && (
                  <a href={scoringTeam.presentation_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-indigo-50 transition-colors">
                    <ExternalLink size={13} /> Presentation Slides
                  </a>
                )}
              </div>
            </div>

            {/* Scoring sliders */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Scoring Criteria</p>
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
                          <span className="text-sm font-medium text-gray-700">{criterion}</span>
                          <span className="text-xs text-gray-400">
                            {CRITERIA_DESCRIPTIONS[criterion] || ''}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 w-8 text-right">{val}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={val}
                        onChange={(e) => setScores({ ...scores, [key]: parseFloat(e.target.value) })}
                        className="w-full"
                        style={{
                          background: `linear-gradient(to right, #E8450A ${val * 10}%, #e5e7eb ${val * 10}%)`,
                        }}
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                        <span>0</span><span>5</span><span>10</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Additional observations..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setScoringTeam(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                <Send size={14} />
                {submitting ? 'Submitting...' : 'Submit Score'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
