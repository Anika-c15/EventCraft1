import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Share2, Settings2, RefreshCw, Play, Copy, Trash, Check, AlertTriangle,
  BarChart3, Info, Globe, Sparkles, CheckCircle2, AlertCircle, ExternalLink, Send,
  RotateCcw
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { socialScrapingApi, teamsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import { useToast, useConfirm } from '../context/ToastAndConfirmContext'
import { SocialPoll, SocialConfig, SocialAuthStatus, SocialCampaignSummary, PollPipelineStatus, SocialPlatform, PipelineStepStatus } from '../types'

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  mock: 'Mock Sandbox'
}

const PLATFORM_COLORS: Record<SocialPlatform, { bg: string; text: string; border: string; accent: string }> = {
  twitter: {
    bg: 'bg-sky-50 dark:bg-sky-950/20',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-100 dark:border-sky-900/40',
    accent: 'bg-sky-500'
  },
  linkedin: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-100 dark:border-blue-900/40',
    accent: 'bg-blue-600'
  },
  instagram: {
    bg: 'bg-pink-50 dark:bg-pink-950/20',
    text: 'text-pink-700 dark:text-pink-400',
    border: 'border-pink-100 dark:border-pink-900/40',
    accent: 'bg-pink-600'
  },
  mock: {
    bg: 'bg-slate-50 dark:bg-slate-900/60',
    text: 'text-slate-700 dark:text-slate-400',
    border: 'border-slate-100 dark:border-slate-800',
    accent: 'bg-slate-500'
  }
}

const formatSocialPlatformError = (platform: string, error: string): string => {
  if (!error) return `${platform === 'linkedin' ? 'LinkedIn' : platform.toUpperCase()} error occurred.`
  
  const errLower = error.toLowerCase()
  
  if (platform === 'linkedin') {
    if (errLower.includes('native polls need mdp/community') || errLower.includes('approval')) {
      return 'LinkedIn native polls require Community Management approval.'
    }
    if (errLower.includes('fallback') || errLower.includes('text-only') || errLower.includes('do not support automated')) {
      return 'LinkedIn text posts do not support auto-fetching. Please enter votes manually.'
    }
    if (errLower.includes('rate limit')) {
      return 'LinkedIn rate limit exceeded. Please retry in 1 hour.'
    }
    if (errLower.includes('permission') || errLower.includes('unauthorized') || errLower.includes('403') || errLower.includes('401')) {
      return 'LinkedIn API permission denied or missing.'
    }
    if (errLower.includes('connection') || errLower.includes('network') || errLower.includes('parsing')) {
      return 'Could not connect to LinkedIn API. Check credentials or try again later.'
    }
    return 'LinkedIn API error. Please enter results manually.'
  }
  
  if (platform === 'twitter') {
    if (errLower.includes('rate limit')) {
      return 'Twitter API rate limit exceeded.'
    }
    if (errLower.includes('permission') || errLower.includes('unauthorized') || errLower.includes('403') || errLower.includes('401')) {
      return 'Twitter API authorization failed.'
    }
    return 'Twitter API error.'
  }

  if (platform === 'instagram') {
    return 'Instagram Story posting requires manual URN entry.'
  }
  
  return error
}

