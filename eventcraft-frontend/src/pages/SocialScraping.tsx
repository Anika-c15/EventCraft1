import React, { useEffect, useState, useCallback } from 'react'
import {
  Share2, RefreshCw, Trash, Check, ExternalLink, Eye, ShieldAlert,
  BarChart3, Settings2, RotateCcw, Sparkles
} from 'lucide-react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { socialScrapingApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import { useToast, useConfirm } from '../context/ToastAndConfirmContext'
import { SocialConfig, SocialCampaignSummary } from '../types'

export const SocialScraping: React.FC = () => {
  const { eventId, lastWsMessage } = useAppContext()
  const toast = useToast()
  const confirm = useConfirm()

  // --- States ---
  const [config, setConfig] = useState<SocialConfig | null>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [campaignSummary, setCampaignSummary] = useState<SocialCampaignSummary | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [actionScraping, setActionScraping] = useState(false)
  const [actionResetting, setActionResetting] = useState(false)

  // Verification Modal states
  const [selectedPost, setSelectedPost] = useState<any | null>(null)
  const [modalLikes, setModalLikes] = useState<number>(0)
  const [modalShares, setModalShares] = useState<number>(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSubmitting, setModalSubmitting] = useState(false)

  // Screenshot Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Filter states
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // --- Data Loaders ───
  const loadConfig = useCallback(async () => {
    if (!eventId) return
    try {
      const data = await socialScrapingApi.getSocialConfig(eventId)
      setConfig(data)
    } catch (err: any) {
      toast.error(`Failed to load config: ${err.message}`)
    }
  }, [eventId, toast])

  const loadPosts = useCallback(async () => {
    if (!eventId) return
    setLoadingPosts(true)
    try {
      const data = await socialScrapingApi.listAllSocialPosts(eventId)
      setPosts(data)
    } catch (err: any) {
      toast.error(`Failed to load social posts: ${err.message}`)
    } finally {
      setLoadingPosts(false)
    }
  }, [eventId, toast])

  const loadSummary = useCallback(async () => {
    if (!eventId) return
    try {
      const data = await socialScrapingApi.getCampaignSummary(eventId)
      setCampaignSummary(data)
    } catch (err: any) {
      console.error(err)
    }
  }, [eventId])

  const loadAllData = useCallback(() => {
    loadConfig()
    loadPosts()
    loadSummary()
  }, [loadConfig, loadPosts, loadSummary])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // React to WS updates
  useEffect(() => {
    if (lastWsMessage) {
      if (
        lastWsMessage.type === 'social:post_created' ||
        lastWsMessage.type === 'social:post_updated' ||
        lastWsMessage.type === 'social:post_deleted'
      ) {
        loadPosts()
        loadSummary()
      }
    }
  }, [lastWsMessage, loadPosts, loadSummary])

  // --- Actions ---
  const handleScrapeTick = async () => {
    if (!eventId) return
    setActionScraping(true)
    try {
      // We run the tick endpoint: POST /scrape-tick
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/events/${eventId}/social-scraping/scrape-tick`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Scrape tick request failed')
      const result = await res.json()
      toast.success(`Scrape complete! Programmatically updated ${result.scraped_count} pending posts.`)
      loadPosts()
      loadSummary()
    } catch (err: any) {
      toast.error(`Scrape failed: ${err.message}`)
    } finally {
      setActionScraping(false)
    }
  }

  const handleResetCampaign = async () => {
    if (!eventId) return
    const approved = await confirm({
      title: 'Reset Social Advocacy Data?',
      message: 'This will permanently delete all submitted team posts, reset all team social scores to 0.00, and update the event standings. This action cannot be undone.'
    })
    if (!approved) return

    setActionResetting(true)
    try {
      await socialScrapingApi.resetCampaign(eventId)
      toast.success('Social scraping data reset successfully.')
      loadPosts()
      loadSummary()
    } catch (err: any) {
      toast.error(`Reset failed: ${err.message}`)
    } finally {
      setActionResetting(false)
    }
  }

  const handleDeletePost = async (teamId: string, postId: string) => {
    const approved = await confirm({
      title: 'Delete Social Post?',
      message: 'Are you sure you want to delete this submitted link? The team will lose engagement credit for it.'
    })
    if (!approved) return

    try {
      await socialScrapingApi.deleteSocialPost(eventId!, teamId, postId)
      toast.success('Social post deleted.')
      loadPosts()
      loadSummary()
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  const openVerifyModal = (post: any) => {
    setSelectedPost(post)
    setModalLikes(post.likes || 0)
    setModalShares(post.shares || 0)
    setModalOpen(true)
  }

  const handleVerifySubmit = async (approve: boolean) => {
    if (!selectedPost || !eventId) return
    setModalSubmitting(true)
    try {
      await socialScrapingApi.verifyPostManually(eventId, selectedPost.id, {
        likes: modalLikes,
        shares: modalShares,
        approve: approve
      })
      toast.success(approve ? 'Post verification approved!' : 'Post marked as rejected.')
      setModalOpen(false)
      loadPosts()
      loadSummary()
    } catch (err: any) {
      toast.error(`Verification failed: ${err.message}`)
    } finally {
      setModalSubmitting(false)
    }
  }

  // --- Filtering ---
  const filteredPosts = posts.filter(post => {
    const matchPlatform = filterPlatform === 'all' || post.platform === filterPlatform
    const matchStatus = filterStatus === 'all' || post.status === filterStatus
    return matchPlatform && matchStatus
  })

  // Group stats
  const statTotal = posts.length
  const statVerified = posts.filter(p => p.status === 'verified').length
  const statPending = posts.filter(p => p.status === 'pending').length
  const statError = posts.filter(p => p.status === 'fetch_error' || p.status === 'pending_review').length

  if (config && config.social_weight === 0) {
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-100 dark:border-slate-800/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Share2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Social Advocacy Scraping Dashboard</h1>
            <p className="text-xs text-gray-500 mt-1">
              Verify, edit, and consolidate team project launch links and engagement counts.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={handleScrapeTick}
            disabled={actionScraping || posts.length === 0}
            className="flex items-center gap-1.5 bg-primary text-white hover:bg-orange-600 text-xs px-3.5 py-2 font-semibold transition-all"
          >
            <RefreshCw size={14} className={actionScraping ? 'animate-spin' : ''} />
            Scrape Pending Posts
          </Button>
          <Button
            onClick={handleResetCampaign}
            disabled={actionResetting}
            variant="ghost"
            className="flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs px-3.5 py-2 font-semibold transition-all border border-red-100 dark:border-red-950/30"
          >
            <RotateCcw size={14} className={actionResetting ? 'animate-spin' : ''} />
            Reset Data
          </Button>
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border border-gray-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardHeader className="p-0 pb-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Total Submissions</span>
          </CardHeader>
          <CardTitle className="text-2xl font-extrabold text-gray-900 dark:text-white font-mono">{statTotal}</CardTitle>
        </Card>
        <Card className="p-4 border border-gray-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardHeader className="p-0 pb-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Verified Links</span>
          </CardHeader>
          <CardTitle className="text-2xl font-extrabold text-green-600 dark:text-green-400 font-mono">{statVerified}</CardTitle>
        </Card>
        <Card className="p-4 border border-gray-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardHeader className="p-0 pb-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Pending Scrape</span>
          </CardHeader>
          <CardTitle className="text-2xl font-extrabold text-amber-500 dark:text-amber-400 font-mono">{statPending}</CardTitle>
        </Card>
        <Card className="p-4 border border-gray-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardHeader className="p-0 pb-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Errors & Manual Review</span>
          </CardHeader>
          <CardTitle className="text-2xl font-extrabold text-red-500 dark:text-red-400 font-mono">{statError}</CardTitle>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submissions List (Col Span 2) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-50 dark:border-slate-800/60 pb-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Social Post Submissions</h3>
            {/* Filters */}
            <div className="flex items-center gap-2">
              <select
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
                className="text-[11px] bg-slate-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-primary text-gray-700 dark:text-slate-300 font-medium"
              >
                <option value="all">All Platforms</option>
                <option value="twitter">Twitter/X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-[11px] bg-slate-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-primary text-gray-700 dark:text-slate-300 font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="fetch_error">Fetch Error</option>
                <option value="pending_review">Pending Review</option>
                <option value="verification_failed">Verification Failed</option>
              </select>
            </div>
          </div>

          {loadingPosts ? (
            <div className="text-center py-20">
              <RefreshCw size={30} className="animate-spin text-gray-300 mx-auto" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-gray-200 dark:border-slate-800 rounded-lg">
              <p className="text-xs text-gray-400 dark:text-slate-500">No submissions found matching filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800/60 text-gray-400 uppercase text-[10px] font-bold">
                    <th className="py-2.5">Team</th>
                    <th className="py-2.5">Platform</th>
                    <th className="py-2.5">URL</th>
                    <th className="py-2.5 text-center">Likes</th>
                    <th className="py-2.5 text-center">Reposts</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                  {filteredPosts.map((post) => (
                    <tr key={post.id} className="text-gray-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 font-semibold">{post.team_name}</td>
                      <td className="py-3 capitalize font-medium">{post.platform}</td>
                      <td className="py-3 max-w-[150px] truncate">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium flex items-center gap-0.5"
                        >
                          Link <ExternalLink size={10} />
                        </a>
                      </td>
                      <td className="py-3 text-center font-mono font-semibold">{post.likes}</td>
                      <td className="py-3 text-center font-mono font-semibold">{post.shares}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          post.status === 'verified' ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200/50' :
                          post.status === 'fetch_error' ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border border-orange-200/50' :
                          post.status === 'pending_review' ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200/50' :
                          post.status === 'verification_failed' ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50' :
                          'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}>
                          {post.status === 'fetch_error' ? 'Fetch Error' : post.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {post.screenshot_url && (
                            <button
                              onClick={() => setPreviewUrl(post.screenshot_url)}
                              className="text-gray-500 hover:text-gray-700 bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 p-1.5 rounded transition-colors text-[10px] font-bold flex items-center gap-0.5 border border-gray-200/30"
                              title="View screenshot upload proof"
                            >
                              <Eye size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => openVerifyModal(post)}
                            className="text-primary hover:text-orange-700 bg-orange-50/50 dark:bg-orange-950/10 hover:bg-orange-50 p-1.5 rounded transition-colors text-[10px] font-bold flex items-center gap-0.5 border border-orange-200/30"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => handleDeletePost(post.team_id, post.id)}
                            className="text-red-500 hover:text-red-700 bg-red-50/50 dark:bg-red-950/10 hover:bg-red-50 p-1.5 rounded transition-colors text-[10px] font-bold border border-red-200/30"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Scoring Standings (Col Span 1) */}
        <div className="space-y-6">
          {/* Standings List */}
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/80 rounded-xl p-6">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-4 flex items-center gap-1.5">
              <BarChart3 size={16} className="text-primary" />
              Leaderboard Scores
            </h3>

            {campaignSummary?.team_scores && campaignSummary.team_scores.length > 0 ? (
              <div className="space-y-2.5">
                {campaignSummary.team_scores.map((ts: any, idx: number) => (
                  <div
                    key={ts.team_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100/50 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-xs text-gray-400 font-bold w-4">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-xs text-gray-700 dark:text-slate-300 truncate">
                        {ts.team_name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-primary font-mono">{ts.score.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">Posts: {ts.total_votes}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-xs text-gray-400">No score standings calculated yet.</p>
              </div>
            )}
          </div>

          {/* AI Report Card */}
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/80 rounded-xl p-6">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-4 flex items-center gap-1.5">
              <Sparkles size={16} className="text-primary" />
              AI Campaign Summary
            </h3>
            {campaignSummary?.ai_summary ? (
              <div className="prose dark:prose-invert prose-xs text-[11px] text-gray-600 dark:text-slate-400 max-h-[300px] overflow-y-auto leading-relaxed border border-slate-100 dark:border-slate-800/50 rounded-lg p-3 bg-slate-50/30 dark:bg-slate-800/10">
                <div dangerouslySetInnerHTML={{ __html: campaignSummary.ai_summary.replace(/\n/g, '<br />') }} />
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-gray-200 dark:border-slate-800 rounded-lg">
                <p className="text-xs text-gray-400">AI Summary will appear once scores are updated.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verification Dialog Modal */}
      {modalOpen && selectedPost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
              <Settings2 className="text-primary" size={18} />
              <h3 className="font-bold text-base text-gray-900 dark:text-white">Verify Social Submission</h3>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Submitted by: <strong className="text-gray-700 dark:text-slate-300">{selectedPost.team_name}</strong></p>
              <p className="text-xs text-gray-500">URL: <a href={selectedPost.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold break-all flex items-center gap-0.5 inline-flex">{selectedPost.url} <ExternalLink size={10} /></a></p>
            </div>

            {selectedPost.screenshot_url && (
              <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden max-h-[150px] relative group cursor-pointer" onClick={() => setPreviewUrl(selectedPost.screenshot_url)}>
                <img src={selectedPost.screenshot_url} alt="Proof" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
                  Click to Expand Proof
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Verify Likes</label>
                <input
                  type="number"
                  value={modalLikes}
                  onChange={(e) => setModalLikes(parseInt(e.target.value) || 0)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded p-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Verify Reposts/Shares</label>
                <input
                  type="number"
                  value={modalShares}
                  onChange={(e) => setModalShares(parseInt(e.target.value) || 0)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded p-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => setModalOpen(false)}
                variant="secondary"
                className="flex-1 text-xs font-semibold py-2 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleVerifySubmit(false)}
                disabled={modalSubmitting}
                className="flex-1 bg-red-500 text-white hover:bg-red-600 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <ShieldAlert size={12} /> Reject
              </Button>
              <Button
                onClick={() => handleVerifySubmit(true)}
                disabled={modalSubmitting}
                className="flex-1 bg-primary text-white hover:bg-orange-600 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Check size={12} /> Verify Post
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Screenshot Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-3xl w-full p-2 relative animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Expanded proof" className="w-full max-h-[80vh] object-contain rounded-lg" />
            <div className="text-right pt-2 pr-2">
              <Button onClick={() => setPreviewUrl(null)} className="text-xs bg-primary text-white hover:bg-orange-600 px-3 py-1.5 font-semibold">
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
