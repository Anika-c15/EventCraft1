
import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  User, Mail, Building, Users, Calendar,
  ArrowLeft, Award, CheckCircle, Clock, Star,
  Github, Youtube, Lock, Send, BarChart2,
  Loader2, Home, Folder, Sun, Moon, Bell, Trophy, Edit2, Bot, Sparkles,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { participantsApi, peerReviewApi, teamsApi } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'
import logoImage from '../assets/logo.png'
import { useAppContext } from '../context/AppContext'
import { QAChat, QANotificationPopup } from '../components/QAChat'
import { OmniAgentSidebar } from '../components/OmniAgentSidebar'

const levelVariant = (level: string) => {
  switch (level) {
    case 'Beginner': return 'info'
    case 'Intermediate': return 'success'
    case 'Advanced': return 'warning'
    case 'Expert': return 'danger'
    default: return 'default'
  }
}

// ── Peer Rating Slider Card ────────────────────────────────────────────────────
interface ShowroomCardProps {
  team: any
  eventId: string
  token: string
  onVoteSubmitted: (teamId: string, score: number) => void
  votingClosed?: boolean
}

const ShowroomCard: React.FC<ShowroomCardProps> = ({ team, eventId, token, onVoteSubmitted, votingClosed = false }) => {
  const [sliderVal, setSliderVal] = useState<number>(team.my_vote ?? 5)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<boolean>(team.my_vote !== null && team.my_vote !== undefined)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      await peerReviewApi.submitVote(eventId, token, team.id, sliderVal)
      setSubmitted(true)
      onVoteSubmitted(team.id, sliderVal)
    } catch (e: any) {
      setError(e.message || 'Failed to submit vote')
    } finally {
      setSubmitting(false)
    }
  }

  const sliderPct = (sliderVal / 10) * 100

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${submitted ? 'border-green-200' : 'border-gray-100'}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm text-gray-900">{team.project_title || team.name}</h4>
          <p className="text-[10px] text-gray-500 mt-0.5">{team.project_title ? `Team: ${team.name}` : `${team.member_count} members`}</p>
        </div>
        {submitted && (
          <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle size={11} /> Voted
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Project Description / Challenge snippet */}
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
          {team.project_description || team.challenge || 'No project description provided.'}
        </p>

        {/* Links */}
        <div className="flex gap-2 flex-wrap">
          {team.github_link ? (
            <a href={team.github_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900 bg-gray-100 px-2 py-1 rounded-md hover:bg-gray-200 transition-colors">
              <Github size={11} /> GitHub
            </a>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
              <Github size={11} /> No GitHub
            </span>
          )}
          {team.demo_link ? (
            <a href={team.demo_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 bg-red-50 px-2 py-1 rounded-md hover:bg-red-100 transition-colors">
              <Youtube size={11} /> Demo
            </a>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
              <Youtube size={11} /> No Demo
            </span>
          )}
          {team.presentation_url ? (
            <a href={team.presentation_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors">
              <Send size={11} /> Slides
            </a>
          ) : null}
        </div>

        {/* Rating slider */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Your Rating</span>
            <span className="text-sm font-extrabold text-primary">{sliderVal.toFixed(1)}<span className="text-xs text-gray-400 font-normal"> / 10</span></span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={sliderVal}
              disabled={submitted || votingClosed}
              onChange={(e) => setSliderVal(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:cursor-default"
              style={{
                background: (submitted || votingClosed)
                  ? `linear-gradient(to right, #10b981 ${sliderPct}%, #e5e7eb ${sliderPct}%)`
                  : `linear-gradient(to right, #E8450A ${sliderPct}%, #e5e7eb ${sliderPct}%)`,
              }}
              id={`slider-${team.id}`}
            />
            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
              <span>0 — Poor</span><span>5 — Good</span><span>10 — Excellent</span>
            </div>
          </div>
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        {votingClosed ? (
          <div className="text-center text-xs text-gray-500 font-medium bg-gray-50 py-2 rounded-lg mt-1 border border-gray-200">
            🔒 Peer voting is closed
          </div>
        ) : !submitted ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full mt-1 flex items-center justify-center gap-1.5 bg-primary text-white text-xs font-semibold py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {submitting ? 'Submitting…' : 'Submit Rating'}
          </button>
        ) : (
          <div className="text-center text-xs text-green-700 font-medium bg-green-50 py-2 rounded-lg mt-1">
            ✓ Rating submitted — {submitted && team.my_vote !== undefined ? `${team.my_vote}/10` : `${sliderVal}/10`}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Portal ────────────────────────────────────────────────────────────────
export const ParticipantPortal: React.FC = () => {
  const { theme, toggleTheme } = useAppContext()
  const { id: token } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const eventId = searchParams.get('event')

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showroom, setShowroom] = useState<any[]>([])

  // Tabs state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'showroom' | 'submission'>('dashboard')

  // Submission Hub Form State
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [presentationUrl, setPresentationUrl] = useState('')
  const [submissionSaving, setSubmissionSaving] = useState(false)
  const [submissionSuccess, setSubmissionSuccess] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [qaNotification, setQaNotification] = useState<any>(null)
  const [isAgentOpen, setIsAgentOpen] = useState(false)

  // Team rename state
  const [showRenameForm, setShowRenameForm] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [renameSuccess, setRenameSuccess] = useState(false)

  const loadPortal = useCallback(() => {
    if (!token || !eventId) {
      setError('Invalid portal link — missing event or token.')
      setLoading(false)
      return
    }
    participantsApi.portal(eventId, token)
      .then((d) => {
        setData(d)
        if (d.showroom_teams) setShowroom(d.showroom_teams)
      })
      .catch((e) => setError(e.message || 'Could not load portal'))
      .finally(() => setLoading(false))
  }, [token, eventId])

  const handleWsMessage = useCallback((msg: any) => {
    if (
      msg.type === 'dashboard_update' ||
      msg.type === 'stage_advanced' ||
      msg.type === 'score_locked' ||
      msg.type === 'score_submitted' ||
      msg.type === 'anomaly_flagged'
    ) {
      loadPortal()
    }
  }, [loadPortal])

  useWebSocket(eventId, handleWsMessage, token)

  useEffect(() => { loadPortal() }, [loadPortal])

  // Sync submission inputs when data is loaded
  useEffect(() => {
    if (data && data.team) {
      setProjectTitle(data.team.project_title || '')
      setProjectDescription(data.team.project_description || '')
      setGithubUrl(data.team.github_url || '')
      setVideoUrl(data.team.video_url || '')
      setPresentationUrl(data.team.presentation_url || '')
    }
  }, [data])

  const handleVoteSubmitted = (teamId: string, score: number) => {
    setShowroom(prev => prev.map(t => t.id === teamId ? { ...t, my_vote: score } : t))
  }

  const handleRenameTeam = async () => {
    if (!token || !newTeamName.trim()) return
    setRenameLoading(true)
    setRenameError('')
    try {
      const res = await teamsApi.renameTeam(token, newTeamName.trim())
      // Update local data so name reflects immediately
      setData((prev: any) => ({
        ...prev,
        team: { ...prev.team, name: res.name, name_locked: true },
      }))
      setRenameSuccess(true)
      setShowRenameForm(false)
      setNewTeamName('')
    } catch (err: any) {
      setRenameError(err.message || 'Failed to rename team')
    } finally {
      setRenameLoading(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!token) return
    setSubmissionSaving(true)
    setSubmissionError('')
    setSubmissionSuccess('')
    try {
      const res = await teamsApi.saveSubmissionDraft({
        project_title: projectTitle,
        project_description: projectDescription,
        github_url: githubUrl,
        video_url: videoUrl,
        presentation_url: presentationUrl,
        token,
      })
      setData((prev: any) => ({
        ...prev,
        team: res.team,
      }))
      setSubmissionSuccess('Draft saved successfully!')
    } catch (err: any) {
      setSubmissionError(err.message || 'Failed to save draft')
    } finally {
      setSubmissionSaving(false)
    }
  }

  const handleSubmitFinal = async () => {
    if (!token) return
    setSubmissionSaving(true)
    setSubmissionError('')
    setSubmissionSuccess('')
    try {
      const res = await teamsApi.submitFinalSubmission({
        project_title: projectTitle,
        project_description: projectDescription,
        github_url: githubUrl,
        video_url: videoUrl,
        presentation_url: presentationUrl,
        token,
      })
      setData((prev: any) => ({
        ...prev,
        team: res.team,
      }))
      setSubmissionSuccess('🎉 Submission Complete! Your project has been securely locked.')
      setShowConfirmModal(false)
    } catch (err: any) {
      setSubmissionError(err.message || 'Failed to submit project')
    } finally {
      setSubmissionSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={28} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Portal Not Found</h2>
          <p className="text-gray-500 mb-4 text-sm">{error || 'Invalid portal link.'}</p>
          <Link to="/" className="text-primary font-medium hover:underline flex items-center gap-1 justify-center">
            <ArrowLeft size={14} />Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const {
    participant, team, current_stage, current_stage_description, key_dates, event_name,
    progression_eligible, scoring_phase_active, submission_portal_active,
    results_phase_active,
  } = data

  const isPhase3 = results_phase_active ?? false
  const isPhase2 = !isPhase3 && (scoring_phase_active ?? false)
  const isPhase1 = !isPhase2 && !isPhase3

  // Rename window: open only during Team Formation stage, locked from Evaluation onwards
  const currentStageLower = (current_stage || '').toLowerCase()
  const isTeamFormationPhase = currentStageLower.includes('team') || currentStageLower.includes('formation')
  const isEvalOrLater = isPhase2 || isPhase3 || currentStageLower.includes('eval') || currentStageLower.includes('result') || currentStageLower.includes('progression')
  const canRenameTeam = isTeamFormationPhase && !isEvalOrLater

  const teammates = (team?.members || []).filter((m: any) => m.id !== participant.id)
  const votedCount = showroom.filter(t => t.my_vote !== null && t.my_vote !== undefined).length
  const isClosed = isPhase3

  return (
    <div className="h-screen flex overflow-hidden bg-[#F9F8F6] dark:bg-slate-955 dark:bg-slate-950 transition-colors duration-200">
      {/* sticky left-side navigation sidebar panel */}
      <div className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col justify-between p-4 flex-shrink-0 transition-colors duration-200">
        <div className="space-y-6">
          {/* Brand Logo & Profile Card */}
          <div className="space-y-4">
            {/* EventCraft logo block */}
            <div className="flex items-center gap-2.5 px-1 py-1">

              <div className="flex-shrink-0 w-9 h-9 rounded-lg overflow-hidden">
                <img src={logoImage} alt="EventCraft" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="text-xs font-black text-gray-900 dark:text-white tracking-wider">EventCraft</div>
                <div className="text-[9px] text-gray-400 dark:text-slate-500 font-semibold uppercase tracking-widest">Participant Portal</div>
              </div>
            </div>

            {/* Compact Micro-Profile Card */}
            <div className="bg-gray-50 dark:bg-slate-950/40 rounded-xl p-3 border border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-primary/10 text-primary dark:text-primary-400 font-bold rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                  {participant.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">{participant.name}</div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-400 truncate">{participant.institution || 'No Institution'}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-200/60 dark:border-slate-800/60">
                <span className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 uppercase">Status</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 px-2 py-0.5 rounded-full border border-green-200/50 dark:border-green-900/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Active
                </span>
              </div>
            </div>
          </div>

          {/* Center Navigation Group */}
          <nav className="space-y-1">
            <button
              id="dashboard-tab-button"
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'dashboard'
                ? 'bg-primary/10 text-primary dark:text-primary-400 dark:bg-primary/20 font-bold shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200'
                }`}
            >
              <Home size={14} />
              <span>Dashboard Overview</span>
            </button>

            <button
              id="showroom-tab-button"
              disabled={isPhase1}
              onClick={() => !isPhase1 && setActiveTab('showroom')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-all ${isPhase1
                ? 'opacity-50 cursor-not-allowed text-gray-400'
                : activeTab === 'showroom'
                  ? 'bg-primary/10 text-primary dark:text-primary-400 dark:bg-primary/20 font-bold shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart2 size={14} />
                <span>Project Showroom & Voting</span>
              </div>
              {isPhase1 && <Lock size={12} className="text-gray-400" />}
            </button>

            <button
              id="submission-hub-tab-button"
              onClick={() => setActiveTab('submission')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'submission'
                ? 'bg-primary/10 text-primary dark:text-primary-400 dark:bg-primary/20 font-bold shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200'
                }`}
            >
              <Folder size={14} />
              <span>My Submission Hub</span>
            </button>
          </nav>

          {/* Live Mini Leaderboard Widget — Phase Gated */}
          {/* Phase 1: Hidden entirely */}
          {/* Phase 2: Locked & Obfuscated */}
          {isPhase2 && (
            <div className="pt-4 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  🏆 Top Standings <Lock size={10} className="text-gray-400" />
                </span>
                <span className="text-[9px] font-semibold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
                  Fluctuating
                </span>
              </div>
              <div className="space-y-1 opacity-60 select-none pointer-events-none filter blur-[1.5px]">
                {[1, 2, 3].map((rank) => (
                  <div
                    key={rank}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border border-transparent text-gray-400"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[10px] text-gray-400 font-bold w-3">
                        {rank}
                      </span>
                      <span>Team ••••••••</span>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                      Score: 9.••
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Phase 3: Fully Revealed */}
          {isPhase3 && data?.leaderboard && data.leaderboard.length > 0 && (
            <div className="pt-4 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  🏆 Top Standings
                </span>
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
              </div>
              <div className="space-y-1">
                {data.leaderboard.slice(0, 5).map((item: any) => {
                  const isMyTeam = team && item.team_id === team.id
                  return (
                    <div
                      key={item.team_id}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all duration-200 ${isMyTeam
                        ? 'border border-primary/30 bg-orange-50/30 shadow-[0_0_8px_rgba(232,69,10,0.1)] text-gray-900 font-semibold'
                        : 'border border-transparent hover:bg-gray-50 text-gray-500 hover:text-gray-900'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[10px] text-gray-400 font-bold w-3 flex-shrink-0">
                          {item.rank}
                        </span>
                        <span className="truncate">{item.team_name}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${isMyTeam
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-600'
                        }`}>
                        {item.score !== null && item.score !== undefined ? item.score.toFixed(2) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200 transition-all w-full cursor-pointer mt-auto border border-gray-100 hover:border-gray-250 dark:border-slate-800 rounded-lg py-2"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? (
            <>
              <Moon size={14} className="text-gray-400 dark:text-slate-500" />
              <span>Dark Mode</span>
            </>
          ) : (
            <>
              <Sun size={14} className="text-yellow-500" />
              <span>Light Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Main Panel Content Area Workspace */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-primary to-orange-400 rounded-2xl p-6 text-white">
              <p className="text-sm font-medium opacity-80 mb-1">Welcome back,</p>
              <h1 className="text-2xl font-bold mb-1">{participant.name}</h1>
              <p className="text-sm opacity-80">{participant.email}</p>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                  <span className="text-sm font-medium">{event_name} — Active</span>
                </div>
                {scoring_phase_active && showroom.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-0.5">
                    <BarChart2 size={12} />
                    <span className="text-xs font-semibold">
                      Peer Voting Open · {votedCount}/{showroom.length} rated
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Upper Dashboard Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {/* Column 1 (Left) */}
              <div className="md:col-span-1 flex flex-col gap-6">
                {/* Profile */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <span className="text-primary font-bold text-lg">{participant.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{participant.name}</p>
                      <Badge variant={levelVariant(participant.level) as any} className="mt-0.5">
                        {participant.level}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{participant.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building size={14} className="text-gray-400 flex-shrink-0" />
                      <span>{participant.institution || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award size={14} className="text-gray-400 flex-shrink-0" />
                      <span>{participant.level} Level</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(participant.skills || []).map((skill: string) => (
                        <span key={skill} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-500" />
                    <span className="text-sm font-semibold text-green-700">{participant.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Registered {new Date(participant.registered_at).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>

                {/* Progression */}
                {progression_eligible && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Star size={18} className="text-green-600" />
                      <p className="text-sm font-bold text-green-800">Progression Eligible!</p>
                    </div>
                    <p className="text-xs text-green-700">
                      Your team has qualified for the next round. Await official confirmation from the committee.
                    </p>
                  </div>
                )}
              </div>

              {/* Column 2 & 3 (Right) */}
              <div className="md:col-span-2 flex flex-col gap-6">
                {/* Current Stage */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <h2 className="font-semibold text-gray-900">Current Event Stage</h2>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                    <p className="text-sm font-bold text-primary">{current_stage || 'Participant Intake'}</p>
                    <p className="text-xs text-orange-700 mt-1">
                      {current_stage_description || (
                        current_stage === 'Team Formation'
                          ? "Teams are being formed. You'll receive an email once your team assignment is confirmed."
                          : current_stage === 'Evaluation'
                            ? 'Evaluation is underway. Judges are reviewing all team submissions.'
                            : current_stage === 'Results'
                              ? 'Results are being compiled. Final rankings will be announced soon.'
                              : current_stage === 'Progression'
                                ? 'Qualifying teams are being notified for the next round.'
                                : scoring_phase_active
                                  ? 'Scoring phase active — peer voting and judge evaluation in progress.'
                                  : submission_portal_active || current_stage?.toLowerCase().includes('hack')
                                    ? 'Hacking is in progress! Build your project and submit it using the My Submission Hub.'
                                    : 'Registration is open. Your profile has been received.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Team Assignment */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={18} className="text-primary" />
                      <h2 className="font-semibold text-gray-900">Team Assignment</h2>
                    </div>
                    {team ? (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-lg font-bold text-gray-900">{team.name}</h3>
                          <Badge variant="yellow">{team.status}</Badge>
                        </div>

                        {/* ── Name Your Team (one-time, only during Team Formation) ── */}
                        {!team.name_locked && canRenameTeam && (
                          <div className="mb-4">
                            {renameSuccess ? (
                              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <CheckCircle size={13} className="text-green-500" />
                                Team name set! This cannot be changed again.
                              </div>
                            ) : showRenameForm ? (
                              <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-3 space-y-2">
                                <p className="text-xs font-semibold text-orange-800">Choose your team name — you can only do this once.</p>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newTeamName}
                                    onChange={e => { setNewTeamName(e.target.value); setRenameError('') }}
                                    placeholder="e.g. Team Nexus"
                                    maxLength={50}
                                    className="flex-1 px-3 py-2 text-xs border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                                  />
                                  <button
                                    onClick={handleRenameTeam}
                                    disabled={renameLoading || !newTeamName.trim()}
                                    className="flex items-center gap-1 bg-primary text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                                  >
                                    {renameLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => { setShowRenameForm(false); setRenameError('') }}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-2"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {renameError && <p className="text-xs text-red-500">{renameError}</p>}
                              </div>
                            ) : (
                              <button
                                onClick={() => { setShowRenameForm(true); setNewTeamName(team.name) }}
                                className="flex items-center gap-1.5 text-xs text-primary hover:text-orange-600 font-semibold transition-colors"
                              >
                                <Edit2 size={12} />
                                Name your team (one-time)
                              </button>
                            )}
                          </div>
                        )}
                        {team.name_locked && !renameSuccess && (
                          <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                            <Lock size={10} /> Team name locked
                          </p>
                        )}
                        {team.rationale && !team.rationale.startsWith('[') && (
                          <p className="text-sm text-gray-600 mb-4 leading-relaxed line-clamp-3">
                            {team.rationale}
                          </p>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Your Teammates
                          </p>
                          <div className="space-y-2">
                            {teammates.map((tm: any) => (
                              <div key={tm.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center">
                                    <span className="text-primary text-xs font-bold">{tm.name.charAt(0)}</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{tm.name}</p>
                                    <p className="text-xs text-gray-500">{tm.institution}</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {(tm.skills || []).slice(0, 2).map((s: string) => (
                                    <span key={s} className="text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 my-auto">
                        <Clock size={28} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Team assignment pending</p>
                        <p className="text-xs text-gray-400 mt-1">You'll be notified once teams are formed and approved</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Q&A Chat */}
            {team && eventId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <QAChat
                  eventId={eventId}
                  teamId={team.id}
                  senderName={participant.name}
                  senderRole="team"
                  onNewMessage={(msg) => setQaNotification(msg)}
                  disabled={team.submission_status !== 'Submitted'}
                />
              </div>
            )}

            {/* Lower Dashboard Row */}
            {isPhase3 && team && team.final_score !== null && team.final_score !== undefined ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mt-6">
                {/* Final Scoring & Rationale Card */}
                {(() => {
                  const publicVote = team.public_vote_score
                  let judgeAvg = team.judge_avg_score ?? team.final_score
                  if (!team.judge_avg_score && publicVote !== null && publicVote !== undefined) {
                    judgeAvg = (team.final_score - 0.30 * publicVote) / 0.70
                  }
                  return (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
                      <div>
                        <div className="flex items-center justify-between mb-4 border-b border-purple-100 pb-3">
                          <h3 className="text-sm font-bold text-purple-950 uppercase tracking-wider">Final Balanced Result</h3>
                          {team.rank && (
                            <Badge variant="purple" className="font-extrabold px-3 py-1">
                              Rank #{team.rank}
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                          <div className="bg-white rounded-lg p-3 border border-purple-100/50 shadow-xs text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">Judges (70%)</span>
                            <span className="text-base font-extrabold text-purple-950">{judgeAvg.toFixed(2)}</span>
                            <span className="text-xs text-gray-400"> / 10</span>
                          </div>

                          <div className="bg-white rounded-lg p-3 border border-purple-100/50 shadow-xs text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">Public (30%)</span>
                            <span className="text-[9px] text-gray-300 block">Social + Peer Avg</span>
                            <span className="text-base font-extrabold text-purple-950">
                              {publicVote !== null && publicVote !== undefined ? publicVote.toFixed(2) : '—'}
                            </span>
                            <span className="text-xs text-gray-400"> / 10</span>
                          </div>

                          <div className="bg-purple-600 rounded-lg p-3 text-white shadow-xs text-center">
                            <span className="text-[10px] opacity-80 uppercase tracking-wider block font-medium">Final Score</span>
                            <span className="text-base font-black">{team.final_score.toFixed(2)}</span>
                            <span className="text-xs opacity-80"> / 10</span>
                          </div>
                        </div>
                      </div>

                      {team.bias_rationale && (
                        <div className="bg-purple-100/40 border border-purple-100/60 rounded-lg p-3 text-xs text-purple-900 leading-relaxed mt-4">
                          <span className="font-bold block mb-1 text-purple-950">Audience & Judge Balance Rationale</span>
                          {team.bias_rationale}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Key Dates / Pipeline */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar size={18} className="text-primary" />
                      <h2 className="font-semibold text-gray-900">Event Pipeline</h2>
                    </div>
                    <div className="space-y-2">
                      {(key_dates || []).map((kd: any, i: number) => (
                        <div key={i} className="flex items-center gap-3">
                          {kd.done ? (
                            <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                          ) : (
                            <Clock size={16} className="text-gray-300 flex-shrink-0" />
                          )}
                          <div className="flex items-center justify-between flex-1">
                            <span className={`text-sm ${kd.done ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>
                              {kd.label}
                            </span>
                            <span className="text-xs text-gray-400">{kd.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Event Pipeline only (Phase 1 & 2, or if team/score is missing) */
              <div className="w-full mt-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={18} className="text-primary" />
                    <h2 className="font-semibold text-gray-900">Event Pipeline</h2>
                  </div>
                  <div className="space-y-2">
                    {(key_dates || []).map((kd: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        {kd.done ? (
                          <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                        ) : (
                          <Clock size={16} className="text-gray-300 flex-shrink-0" />
                        )}
                        <div className="flex items-center justify-between flex-1">
                          <span className={`text-sm ${kd.done ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>
                            {kd.label}
                          </span>
                          <span className="text-xs text-gray-400">{kd.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Subscribe for Future Events Banner */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bell size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Stay Notified for Future Events</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Subscribe to get notified when new events are announced — no spam, just updates.</p>
                </div>
              </div>
              <Link
                to="/subscribe"
                className="flex-shrink-0 flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm"
              >
                <Bell size={13} />
                Subscribe for Future Events
              </Link>
            </div>

            {/* Live Leaderboard — available from evaluation phase onwards */}
            {(isPhase2 || isPhase3) && (
              <a
                href={`/live-leaderboard${eventId ? `?event=${eventId}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm hover:shadow-md hover:border-primary/30 dark:hover:border-primary/40 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Trophy size={20} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      Live Leaderboard
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      {isPhase3
                        ? 'Final rankings are live — see where your team stands!'
                        : 'Scores are coming in — watch the live rankings update in real time!'}
                    </p>
                  </div>
                </div>
                <span className="flex-shrink-0 flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm">
                  <Trophy size={13} />
                  View Rankings
                </span>
              </a>
            )}
          </div>
        )}

        {activeTab === 'showroom' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* ── Project Showroom — Phase Gated ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 size={20} className="text-primary" />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Project Showroom & Peer Voting</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Rate other teams on a 0-10 scale</p>
                  </div>
                </div>

                {scoring_phase_active && showroom.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full font-semibold border border-indigo-100">
                      {votedCount} of {showroom.length} rated
                    </span>
                    {votedCount === showroom.length && (
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                        All Done! ✓
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!scoring_phase_active ? (
                /* ── Locked state ── */
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Lock size={24} className="text-gray-300" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Gallery Locked</h3>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                    Project gallery and peer voting will only open in the <strong>Scoring</strong> Phase.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                    <Clock size={12} />
                    <span>Current stage: <strong className="text-gray-600">{current_stage || 'Participant Intake'}</strong></span>
                  </div>
                </div>
              ) : !team ? (
                /* ── Not assigned to a team ── */
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">You need to be assigned to a team before you can participate in peer voting.</p>
                </div>
              ) : showroom.length === 0 ? (
                /* ── No other teams yet ── */
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No other teams are available for review yet.</p>
                </div>
              ) : (
                /* ── Showroom grid ── */
                <div className="space-y-6">
                  {/* Progress tracker */}
                  <div className="bg-indigo-50/50 border border-indigo-100/60 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-indigo-700">Peer Voting Progress</span>
                      <span className="text-xs font-bold text-indigo-900">{Math.round((votedCount / showroom.length) * 100)}%</span>
                    </div>
                    <div className="w-full bg-indigo-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(votedCount / showroom.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {showroom.map((t: any) => (
                      <ShowroomCard
                        key={t.id}
                        team={t}
                        eventId={eventId!}
                        token={token!}
                        onVoteSubmitted={handleVoteSubmitted}
                        votingClosed={isClosed}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'submission' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* ── Project Submission Portal ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2.5 mb-2 border-b border-gray-100 pb-4">
                <Folder className="text-primary" size={20} />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Project Submission Portal</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Submit your team's hackathon project details and links below.</p>
                </div>
              </div>

              {!team ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                  <Clock size={36} className="text-gray-300 mx-auto mb-3" />
                  <h3 className="font-bold text-gray-700 mb-1">No Team Assigned</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    You must be assigned to a team by the organizers before you can submit links.
                  </p>
                </div>
              ) : !submission_portal_active && team.submission_status !== 'Submitted' ? (
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Lock size={24} className="text-gray-300" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Submission Portal Locked</h3>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                    The project submission portal is currently locked. Submissions are only accepted during the hacking or presentation phases.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                    <Clock size={12} />
                    <span>Current stage: <strong className="text-gray-600">{current_stage || 'Participant Intake'}</strong></span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                  {/* Form Card */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="space-y-4">
                      {/* Project Title */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          Project Title
                        </label>
                        <input
                          id="project-title-input"
                          type="text"
                          disabled={team.submission_status === "Submitted" || isClosed}
                          placeholder="e.g. HealthSync: AI Powered Smart Diagnostics"
                          value={projectTitle}
                          onChange={(e) => setProjectTitle(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>

                      {/* Project Description */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          Project Description
                        </label>
                        <textarea
                          id="project-description-input"
                          disabled={team.submission_status === "Submitted" || isClosed}
                          rows={4}
                          placeholder="Provide a comprehensive summary of your project, the problem it solves, and the technologies used..."
                          value={projectDescription}
                          onChange={(e) => setProjectDescription(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 resize-none"
                        />
                      </div>

                      {/* GitHub Repository URL */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          GitHub Repository URL
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            <Github size={14} />
                          </span>
                          <input
                            id="github-url-input"
                            type="url"
                            disabled={team.submission_status === "Submitted" || isClosed}
                            placeholder="https://github.com/yourusername/project-repo"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </div>
                      </div>

                      {/* Video Link */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          Demo Video URL
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            <Youtube size={14} />
                          </span>
                          <input
                            id="video-url-input"
                            type="url"
                            disabled={team.submission_status === "Submitted" || isClosed}
                            placeholder="https://youtube.com/watch?v=..."
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </div>
                      </div>

                      {/* Presentation Link */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          Presentation/PPT URL
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            <Send size={14} />
                          </span>
                          <input
                            id="presentation-url-input"
                            type="url"
                            disabled={team.submission_status === "Submitted" || isClosed}
                            placeholder="https://docs.google.com/presentation/d/... or https://slideshare.net/..."
                            value={presentationUrl}
                            onChange={(e) => setPresentationUrl(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </div>
                      </div>
                    </div>

                    {submissionSuccess && team.submission_status !== "Submitted" && (
                      <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200/50 p-2.5 rounded-lg">
                        {submissionSuccess}
                      </p>
                    )}
                    {submissionError && (
                      <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200/50 p-2.5 rounded-lg">
                        {submissionError}
                      </p>
                    )}

                    {!submission_portal_active && team.submission_status === 'Submitted' ? (
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium px-4 py-3 rounded-lg flex items-center gap-2 mt-2">
                        <CheckCircle size={16} className="text-blue-600 flex-shrink-0" />
                        <span>Your submission is locked and currently under review. No further changes can be made.</span>
                      </div>
                    ) : isClosed ? (
                      <div className="bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold px-4 py-3 rounded-lg flex items-center gap-2 mt-2">
                        <Lock size={16} className="text-gray-400 flex-shrink-0" />
                        <span>Submissions are closed because the event has advanced to the Results phase.</span>
                      </div>
                    ) : team.submission_status !== "Submitted" ? (
                      <div className="flex gap-3 pt-2">
                        <button
                          id="save-draft-button"
                          onClick={handleSaveDraft}
                          disabled={submissionSaving}
                          className="flex-1 bg-white border border-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
                        >
                          Save Draft
                        </button>
                        <button
                          id="lock-submission-button"
                          onClick={() => setShowConfirmModal(true)}
                          disabled={submissionSaving}
                          className="flex-1 bg-primary text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60"
                        >
                          Final Submit
                        </button>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 text-green-800 text-xs font-medium px-4 py-3 rounded-lg flex items-center gap-2 mt-2">
                        <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                        <span>🎉 Submission Complete! Your project has been securely locked.</span>
                      </div>
                    )}
                  </div>

                  {/* Info Card */}
                  <div className="lg:col-span-1 space-y-4">
                    {/* Status Card */}
                    <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-4">
                      <h4 className="font-bold text-[10px] text-gray-400 uppercase tracking-wider mb-3">Submission Details</h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">Team Status:</span>
                        <Badge variant="yellow">{team.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                        <span className="text-xs text-gray-500">Submission Status:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${team.submission_status === "Submitted" ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {team.submission_status || 'Draft'}
                        </span>
                      </div>
                    </div>

                    {/* Warning Card */}
                    {team.submission_status !== "Submitted" && (
                      <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 rounded-xl p-4 text-orange-950 dark:text-orange-200">
                        <h4 className="font-bold text-xs text-orange-800 dark:text-orange-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          ⚠️ Important Notice
                        </h4>
                        <p className="text-xs leading-relaxed opacity-90">
                          Submitting confirms these details as your final hackathon project. Once submitted:
                        </p>
                        <ul className="list-disc pl-4 text-[11px] space-y-1 mt-2 font-medium opacity-80">
                          <li>Organizers and judges will use these details for evaluation.</li>
                          <li>You cannot modify them, even if you make changes in your GitHub repo.</li>
                          <li>Your project will be shared in the peer voting gallery.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-orange-600">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Lock size={20} />
              </div>
              <h3 className="font-extrabold text-base text-gray-900">Lock Submission Permanently?</h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to finalize your submission? This will lock your project details (Title, Description, GitHub, Video, and Presentation links) and prevent any future changes.
            </p>

            <div className="bg-orange-50/50 rounded-lg p-3 border border-orange-100/50 text-[10px] text-orange-800 leading-relaxed font-medium">
              ⚠️ Once submitted, you cannot modify your project description or links under any circumstances.
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 bg-white border border-gray-200 text-gray-700 text-xs font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFinal}
                disabled={submissionSaving}
                className="flex-1 bg-primary text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-1.5"
              >
                {submissionSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Q&A Notification Popup */}
      <QANotificationPopup
        message={qaNotification}
        onClose={() => setQaNotification(null)}
      />

      {/* Floating AI Companion Trigger */}
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
            role="participant"
            token={token}
            isOpen={isAgentOpen}
            onClose={() => setIsAgentOpen(false)}
          />
        </>
      )}
    </div>
  )
}