export const SocialScraping: React.FC = () => {
  const { eventId, lastWsMessage, dashboardStats, loadDashboard } = useAppContext()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [pipelineReady, setPipelineReady] = useState<boolean | null>(null)

  // --- States ---
  const [config, setConfig] = useState<SocialConfig | null>(null)
  const [polls, setPolls] = useState<SocialPoll[]>([])
  const [authStatus, setAuthStatus] = useState<SocialAuthStatus | null>(null)
  const [campaignSummary, setCampaignSummary] = useState<SocialCampaignSummary | null>(null)
  const [teams, setTeams] = useState<any[]>([])

  // Pipeline execution tracking states
  const [pipelineStatus, setPipelineStatus] = useState<PollPipelineStatus>({
    generate: { twitter: 'pending', linkedin: 'pending', instagram: 'pending', mock: 'pending' },
    post: { twitter: 'pending', linkedin: 'pending', instagram: 'pending', mock: 'pending' },
    fetch: { twitter: 'pending', linkedin: 'pending', instagram: 'pending', mock: 'pending' },
    calculate: 'pending'
  })

  // Loading indicator states
  const [loadingPolls, setLoadingPolls] = useState(false)
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [loadingTeams, setLoadingTeams] = useState(false)

  // Actions loading states
  const [actionGenerating, setActionGenerating] = useState(false)
  const [actionPosting, setActionPosting] = useState(false)
  const [actionFetching, setActionFetching] = useState(false)
  const [actionCalculating, setActionCalculating] = useState(false)
  const [actionPipeline, setActionPipeline] = useState(false)
  const [actionResetting, setActionResetting] = useState(false)

  // Form states
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [tempConfig, setTempConfig] = useState<SocialConfig | null>(null)
  const [instagramMediaIds, setInstagramMediaIds] = useState<Record<string, string>>({})
  const [manualVotes, setManualVotes] = useState<Record<string, Record<string, string>>>({})
  const [overrideScores, setOverrideScores] = useState<Record<string, string>>({})
  const [copiedPollId, setCopiedPollId] = useState<string | null>(null)

  // Filter state for polls
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterFlagged, setFilterFlagged] = useState<string>('all')

  // Reactively derive pipeline statuses whenever polls or teams change
  useEffect(() => {
    const platforms: SocialPlatform[] = ['twitter', 'linkedin', 'instagram', 'mock']
    
    setPipelineStatus(prev => {
      const nextStatus = { ...prev }
      platforms.forEach(p => {
        const platformPolls = polls.filter(x => x.platform === p)
        if (platformPolls.length === 0) {
          nextStatus.generate[p] = 'pending'
          nextStatus.post[p] = 'pending'
          nextStatus.fetch[p] = 'pending'
          return
        }

        // Generation is done if we have draft or posted polls
        nextStatus.generate[p] = 'success'

        // Post status
        const hasDrafts = platformPolls.some(x => x.status === 'draft')
        const hasFailedPosts = platformPolls.some(x => x.status === 'failed' && !x.manual_pending)
        const hasPosted = platformPolls.some(x => x.status === 'posted' || x.status === 'completed')

        if (p === 'instagram') {
          const hasUnlinked = platformPolls.some(x => x.status === 'draft' || !x.platform_post_id)
          if (hasUnlinked) {
            nextStatus.post[p] = 'manual_pending'
          } else {
            nextStatus.post[p] = 'success'
          }
        } else {
          if (hasFailedPosts) {
            nextStatus.post[p] = 'failed'
          } else if (hasPosted) {
            nextStatus.post[p] = 'success'
          } else if (hasDrafts) {
            nextStatus.post[p] = 'pending'
          }
        }

        // Fetch status
        const hasManualPending = platformPolls.some(x => x.manual_pending)
        const hasCompleted = platformPolls.every(x => x.status === 'completed')
        const hasEnded = platformPolls.some(x => x.ends_at && new Date(x.ends_at) <= new Date())

        if (hasManualPending) {
          nextStatus.fetch[p] = 'manual_pending'
        } else if (hasCompleted) {
          nextStatus.fetch[p] = 'success'
        } else if (hasEnded) {
          nextStatus.fetch[p] = 'running'
        } else if (hasPosted) {
          nextStatus.fetch[p] = 'pending'
        }
      })

      // Calculate status
      const allCompleted = polls.length > 0 && polls.every(x => x.status === 'completed')
      const hasScores = teams.some(t => t.social_vote_score !== null && t.social_vote_score !== undefined)
      if (allCompleted && hasScores) {
        nextStatus.calculate = 'success'
      } else if (allCompleted) {
        nextStatus.calculate = 'pending'
      } else {
        nextStatus.calculate = 'pending'
      }

      return nextStatus
    })
  }, [polls, teams])


  // --- Data Loaders ---
  const loadConfig = useCallback(async () => {
    if (!eventId) return
    try {
      const data = await socialScrapingApi.getSocialConfig(eventId)
      setConfig(data)
      setTempConfig(data)
    } catch (err: any) {
      toast.error(`Failed to load config: ${err.message}`)
    }
  }, [eventId, toast])

  const loadPolls = useCallback(async () => {
    if (!eventId) return
    setLoadingPolls(true)
    try {
      const data = await socialScrapingApi.listPolls(eventId)
      setPolls(data)
      // Initialize inputs
      const mediaIdMap: Record<string, string> = {}
      const votesMap: Record<string, Record<string, string>> = {}
      const overrideMap: Record<string, string> = {}
      data.forEach(p => {
        if (p.platform_post_id) {
          mediaIdMap[p.id] = p.platform_post_id
        }
        if (p.votes) {
          const vObj: Record<string, string> = {}
          Object.entries(p.votes).forEach(([k, v]) => {
            vObj[k] = (v as number).toString()
          })
          votesMap[p.id] = vObj
        } else if (p.options) {
          const vObj: Record<string, string> = {}
          p.options.forEach((o: any) => {
            vObj[o.text] = ''
          })
          votesMap[p.id] = vObj
        }
        if (p.admin_override_score !== null) {
          overrideMap[p.id] = p.admin_override_score.toString()
        }
      })
      setInstagramMediaIds(mediaIdMap)
      setManualVotes(votesMap)
      setOverrideScores(overrideMap)
    } catch (err: any) {
      toast.error(`Failed to load polls: ${err.message}`)
    } finally {
      setLoadingPolls(false)
    }
  }, [eventId, toast])

  const loadAuthStatus = useCallback(async () => {
    if (!eventId) return
    setLoadingAuth(true)
    try {
      const data = await socialScrapingApi.getAuthStatus(eventId)
      setAuthStatus(data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoadingAuth(false)
    }
  }, [eventId])

  const loadCampaignSummary = useCallback(async () => {
    if (!eventId) return
    try {
      const data = await socialScrapingApi.getCampaignSummary(eventId)
      setCampaignSummary(data)
    } catch (err: any) {
      // Empty or not calculated yet is fine
      setCampaignSummary(null)
    }
  }, [eventId])

  const loadTeams = useCallback(async () => {
    if (!eventId) return
    setLoadingTeams(true)
    try {
      const data = await teamsApi.list(eventId)
      setTeams(data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoadingTeams(false)
    }
  }, [eventId])

  // --- WebSocket Live Updates handler ---
  useEffect(() => {
    if (!lastWsMessage) return

    const { type, step, platform, status, error } = lastWsMessage

    if (type === 'social:pipeline_step') {
      setPipelineStatus(prev => {
        const next = { ...prev }
        if (step === 'calculate') {
          next.calculate = status as PipelineStepStatus
        } else if (step === 'generate' || step === 'post' || step === 'fetch') {
          const plat = platform as SocialPlatform
          if (step === 'post') {
            if (error) {
              next.post[plat] = { status: 'failed', error } as any
            } else {
              next.post[plat] = status as any
            }
          } else if (step === 'generate' || step === 'fetch') {
            const stepKey = step as 'generate' | 'fetch'
            next[stepKey][plat] = status as any
          }
        }
        return next
      })
      if (status === 'success') {
        loadPolls()
        loadCampaignSummary()
        loadTeams()
      }
    } else if (type === 'social:poll_posted') {
      toast.info(`Poll for platform ${platform} updated: ${status}`)
      loadPolls()
    } else if (type === 'social:poll_fetched') {
      loadPolls()
      loadCampaignSummary()
    } else if (type === 'social:scores_updated') {
      loadTeams()
      loadCampaignSummary()
    }
  }, [lastWsMessage, loadPolls, loadCampaignSummary, loadTeams, toast])

  // Mount loading
  useEffect(() => {
    if (eventId) {
      loadDashboard()
      setPipelineReady(null)
      import('../api/client').then(({ eventsApi }) => {
        eventsApi.stages(eventId).then((stages) => {
          setPipelineReady(stages.length > 0)
        }).catch(() => setPipelineReady(false))
      })
      loadConfig()
      loadPolls()
      loadAuthStatus()
      loadCampaignSummary()
      loadTeams()
    }
  }, [eventId, loadConfig, loadPolls, loadAuthStatus, loadCampaignSummary, loadTeams, loadDashboard])

  // --- Actions ---
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventId || !tempConfig) return
    setIsSavingConfig(true)
    try {
      const data = await socialScrapingApi.updateSocialConfig(eventId, tempConfig)
      setConfig(data)
      toast.success('Social scraping configuration updated successfully!')
    } catch (err: any) {
      toast.error(`Failed to update config: ${err.message}`)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleGeneratePolls = async () => {
    if (!eventId) return
    setActionGenerating(true)
    try {
      await socialScrapingApi.generatePolls(eventId)
      toast.success('Poll generation process triggered. Generating drafts via LLM...')
      await loadPolls()
    } catch (err: any) {
      toast.error(`Failed to generate polls: ${err.message}`)
    } finally {
      setActionGenerating(false)
    }
  }

  const handlePostAllPolls = async () => {
    if (!eventId) return
    const proceed = await confirm({
      title: 'Bulk Post Polls',
      message: 'Are you sure you want to post all draft polls to their configured social networks?',
      confirmText: 'Post All',
      type: 'info'
    })
    if (!proceed) return

    setActionPosting(true)
    try {
      const res = await socialScrapingApi.postAllPolls(eventId)
      toast.success(`Post complete: ${res.posted} posted, ${res.failed} failed, ${res.manual} pending manual actions.`)
      await loadPolls()
    } catch (err: any) {
      toast.error(`Post process failed: ${err.message}`)
    } finally {
      setActionPosting(false)
    }
  }

  const handlePostSinglePoll = async (pollId: string) => {
    if (!eventId) return
    const poll = polls.find(p => p.id === pollId)
    try {
      await socialScrapingApi.postSinglePoll(eventId, pollId)
      toast.success('Poll posted successfully!')
      await loadPolls()
    } catch (err: any) {
      const platform = poll?.platform || 'unknown'
      const cleanMsg = formatSocialPlatformError(platform, err.message)
      toast.error(`Failed to post poll: ${cleanMsg}`)
    }
  }

  const handleSetInstagramId = async (pollId: string) => {
    if (!eventId) return
    const mediaId = instagramMediaIds[pollId]
    if (!mediaId || !mediaId.trim()) {
      toast.error('Please input a valid Instagram Story URN or Media ID')
      return
    }
    try {
      await socialScrapingApi.setInstagramId(eventId, pollId, mediaId.trim())
      toast.success('Instagram Story URN linked! Story timer set for 24h.')
      await loadPolls()
    } catch (err: any) {
      toast.error(`Failed to link Story ID: ${err.message}`)
    }
  }

  const handleSetManualPostId = async (pollId: string) => {
    if (!eventId) return
    const postId = instagramMediaIds[pollId] || `manual_${pollId}`
    try {
      await socialScrapingApi.setManualPostId(eventId, pollId, postId.trim())
      toast.success('Poll marked as manually posted!')
      await loadPolls()
    } catch (err: any) {
      toast.error(`Failed to link Post ID: ${err.message}`)
    }
  }

  const handleSubmitManualVotes = async (pollId: string) => {
    if (!eventId) return
    const votesStr = manualVotes[pollId] || {}
    const votes: Record<string, number> = {}

    // Validation
    let hasEmpty = false
    Object.entries(votesStr).forEach(([k, v]) => {
      if (v === '' || isNaN(parseInt(v))) {
        hasEmpty = true
      } else {
        votes[k] = parseInt(v)
      }
    })

    if (hasEmpty) {
      toast.error('Please specify valid integer votes for all options.')
      return
    }

    try {
      await socialScrapingApi.submitManualVotes(eventId, pollId, votes)
      toast.success('Manual votes submitted successfully!')
      await loadPolls()
      await loadCampaignSummary()
      await loadTeams()
    } catch (err: any) {
      toast.error(`Failed to submit manual results: ${err.message}`)
    }
  }

  const handleOverrideScore = async (pollId: string) => {
    if (!eventId) return
    const valStr = overrideScores[pollId]
    const val = (valStr === '' || valStr === undefined) ? null : parseFloat(valStr)

    if (val !== null && (isNaN(val) || val < 0 || val > 10)) {
      toast.error('Override score must be a number between 0 and 10')
      return
    }

    try {
      await socialScrapingApi.overridePollScore(eventId, pollId, val)
      toast.success(val === null ? 'Override cleared' : `Normalized score overridden to ${val}/10`)
      await loadPolls()
      await loadCampaignSummary()
      await loadTeams()
    } catch (err: any) {
      toast.error(`Failed to override score: ${err.message}`)
    }
  }

  const handleFetchResults = async () => {
    if (!eventId) return
    setActionFetching(true)
    try {
      const res = await socialScrapingApi.fetchPollResults(eventId)
      
      if (res.errors && res.errors.length > 0) {
        res.errors.forEach((err: any) => {
          const cleanMsg = formatSocialPlatformError(err.platform, err.error)
          toast.error(cleanMsg, 8000)
        })
      }

      toast.success(`Fetch process finished: ${res.fetched} fetched programmatically, ${res.manual_pending} polls flagged for manual entry fallback.`)
      await loadPolls()
      await loadCampaignSummary()
    } catch (err: any) {
      toast.error(`Fetch process encountered an error: ${err.message}`)
    } finally {
      setActionFetching(false)
    }
  }

  const handleCalculateScores = async () => {
    if (!eventId) return
    setActionCalculating(true)
    try {
      const res = await socialScrapingApi.calculateSocialScores(eventId)
      toast.success(`Scores updated for ${res.teams_updated} teams on leaderboards.`)
      await loadTeams()
      await loadCampaignSummary()
    } catch (err: any) {
      toast.error(`Calculation failed: ${err.message}`)
    } finally {
      setActionCalculating(false)
    }
  }

  const handleRunFullPipeline = async () => {
    if (!eventId) return
    const proceed = await confirm({
      title: 'Run Social Media Campaign Pipeline',
      message: 'This will delete existing drafts, generate fresh polls for all teams, and bulk-post them. It obeys the Gemini free-tier limits by pacing. Continue?',
      confirmText: 'Run Full Pipeline',
      type: 'info'
    })
    if (!proceed) return

    setActionPipeline(true)
    try {
      await socialScrapingApi.runFullPipeline(eventId)
      toast.success('Social Scraping pipeline initiated. Please monitor the step statuses below.')
      await loadPolls()
    } catch (err: any) {
      toast.error(`Pipeline run failed: ${err.message}`)
    } finally {
      setActionPipeline(false)
    }
  }

  const handleResetCampaign = async () => {
    if (!eventId) return
    const proceed = await confirm({
      title: 'Reset Social Campaign',
      message: 'Are you sure you want to permanently delete all social polls, votes, and reset team campaign scores to 0? This cannot be undone.',
      confirmText: 'Reset Data',
      type: 'danger'
    })
    if (!proceed) return

    setActionResetting(true)
    try {
      await socialScrapingApi.resetCampaign(eventId)
      toast.success('Social campaign data has been reset successfully!')
      await loadPolls()
      await loadCampaignSummary()
      await loadTeams()
    } catch (err: any) {
      toast.error(`Reset failed: ${err.message}`)
    } finally {
      setActionResetting(false)
    }
  }

  const handleDeletePoll = async (pollId: string) => {
    if (!eventId) return
    const proceed = await confirm({
      title: 'Delete Poll Draft',
      message: 'Are you sure you want to permanently delete this draft poll?',
      confirmText: 'Delete',
      type: 'danger'
    })
    if (!proceed) return

    try {
      await socialScrapingApi.deletePoll(eventId, pollId)
      toast.success('Poll draft deleted successfully.')
      await loadPolls()
    } catch (err: any) {
      toast.error(`Failed to delete poll: ${err.message}`)
    }
  }

  const getPollCaptionText = (poll: any) => {
    if (poll.platform === 'instagram') {
      return poll.commentary || ''
    }
    const optionsText = poll.options
      .map((opt: any, idx: number) => `${idx + 1}️⃣ ${opt.text}`)
      .join('\n')
    
    if (poll.platform === 'linkedin') {
      return (
        `${poll.commentary || poll.question_text}\n\n` +
        `Please vote by commenting with one of the following:\n` +
        `${optionsText}\n\n` +
        `Or leave a reaction!`
      )
    } else {
      // Twitter
      return (
        `${poll.commentary || poll.question_text}\n\n` +
        `Vote by replying with:\n` +
        `${optionsText}`
      )
    }
  }

  const copyToClipboard = (text: string, pollId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPollId(pollId)
    toast.success('Caption commentary copied to clipboard!')
    setTimeout(() => setCopiedPollId(null), 2000)
  }

  // --- Filtering logic ---
  const filteredPolls = polls.filter(poll => {
    if (filterPlatform !== 'all' && poll.platform !== filterPlatform) return false
    if (filterStatus !== 'all') {
      if (filterStatus === 'manual_pending') {
        if (!poll.manual_pending) return false
      } else {
        if (poll.status !== filterStatus) return false
      }
    }
    if (filterFlagged !== 'all') {
      const isFlagged = filterFlagged === 'flagged'
      if (poll.flagged !== isFlagged) return false
    }
    return true
  })

  // --- Helper renders ---
  const getStepStatusIcon = (status: PipelineStepStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald-500" />
      case 'failed':
        return <AlertCircle size={16} className="text-rose-500" />
      case 'manual_pending':
        return <AlertTriangle size={16} className="text-amber-500 animate-pulse" />
      case 'running':
        return <RefreshCw size={16} className="text-blue-500 animate-spin" />
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
    }
  }

  const getStepStatusLabel = (status: PipelineStepStatus) => {
    switch (status) {
      case 'success': return 'Complete'
      case 'failed': return 'Failed'
      case 'manual_pending': return 'Input Fallback'
      case 'running': return 'Running...'
      default: return 'Idle'
    }
  }

  if (pipelineReady === false) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-10 text-center max-w-lg mx-auto my-8 shadow-sm">
        <Share2 size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-1">Pipeline Not Configured Yet</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed mb-4">
          Social scraping campaigns are only available after the pipeline is configured by the <strong>AI Agent</strong> and approved by the committee.
        </p>
        <button
          onClick={() => navigate('/agent')}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Go to AI Agent →
        </button>
      </div>
    )
  }

  if (!config || !dashboardStats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <RefreshCw className="animate-spin text-primary mb-2" size={30} />
        <span className="text-sm text-gray-500">Loading Social Scraping pipeline status...</span>
      </div>
    )
  }

  if (config.social_weight === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-10 text-center max-w-lg mx-auto my-8 shadow-sm">
        <Share2 size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-1">Social Scraping Not Allowed</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed mb-4">
          Social scraping is not allowed because its scoring weight is set to 0% in the event's scoring configuration.
        </p>
      </div>
    )
  }

  const isEvaluationPhase = dashboardStats?.is_evaluation_unlocked ?? false

  if (!isEvaluationPhase) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-10 text-center max-w-lg mx-auto my-8 shadow-sm">
        <Share2 size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-3 animate-pulse" />
        <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-1">Social Scraping Panel Locked</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed mb-4">
          Social scraping campaigns and pipeline tools will unlock dynamically once the event transitions to the <strong>Evaluation</strong> phase.
        </p>
      </div>
    )
  }

  const activeLlm = campaignSummary?.llm_provider_used || polls.find(p => p.llm_provider_used)?.llm_provider_used

  return (
    <div className="space-y-6">
      {/* ── Title Header & Description ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Share2 className="text-primary animate-pulse" /> Social Scraping & Campaigns
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Orchestrate AI-driven polls on Twitter, LinkedIn, Instagram, and compile scores dynamically under free-tier limits.
        </p>
      </div>

      {/* ── Glassmorphic Action Control Bar ── */}
      <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/75 border border-gray-100 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={loadPolls}
            disabled={loadingPolls}
            title="Reload data"
            className="w-10 h-10 p-0 flex items-center justify-center rounded-xl"
          >
            <RefreshCw size={15} className={loadingPolls ? 'animate-spin text-gray-500' : 'text-gray-500'} />
          </Button>
          {activeLlm && (
            <Badge variant="purple" className="font-mono text-[10px] font-extrabold uppercase px-2.5 py-1.5 bg-purple-500/10 text-purple-500 border border-purple-500/20 shadow-sm flex items-center gap-1.5">
              🤖 LLM: {activeLlm}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Reset Button */}
          <Button
            variant="danger-outline"
            onClick={handleResetCampaign}
            disabled={actionResetting}
            className="text-xs font-semibold py-2 px-3 border-red-200 dark:border-red-950/50 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
          >
            <RotateCcw size={14} className={actionResetting ? 'animate-spin' : ''} /> Reset Campaign
          </Button>

          <span className="w-px h-6 bg-gray-200 dark:bg-slate-800 hidden md:inline-block" />

          {/* Segmented stage actions */}
          <div className="flex items-center bg-slate-100/60 dark:bg-slate-950/40 border border-gray-200/50 dark:border-slate-850 p-1 rounded-xl">
            <Button
              variant="secondary"
              onClick={handlePostAllPolls}
              disabled={actionPosting}
              className="text-xs font-bold py-1.5 px-3 border-none bg-transparent hover:bg-white dark:hover:bg-slate-900 text-gray-700 dark:text-slate-350 shadow-none hover:shadow-sm"
            >
              <Send size={13} className={actionPosting ? 'animate-spin' : ''} /> Post Drafts
            </Button>
            <Button
              variant="secondary"
              onClick={handleFetchResults}
              disabled={actionFetching}
              className="text-xs font-bold py-1.5 px-3 border-none bg-transparent hover:bg-white dark:hover:bg-slate-900 text-gray-700 dark:text-slate-350 shadow-none hover:shadow-sm"
            >
              <RefreshCw size={13} className={actionFetching ? 'animate-spin' : ''} /> Fetch Results
            </Button>
            <Button
              variant="secondary"
              onClick={handleCalculateScores}
              disabled={actionCalculating}
              className="text-xs font-bold py-1.5 px-3 border-none bg-transparent hover:bg-white dark:hover:bg-slate-900 text-gray-700 dark:text-slate-350 shadow-none hover:shadow-sm"
            >
              <BarChart3 size={13} className={actionCalculating ? 'animate-spin' : ''} /> Calculate Scores
            </Button>
          </div>

          {/* Premium Run Pipeline */}
          <Button
            variant="primary"
            onClick={handleRunFullPipeline}
            disabled={actionPipeline}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 active:translate-y-0.5 transition-all"
          >
            <Play size={13} fill="currentColor" /> Run Pipeline
          </Button>
        </div>
      </div>

      {/* ── Platform Capabilities Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Twitter Card */}
        <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-sky-300 dark:hover:border-sky-850/50 transition-all duration-300 relative group overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-sky-500/5 rounded-full blur-2xl group-hover:bg-sky-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-sky-600 dark:text-sky-400 font-mono tracking-tight">Twitter/X</span>
            </div>
            {/* Glowing status light */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full inline-block animate-pulse ${authStatus?.twitter?.valid ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-amber-500 shadow-sm shadow-amber-500/50'}`} />
              <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                {authStatus?.twitter?.valid ? 'Active' : 'Offline'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed mb-3">
            Post programmatically. Fetching requires manual fallback under free limits.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-auto">
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">
              ✓ Auto Post
            </span>
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
              ⚠️ Manual Fetch
            </span>
          </div>
        </div>

        {/* LinkedIn Card */}
        <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-850/50 transition-all duration-300 relative group overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-blue-600 dark:text-blue-400 font-mono tracking-tight">LinkedIn</span>
            </div>
            {/* Glowing status light */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full inline-block animate-pulse ${authStatus?.linkedin?.valid ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-amber-500 shadow-sm shadow-amber-500/50'}`} />
              <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                {authStatus?.linkedin?.valid ? 'Active' : 'Offline'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed mb-3">
            Full auto-post. Text fallback triggered on boundary errors.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-auto">
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">
              ✓ Auto Post
            </span>
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">
              ✓ Auto Fetch
            </span>
          </div>
        </div>

        {/* Instagram Card */}
        <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-pink-300 dark:hover:border-pink-850/50 transition-all duration-300 relative group overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-pink-500/5 rounded-full blur-2xl group-hover:bg-pink-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-pink-600 dark:text-pink-400 font-mono tracking-tight">Instagram</span>
            </div>
            {/* Glowing status light */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full inline-block animate-pulse ${authStatus?.instagram?.valid ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-gray-400 shadow-sm shadow-gray-400/50'}`} />
              <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                {authStatus?.instagram?.valid ? 'Active' : 'Offline'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed mb-3">
            Requires manual Story copy-posting. Reads are manual.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-auto">
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
              ⚠️ Manual Post
            </span>
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
              ⚠️ Manual Fetch
            </span>
          </div>
        </div>

        {/* Mock Sandbox Card */}
        <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-300 relative group overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-slate-500/5 rounded-full blur-2xl group-hover:bg-slate-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-600 dark:text-slate-400 font-mono tracking-tight">Mock Sandbox</span>
            </div>
            {/* Glowing status light */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block animate-pulse bg-green-500 shadow-sm shadow-green-500/50" />
              <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                Active
              </span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed mb-3">
            Fully simulated pipeline for offline verification.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-auto">
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">
              ✓ Auto Post
            </span>
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">
              ✓ Auto Fetch
            </span>
          </div>
        </div>

      </div>

      {/* ── Main Dashboard Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Column 1: Config, Auth & pipeline status (Left) ── */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Platform Auth Health Check */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                <Globe size={16} /> API Integration Health
              </CardTitle>
              {loadingAuth && <RefreshCw size={12} className="animate-spin text-gray-400" />}
            </CardHeader>
            <div className="space-y-3">
              {authStatus && (Object.keys(authStatus) as Array<keyof SocialAuthStatus>).map(platform => {
                const status = authStatus[platform]
                const color = PLATFORM_COLORS[platform as SocialPlatform]
                return (
                  <div key={platform} className={`flex items-center justify-between p-3 rounded-xl border ${color.border} ${color.bg}`}>
                    <div className="min-w-0">
                      <span className={`text-xs font-bold ${color.text} block`}>
                        {PLATFORM_LABELS[platform as SocialPlatform]}
                      </span>
                      <span className="text-[10px] text-gray-400 block truncate mt-0.5">
                        {status.configured ? (
                          status.read_ok ? 'Read/Write Enabled' : 'Write-only (Free-Tier Manual Fetch)'
                        ) : 'Not Configured (Sandbox Fallback)'}
                      </span>
                    </div>
                    <Badge variant={status.valid ? 'success' : 'gray'} className="text-[10px] font-bold">
                      {status.valid ? 'Active' : 'Offline'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Real-time Pipeline Progress Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Live Campaign Pipeline
              </CardTitle>
              <Badge variant="primary" className="animate-pulse">WebSockets Live</Badge>
            </CardHeader>
            
            <div className="space-y-4">
              {/* Platform Progress Lines */}
              {(['twitter', 'linkedin', 'instagram', 'mock'] as SocialPlatform[]).map(platform => {
                const gen = pipelineStatus.generate[platform]
                const pst = typeof pipelineStatus.post[platform] === 'string' 
                  ? (pipelineStatus.post[platform] as PipelineStepStatus) 
                  : (pipelineStatus.post[platform] as any).status
                const ftch = pipelineStatus.fetch[platform]

                return (
                  <div key={platform} className="p-3 bg-slate-50/50 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-slate-800/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800 dark:text-slate-200">
                        {PLATFORM_LABELS[platform]}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col items-center p-1.5 bg-white dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-850 text-center">
                        <span className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Gen</span>
                        {getStepStatusIcon(gen)}
                        <span className="text-[9px] text-gray-400 mt-1 font-semibold">{getStepStatusLabel(gen)}</span>
                      </div>

                      <div className="flex flex-col items-center p-1.5 bg-white dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-850 text-center">
                        <span className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Post</span>
                        {getStepStatusIcon(pst)}
                        <span className="text-[9px] text-gray-400 mt-1 font-semibold">{getStepStatusLabel(pst)}</span>
                      </div>

                      <div className="flex flex-col items-center p-1.5 bg-white dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-850 text-center">
                        <span className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Fetch</span>
                        {getStepStatusIcon(ftch)}
                        <span className="text-[9px] text-gray-400 mt-1 font-semibold">{getStepStatusLabel(ftch)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Score Calculation Line */}
              <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
                <div className="flex items-center justify-between p-3 bg-orange-50/30 dark:bg-orange-950/10 rounded-xl border border-orange-100/50 dark:border-orange-900/20">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-primary" />
                    <div>
                      <span className="text-xs font-bold text-gray-800 dark:text-slate-200 block">Leaderboard Scoring</span>
                      <span className="text-[10px] text-gray-400">Normalizing & weighting</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    {getStepStatusIcon(pipelineStatus.calculate)}
                    <span className="text-[9px] text-gray-400 mt-1 font-bold">{getStepStatusLabel(pipelineStatus.calculate)}</span>
                  </div>
                </div>
              </div>

            </div>
          </Card>

          {/* Configuration Card */}
          {tempConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                  Scraping Rules & Engine
                </CardTitle>
                <Settings2 size={16} className="text-gray-400" />
              </CardHeader>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-350">Enable Social Scraping</label>
                  <input
                    type="checkbox"
                    checked={tempConfig.enabled}
                    onChange={(e) => setTempConfig({ ...tempConfig, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    Platforms Included
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['twitter', 'linkedin', 'instagram', 'mock'] as SocialPlatform[]).map(plat => (
                      <label key={plat} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempConfig.platforms.includes(plat)}
                          onChange={(e) => {
                            const list = e.target.checked
                              ? [...tempConfig.platforms, plat]
                              : tempConfig.platforms.filter(x => x !== plat)
                            setTempConfig({ ...tempConfig, platforms: list })
                          }}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary"
                        />
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">
                          {PLATFORM_LABELS[plat]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    Poll Type Choice
                  </label>
                  <select
                    value={tempConfig.poll_type}
                    onChange={(e) => setTempConfig({ ...tempConfig, poll_type: e.target.value as any })}
                    className="w-full border border-gray-200 dark:border-slate-850 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-950 focus:outline-none dark:text-white"
                  >
                    <option value="hybrid">Auto-Hybrid (Compares teams ≤ 4)</option>
                    <option value="rating">Rating Polls (Scale 0-10 per team)</option>
                    <option value="comparative">Comparative Polls (A vs B)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={tempConfig.poll_duration_minutes}
                      onChange={(e) => setTempConfig({ ...tempConfig, poll_duration_minutes: parseInt(e.target.value) || 1440 })}
                      className="w-full border border-gray-200 dark:border-slate-850 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-950 focus:outline-none dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Min Votes Count
                    </label>
                    <input
                      type="number"
                      value={tempConfig.min_vote_threshold}
                      onChange={(e) => setTempConfig({ ...tempConfig, min_vote_threshold: parseInt(e.target.value) || 30 })}
                      className="w-full border border-gray-200 dark:border-slate-850 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-950 focus:outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800/60">
                  <label className="flex items-center justify-between text-xs font-medium text-gray-600 dark:text-slate-350 cursor-pointer">
                    <span>Auto Post on Evaluation</span>
                    <input
                      type="checkbox"
                      checked={tempConfig.auto_post_on_evaluation}
                      onChange={(e) => setTempConfig({ ...tempConfig, auto_post_on_evaluation: e.target.checked })}
                      className="w-4 h-4 rounded text-primary focus:ring-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs font-medium text-gray-600 dark:text-slate-350 cursor-pointer">
                    <span>Auto Fetch on End</span>
                    <input
                      type="checkbox"
                      checked={tempConfig.auto_fetch_on_completion}
                      onChange={(e) => setTempConfig({ ...tempConfig, auto_fetch_on_completion: e.target.checked })}
                      className="w-4 h-4 rounded text-primary focus:ring-primary"
                    />
                  </label>
                </div>

                <Button
                  type="submit"
                  disabled={isSavingConfig}
                  className="w-full justify-center text-xs py-2 rounded-xl"
                >
                  {isSavingConfig ? 'Saving...' : 'Save Configuration'}
                </Button>
              </form>
            </Card>
          )}

        </div>

        {/* ── Column 2 & 3: Active Poll Cards, Override Scores & Table (Right) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* AI Insights and Campaign Summaries */}
          {campaignSummary && (
            <Card>
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-orange-500 animate-pulse" size={18} />
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">AI Campaign Analysis</h2>
                    <p className="text-[10px] text-gray-400">Consolidated analytics and narrative summary</p>
                  </div>
                </div>
                <Badge variant="purple" className="font-bold flex items-center gap-1">
                  <Sparkles size={10} /> LLM Generated
                </Badge>
              </div>

              {/* Campaign summary metrics grid */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-850 rounded-xl text-center">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider block font-semibold">Total Polls</span>
                  <span className="text-base font-extrabold text-gray-800 dark:text-slate-100 block mt-0.5 font-mono">
                    {campaignSummary.total_polls}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-850 rounded-xl text-center">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider block font-semibold">Engagement</span>
                  <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 block mt-0.5 font-mono">
                    {campaignSummary.total_votes}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-850 rounded-xl text-center">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider block font-semibold">Avg Votes/Poll</span>
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 block mt-0.5 font-mono">
                    {campaignSummary.avg_votes_per_poll}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-850 rounded-xl text-center">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider block font-semibold">Anomaly Flags</span>
                  <span className={`text-base font-extrabold block mt-0.5 font-mono ${campaignSummary.flagged_polls > 0 ? 'text-amber-500' : 'text-gray-800 dark:text-slate-400'}`}>
                    {campaignSummary.flagged_polls}
                  </span>
                </div>
              </div>

              {/* Narrative Campaign Summary Render */}
              <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-800/80 rounded-2xl max-h-48 overflow-y-auto">
                <div className="prose prose-xs dark:prose-invert max-w-none">
                  <div className="text-xs text-gray-600 dark:text-slate-350 leading-relaxed font-mono whitespace-pre-wrap">
                    {campaignSummary.ai_summary || 'Campaign summary not generated yet. Calculate scores to generate summary insights.'}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Active Polls Section */}
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Active Social Campaigns & Drafts</h3>
                <p className="text-xs text-gray-400 mt-0.5">{filteredPolls.length} campaigns matching filters</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="border border-gray-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-[11px] bg-white dark:bg-slate-950 dark:text-white"
                >
                  <option value="all">All Platforms</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="instagram">Instagram</option>
                  <option value="mock">Mock Sandbox</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="border border-gray-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-[11px] bg-white dark:bg-slate-950 dark:text-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Drafts</option>
                  <option value="posted">Posted/Live</option>
                  <option value="completed">Completed</option>
                  <option value="manual_pending">Manual Fallback Input</option>
                </select>

                <select
                  value={filterFlagged}
                  onChange={(e) => setFilterFlagged(e.target.value)}
                  className="border border-gray-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-[11px] bg-white dark:bg-slate-950 dark:text-white"
                >
                  <option value="all">All Polls</option>
                  <option value="flagged">Flagged Only</option>
                  <option value="unflagged">Unflagged Only</option>
                </select>
              </div>
            </div>

            {/* Polls list container */}
            <div className="p-5 space-y-4">
              {filteredPolls.length === 0 ? (
                <div className="text-center py-16">
                  <AlertCircle size={28} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-500">No campaigns or polls match criteria</p>
                  <p className="text-xs text-gray-400 mt-1">Generate draft polls or adjust filters to begin.</p>
                  {polls.length === 0 && (
                    <Button
                      variant="primary"
                      onClick={handleGeneratePolls}
                      disabled={actionGenerating}
                      className="mt-4 text-xs font-semibold py-1.5 rounded-lg"
                    >
                      {actionGenerating ? 'Generating...' : 'Generate First Drafts'}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredPolls.map((poll) => {
                    const color = PLATFORM_COLORS[poll.platform]
                    const endsDate = poll.ends_at ? new Date(poll.ends_at) : null
                    const hasEnded = endsDate ? endsDate <= new Date() : false

                    return (
                      <div
                        key={poll.id}
                        className={`flex flex-col justify-between border ${color.border} rounded-2xl p-4 bg-white dark:bg-slate-900/60 hover:shadow-md transition-shadow relative overflow-hidden`}
                      >
                        {/* Glow banner based on status */}
                        {poll.manual_pending && (
                          <div className="absolute top-0 right-0 left-0 bg-amber-500/10 dark:bg-amber-500/5 text-amber-500 text-[9px] font-bold text-center py-1 border-b border-amber-500/20">
                            🚨 MANUAL ENTRY REQUIRED: {poll.poll_type === 'linkedin_text_fallback' ? 'permission boundary fallback' : 'rate block fallback'}
                          </div>
                        )}

                        <div>
                          {/* Card Platform Header */}
                          <div className={`flex items-center justify-between mb-3 ${poll.manual_pending ? 'mt-4' : ''}`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${color.accent}`} />
                              <span className={`text-[11px] font-bold ${color.text} uppercase tracking-wider`}>
                                {PLATFORM_LABELS[poll.platform]}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {poll.flagged && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" title={poll.flag_reason || 'Flagged for review'}>
                                  ⚠️ Flagged ({poll.flag_reason})
                                </span>
                              )}
                              {poll.poll_type === 'linkedin_text_fallback' && (
                                <Badge variant="warning" className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                  Text-Post Fallback
                                </Badge>
                              )}
                              <Badge
                                variant={
                                  poll.status === 'completed' ? 'success'
                                    : poll.status === 'posted' ? 'primary'
                                    : poll.status === 'failed' ? 'danger'
                                    : 'default'
                                }
                                className="text-[9px] font-extrabold uppercase tracking-wide px-1.5"
                              >
                                {poll.status === 'posted' && hasEnded ? 'Ended' : poll.status}
                              </Badge>
                            </div>
                          </div>

                          {/* Poll details */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-gray-800 dark:text-slate-100 line-clamp-3">
                              {poll.question_text}
                            </h4>

                            {poll.commentary && (
                              <p className="text-[10px] text-gray-400 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-950 p-2 rounded-xl line-clamp-2 leading-relaxed">
                                "{poll.commentary}"
                              </p>
                            )}

                            {/* Option list representation */}
                            <div className="space-y-1.5 pt-1">
                              {poll.options.map((opt) => {
                                const optVotes = poll.votes?.[opt.text] || 0
                                const total = poll.total_votes || 1
                                const percent = Math.round((optVotes / total) * 100)

                                const baseScore = poll.admin_override_score !== null ? poll.admin_override_score : (poll.normalized_score ?? 5.0)
                                const isComparative = poll.poll_type === 'comparative' || poll.poll_type === 'twitter_text_fallback' || poll.poll_type === 'linkedin_text_fallback'
                                const optScore = isComparative && total > 0
                                  ? baseScore * (optVotes / total)
                                  : null

                                return (
                                  <div key={opt.position} className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-600 dark:text-slate-350">
                                      <span className="font-medium truncate max-w-[180px]">{opt.text}</span>
                                      {poll.status === 'completed' && (
                                        <span className="font-bold flex-shrink-0 flex items-center gap-1.5">
                                          <span>{optVotes} votes ({percent}%)</span>
                                          {optScore !== null && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] border border-emerald-100 dark:border-emerald-900/30">
                                              ★ {optScore.toFixed(2)}/10
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    {poll.status === 'completed' && (
                                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${color.accent}`}
                                          style={{ width: `${percent}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                        </div>

                        {/* Interactive flow actions */}
                        <div className="border-t border-gray-100 dark:border-slate-800/80 pt-3 mt-4 space-y-3">
                          
                          {/* 1. Instagram Draft Manual Posting Prompt */}
                          {poll.platform === 'instagram' && poll.status === 'draft' && (
                            <div className="space-y-2.5">
                              <div className="bg-pink-50/50 dark:bg-pink-950/10 border border-pink-100/60 dark:border-pink-900/30 rounded-xl p-2.5">
                                <span className="text-[9px] font-bold text-pink-700 dark:text-pink-400 block mb-1">Instagram Graph API Posting Blocked:</span>
                                <p className="text-[10px] text-pink-600/80 dark:text-pink-400/60 leading-relaxed">
                                  Graph API does not support programmatic Story stickers. Please post this poll commentary to your Instagram Story manually.
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="flex-1 text-[10px] font-bold py-1.5"
                                  onClick={() => copyToClipboard(poll.commentary || '', poll.id)}
                                >
                                  {copiedPollId === poll.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                  {copiedPollId === poll.id ? 'Copied' : 'Copy Caption'}
                                </Button>
                              </div>

                              <div className="space-y-1 pt-1.5">
                                <label className="block text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                  Story Media ID or Link URN
                                </label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="Enter Story URN..."
                                    value={instagramMediaIds[poll.id] || ''}
                                    onChange={(e) => setInstagramMediaIds({ ...instagramMediaIds, [poll.id]: e.target.value })}
                                    className="flex-1 border border-gray-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[10px] bg-white dark:bg-slate-950 dark:text-white focus:outline-none"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleSetInstagramId(poll.id)}
                                    className="text-[10px] font-bold"
                                  >
                                    Verify Posted
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                           {/* 2. Standard Draft Action (Non-Instagram) */}
                           {poll.status === 'draft' && poll.platform !== 'instagram' && (
                             <div className="space-y-3">
                               <div className="flex gap-2">
                                 <Button
                                   size="sm"
                                   variant="secondary"
                                   className="flex-1 text-[10px] py-1.5 font-bold border border-transparent hover:border-red-200 dark:hover:border-red-950 hover:text-red-500"
                                   onClick={() => handleDeletePoll(poll.id)}
                                 >
                                   <Trash size={12} /> Delete Draft
                                 </Button>
                                 <Button
                                   size="sm"
                                   onClick={() => handlePostSinglePoll(poll.id)}
                                   className="flex-1 text-[10px] py-1.5 font-bold"
                                 >
                                   <ExternalLink size={12} /> Post Poll
                                 </Button>
                               </div>
                               
                               {poll.platform !== 'mock' && (
                                 <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                                   <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider block">
                                     Or Post Manually (Bypass API)
                                   </span>
                                   <div className="flex gap-2">
                                     <Button
                                       size="sm"
                                       variant="secondary"
                                       className="flex-1 text-[10px] font-bold py-1.5"
                                       onClick={() => copyToClipboard(getPollCaptionText(poll), poll.id)}
                                     >
                                       {copiedPollId === poll.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                       {copiedPollId === poll.id ? 'Copied' : 'Copy Poll Text'}
                                     </Button>
                                   </div>
                                   <div className="space-y-1">
                                     <div className="flex gap-1.5">
                                       <input
                                         type="text"
                                         placeholder="Enter Tweet/Post ID (or leave blank)..."
                                         value={instagramMediaIds[poll.id] || ''}
                                         onChange={(e) => setInstagramMediaIds({ ...instagramMediaIds, [poll.id]: e.target.value })}
                                         className="flex-1 border border-gray-200 dark:border-slate-850 rounded-lg px-2.5 py-1 text-[10px] bg-white dark:bg-slate-950 dark:text-white focus:outline-none"
                                       />
                                       <Button
                                         size="sm"
                                         variant="secondary"
                                         onClick={() => handleSetManualPostId(poll.id)}
                                         className="text-[10px] font-bold"
                                       >
                                         Mark Posted
                                       </Button>
                                     </div>
                                   </div>
                                 </div>
                               )}
                             </div>
                           )}

                           {/* 2.5 Failed Status Manual Recovery */}
                           {poll.status === 'failed' && (
                             <div className="space-y-2.5">
                               <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100/60 dark:border-red-900/30 rounded-xl p-2.5">
                                 <span className="text-[9px] font-bold text-red-700 dark:text-red-400 block mb-1">API Posting Failed:</span>
                                 <p className="text-[10px] text-red-600/80 dark:text-red-400/60 leading-relaxed font-mono">
                                   {formatSocialPlatformError(poll.platform, poll.error_message || 'Unknown API Error')}
                                 </p>
                               </div>

                               <div className="space-y-2 pt-1">
                                 <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider block">
                                   Recover manually:
                                 </span>
                                 <div className="flex gap-2">
                                   <Button
                                     size="sm"
                                     variant="secondary"
                                     className="flex-1 text-[10px] font-bold py-1.5"
                                     onClick={() => copyToClipboard(getPollCaptionText(poll), poll.id)}
                                    >
                                      {copiedPollId === poll.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                      {copiedPollId === poll.id ? 'Copied' : 'Copy Poll Text'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="text-[10px] py-1.5 font-bold text-red-500 border border-transparent hover:border-red-200 dark:hover:border-red-950"
                                      onClick={() => handleDeletePoll(poll.id)}
                                    >
                                      <Trash size={12} />
                                    </Button>
                                 </div>
                                 <div className="space-y-1">
                                   <div className="flex gap-1.5">
                                     <input
                                       type="text"
                                       placeholder="Enter Tweet/Post ID (or leave blank)..."
                                       value={instagramMediaIds[poll.id] || ''}
                                       onChange={(e) => setInstagramMediaIds({ ...instagramMediaIds, [poll.id]: e.target.value })}
                                       className="flex-1 border border-gray-200 dark:border-slate-850 rounded-lg px-2.5 py-1 text-[10px] bg-white dark:bg-slate-950 dark:text-white focus:outline-none"
                                     />
                                     <Button
                                       size="sm"
                                       onClick={() => handleSetManualPostId(poll.id)}
                                       className="text-[10px] font-bold"
                                     >
                                       Mark Posted
                                     </Button>
                                   </div>
                                 </div>
                               </div>
                             </div>
                           )}

                          {/* 3. Reusable Manual Results Form (Twitter, LinkedIn, Instagram in posted/fallback state) */}
                          {poll.platform !== 'mock' && (poll.status === 'posted' || poll.manual_pending) && (
                            <div className="space-y-2.5 p-3 bg-amber-50/50 dark:bg-amber-950/10 rounded-xl border border-amber-200/45 dark:border-amber-900/20">
                              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block mb-1">
                                Input End Tally (Social Web Manual Entry)
                              </span>
                              <div className="space-y-2">
                                {poll.options.map((opt) => (
                                  <div key={opt.position} className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] text-gray-600 dark:text-slate-350 truncate max-w-[140px] font-semibold">
                                      {opt.text}
                                    </span>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={manualVotes[poll.id]?.[opt.text] ?? ''}
                                      onChange={(e) => {
                                        const curVal = manualVotes[poll.id] || {}
                                        setManualVotes({
                                          ...manualVotes,
                                          [poll.id]: {
                                            ...curVal,
                                            [opt.text]: e.target.value
                                          }
                                        })
                                      }}
                                      className="w-20 border border-gray-250 dark:border-slate-850 rounded-lg px-2 py-0.5 text-right text-[10px] font-mono bg-white dark:bg-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                  </div>
                                ))}
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleSubmitManualVotes(poll.id)}
                                className="w-full text-[10px] font-bold mt-2 py-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                              >
                                Submit & Normalise Votes
                              </Button>
                            </div>
                          )}

                          {/* Render copy-text & post ID linker for manual/fallback polls that are posted or manual_pending */}
                          {poll.platform !== 'mock' && 
                            (poll.status === 'posted' || poll.manual_pending) && (
                               <div className="space-y-2.5 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-gray-150 dark:border-slate-800/80 mt-2">
                                 <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                                   Manual Post Details (Bypass API)
                                 </span>
                                 <div className="flex gap-2">
                                   <Button
                                     size="sm"
                                     variant="secondary"
                                     className="flex-1 text-[10px] font-bold py-1.5"
                                     onClick={() => copyToClipboard(getPollCaptionText(poll), poll.id)}
                                   >
                                     {copiedPollId === poll.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                     {copiedPollId === poll.id ? 'Copied' : 'Copy Poll Text'}
                                   </Button>
                                 </div>
                                 <div className="space-y-1">
                                   <div className="flex gap-1.5">
                                     <input
                                       type="text"
                                       placeholder="Enter Tweet/Post ID..."
                                       value={instagramMediaIds[poll.id] || ''}
                                       onChange={(e) => setInstagramMediaIds({ ...instagramMediaIds, [poll.id]: e.target.value })}
                                       className="flex-1 border border-gray-250 dark:border-slate-850 rounded-lg px-2.5 py-1 text-[10px] bg-white dark:bg-slate-950 dark:text-white focus:outline-none"
                                     />
                                     <Button
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => handleSetManualPostId(poll.id)}
                                       className="text-[10px] font-bold"
                                     >
                                       Link Post ID
                                     </Button>
                                   </div>
                                 </div>
                               </div>
                          )}

                          {/* 4. Complete Status Score Controls & Adjustments */}
                          {poll.status === 'completed' && (
                            <div className="space-y-2 pt-2 border-t border-gray-50 dark:border-slate-850/40">
                              
                              <div className="flex flex-col gap-1 text-[10px]">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-gray-400">
                                    {(poll.poll_type === 'comparative' || poll.poll_type === 'twitter_text_fallback' || poll.poll_type === 'linkedin_text_fallback') ? 'Base Engagement Score' : 'Score Out of 10'}
                                  </span>
                                  <span className="font-bold text-gray-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded-lg border border-gray-150 dark:border-slate-850">
                                    {poll.normalized_score !== null ? `${poll.normalized_score.toFixed(2)}/10` : '—'}
                                  </span>
                                </div>
                                {(poll.poll_type === 'comparative' || poll.poll_type === 'twitter_text_fallback' || poll.poll_type === 'linkedin_text_fallback') && (
                                  <p className="text-[9px] text-gray-400 dark:text-slate-500 italic mt-0.5 leading-tight">
                                    * Dynamic team scores shown above are scaled proportionally by vote share.
                                  </p>
                                )}
                              </div>

                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="10"
                                  placeholder="Override (0.0 - 10.0)..."
                                  value={overrideScores[poll.id] ?? ''}
                                  onChange={(e) => setOverrideScores({ ...overrideScores, [poll.id]: e.target.value })}
                                  className="flex-1 border border-gray-200 dark:border-slate-850 rounded-lg px-2.5 py-1 text-[10px] bg-white dark:bg-slate-950 dark:text-white focus:outline-none"
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleOverrideScore(poll.id)}
                                  className="text-[10px] font-bold py-1 px-2.5"
                                >
                                  Override
                                </Button>
                                {poll.admin_override_score !== null && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      const updated = { ...overrideScores }
                                      delete updated[poll.id]
                                      setOverrideScores(updated)
                                      socialScrapingApi.overridePollScore(eventId!, poll.id, null).then(() => {
                                        toast.success('Override cleared')
                                        loadPolls()
                                        loadCampaignSummary()
                                        loadTeams()
                                      })
                                    }}
                                    className="text-[10px] text-rose-500 hover:bg-rose-50 hover:text-rose-600 px-1 py-1"
                                  >
                                    Clear
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Time progress countdown display */}
                          {poll.status === 'posted' && !hasEnded && endsDate && (
                            <div className="flex items-center gap-1 text-[9px] text-indigo-500 font-semibold dark:text-indigo-400">
                              <Info size={10} /> Ends: {endsDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </div>
                          )}

                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Team Leaderboard Scrape Summary Table */}
          <Card>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Social Campaign Leaderboard</h3>
                <p className="text-xs text-gray-400">Weighted scores used in progression calculations</p>
              </div>
              <Badge variant="purple">Engine weights: {config.enabled ? 'Active' : 'Muted'}</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 text-left bg-slate-50/50 dark:bg-slate-950/20">
                    <th className="px-4 py-2.5 rounded-l-xl">Team Name</th>
                    <th className="px-4 py-2.5">Combined engagement</th>
                    <th className="px-4 py-2.5 text-right rounded-r-xl">Aggregate Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-850">
                  {loadingTeams ? (
                    <tr>
                      <td colSpan={3} className="text-center py-6 text-xs text-gray-400">Loading leaderboard...</td>
                    </tr>
                  ) : teams.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-6 text-xs text-gray-400">No teams formed yet.</td>
                    </tr>
                  ) : (
                    teams.map((team) => {
                      const score = team.social_vote_score ?? 0.0
                      const votes = team.social_vote_total_votes ?? 0

                      const teamPolls = polls.filter(p => p.team_id === team.id || (p.poll_type === 'comparative' && p.option_team_mapping && Object.values(p.option_team_mapping).includes(team.id)))
                      const hasFlagged = teamPolls.some(p => p.flagged)

                      return (
                        <tr key={team.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          <td className="px-4 py-3 text-xs font-bold text-gray-800 dark:text-slate-200">
                            {team.name}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                            <div className="flex flex-col gap-1.5">
                              <span className="font-mono">{votes} votes</span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {teamPolls.map(p => {
                                  const platformColor = PLATFORM_COLORS[p.platform]
                                  const pollScore = p.admin_override_score !== null ? p.admin_override_score : (p.normalized_score ?? 0)
                                  const glyph = p.platform === 'twitter' ? '𝕏' : p.platform === 'linkedin' ? 'in' : p.platform === 'instagram' ? 'IG' : 'M'
                                  
                                  let tooltip = `${PLATFORM_LABELS[p.platform]} Poll: `
                                  if (p.status === 'completed') {
                                    tooltip += `Score ${pollScore.toFixed(1)}/10`
                                  } else {
                                    tooltip += `${p.status}`
                                  }
                                  if (p.flagged) {
                                    tooltip += ` [FLAGGED EXCLUDED: ${p.flag_reason}]`
                                  }

                                  return (
                                    <span
                                      key={p.id}
                                      title={tooltip}
                                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black cursor-help border relative ${platformColor.bg} ${platformColor.text} ${platformColor.border}`}
                                    >
                                      {glyph}
                                      {p.flagged && (
                                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                                      )}
                                    </span>
                                  )
                                })}
                                {hasFlagged && (
                                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-extrabold bg-red-500/10 text-red-500 border border-red-500/20 whitespace-nowrap">
                                    Excluded
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 bg-slate-100 dark:bg-slate-850 h-2 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className="h-full bg-orange-500"
                                  style={{ width: `${score * 10}%` }}
                                />
                              </div>
                              <span className="text-xs font-black text-primary font-mono">
                                {score.toFixed(2)}/10
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

        </div>

      </div>

    </div>
  )
}
