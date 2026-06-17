import React, { useEffect, useState } from 'react'
import { Users, UserCheck, ShieldAlert, AlertTriangle, CheckCircle, XCircle, ArrowRight, Bell, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatCardSkeleton, CardItemSkeleton } from '../components/ui/Skeleton'
import { useAppContext } from '../context/AppContext'

const formatDate = (iso: string) => {
  if (!iso) return ''
  let cleanIso = iso.trim()
  if (cleanIso.includes(' ') && !cleanIso.includes('T')) {
    cleanIso = cleanIso.replace(' ', 'T')
  }
  if (!cleanIso.endsWith('Z') && !cleanIso.includes('+') && !cleanIso.includes('-')) {
    cleanIso += 'Z'
  }
  const d = new Date(cleanIso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

/** Generate the exact scenario message shown in the spec for each approval type */
function approvalScenarioMessage(approval: any, stats: any): string {
  const type: string = approval.type || ''
  const desc: string = approval.description || ''

  if (type === 'Team Formation') {
    const total = stats?.total_participants ?? 0
    const teams = stats?.teams_formed ?? 0
    return `${total} participants loaded. ${teams} team compositions generated — awaiting your approval before assignments are communicated.`
  }
  if (type === 'Score Override') {
    // Extract numbers from description if present
    const judgeMatch = desc.match(/submitted ([\d.]+)\/10/)
    const panelMatch = desc.match(/panel average of ([\d.]+)\/10/)
    const teamMatch  = desc.match(/for (.+?)\. Judge/)
    if (judgeMatch && panelMatch && teamMatch) {
      return `Evaluator score for ${teamMatch[1]} is ${judgeMatch[1]} vs panel average of ${panelMatch[1]}. Anomaly flagged. Results are on hold until you review this divergence.`
    }
  }
  if (type === 'Progression' && desc.toLowerCase().includes('top')) {
    const topMatch = desc.match(/top (\d+) teams/)
    const n = topMatch ? topMatch[1] : '5'
    return `All evaluator scores received. Consolidation complete using configured weights. Progression invitations drafted for the top ${n} teams — approve to send.`
  }
  if (type === 'Progression' && desc.toLowerCase().includes('advance')) {
    return desc
  }
  return desc
}

const typeVariant = (type: string) => {
  switch (type) {
    case 'Progression':    return 'info'
    case 'Team Formation': return 'purple'
    case 'Score Override': return 'warning'
    case 'Rule Change':    return 'danger'
    case 'Communication':  return 'success'
    default:               return 'default'
  }
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const {
    eventId, createEvent,
    approvals, loadApprovals, resolveApproval,
    dashboardStats, loadDashboard,
    activityLog, loadActivityLog,
    lastWsMessage,
  } = useAppContext()

  const [approvalBanner, setApprovalBanner] = useState<string | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [approvalsLoading, setApprovalsLoading] = useState(true)

  // Form states for creating a new event when none are active
  const [newEventName, setNewEventName] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) {
      setStatsLoading(false)
      setApprovalsLoading(false)
      return
    }
    setStatsLoading(true)
    setApprovalsLoading(true)
    Promise.all([
      loadDashboard(),
      loadApprovals(),
      loadActivityLog(),
    ]).finally(() => {
      setStatsLoading(false)
      setApprovalsLoading(false)
    })
  }, [eventId])

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEventName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await createEvent(newEventName.trim(), newEventDesc.trim())
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create event space')
    } finally {
      setCreating(false)
    }
  }

  // Show banner when new approval arrives via WebSocket
  useEffect(() => {
    if (!lastWsMessage) return
    if (
      lastWsMessage.type === 'approval_created' ||
      lastWsMessage.type === 'approval_resolved' ||
      lastWsMessage.type === 'stage_advanced' ||
      lastWsMessage.type === 'rationales_ready'
    ) {
      loadApprovals()
      loadDashboard()
      loadActivityLog()
    }
    if (lastWsMessage.type === 'approval_created') {
      setApprovalBanner(lastWsMessage.description || 'A new approval requires your attention.')
    }
    if (lastWsMessage.type === 'approval_resolved') {
      if (lastWsMessage.pending_count > 0) {
        setApprovalBanner(`${lastWsMessage.pending_count} approval${lastWsMessage.pending_count > 1 ? 's' : ''} still pending.`)
      } else {
        setApprovalBanner(null)
      }
    }
  }, [lastWsMessage])

  const pendingApprovals = approvals.filter((a) => a.status === 'pending')
  const stats = dashboardStats

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  if (!eventId) {
    return (
      <div className="max-w-md mx-auto my-12">
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/30 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-orange-100 dark:border-orange-900/30">
              <Bell size={24} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Create an Event Space</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              You do not currently own any active event spaces. Please name your event to create a brand new space.
            </p>
          </div>

          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                Event Name *
              </label>
              <input
                type="text"
                required
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="e.g., EventCraft Hackathon 2026"
                className="w-full border border-gray-200 dark:border-slate-850 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white placeholder-gray-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                Description <span className="font-normal text-gray-400 dark:text-slate-600">(optional)</span>
              </label>
              <textarea
                value={newEventDesc}
                onChange={(e) => setNewEventDesc(e.target.value)}
                placeholder="Brief description of the event format..."
                rows={3}
                className="w-full border border-gray-200 dark:border-slate-850 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white placeholder-gray-400 transition-all resize-none"
              />
            </div>

            {createError && (
              <p className="text-xs font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/30">
                ⚠️ {createError}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center py-2.5 rounded-xl text-sm font-bold shadow-md shadow-orange-500/10 hover:shadow-orange-500/20 active:translate-y-0.5 transition-all"
              disabled={creating || !newEventName.trim()}
            >
              {creating ? 'Creating Event...' : 'Create Event Space'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
            <span className="text-sm text-gray-500 dark:text-slate-400">
              Current Stage:{' '}
              <span className="font-medium text-gray-700 dark:text-slate-200">{stats?.current_stage ?? '—'}</span>
            </span>
          </div>
        </div>
        <div className="text-sm text-gray-500 dark:text-slate-400">{today}</div>
      </div>

      {/* ── Approval notification banner ── */}
      {approvalBanner && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-primary flex-shrink-0" />
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">{approvalBanner}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/approvals')}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View Approvals →
            </button>
            <button onClick={() => setApprovalBanner(null)} className="text-orange-400 hover:text-orange-600">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>

        {/* Participants */}
        <div
          className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-800 cursor-pointer hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
          onClick={() => navigate('/participants')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-1">Participants</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.total_participants ?? '—'}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">registered in roster</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex items-center justify-center">
              <UserCheck size={20} className="text-blue-500" />
            </div>
          </div>
        </div>

        {/* Teams */}
        <div
          className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-800 cursor-pointer hover:border-purple-200 dark:hover:border-purple-800 transition-colors"
          onClick={() => navigate('/teams')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-1">Teams Formed</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.teams_formed ?? '—'}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {!stats?.teams_formed
                  ? 'Not yet formed'
                  : (stats?.current_stage_index ?? 0) >= 2
                  ? 'Active ✓'
                  : (stats?.pending_approvals ?? 0) > 0
                  ? 'Awaiting approval'
                  : 'Approved ✓'}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/30 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-purple-500" />
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div
          className={`bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border cursor-pointer transition-colors ${
            (stats?.pending_approvals ?? 0) > 0
              ? 'border-orange-200 dark:border-orange-950 ring-1 ring-orange-100 dark:ring-orange-950/20 hover:border-orange-300 dark:hover:border-orange-850'
              : 'border-gray-100 dark:border-slate-800 hover:border-gray-200 dark:hover:border-slate-700'
          }`}
          onClick={() => navigate('/approvals')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-1">Pending Approvals</p>
              <p className="text-3xl font-bold text-primary">{stats?.pending_approvals ?? '—'}</p>
              <p className="text-xs text-primary font-medium mt-1">
                {(stats?.pending_approvals ?? 0) > 0 ? 'Action required' : 'All clear'}
              </p>
            </div>
            <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/30 rounded-lg flex items-center justify-center">
              <ShieldAlert size={20} className="text-primary" />
            </div>
          </div>
        </div>

        {/* Anomaly Flags */}
        <div
          className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-800 cursor-pointer hover:border-yellow-200 dark:hover:border-yellow-800 transition-colors"
          onClick={() => navigate('/evaluations')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-1">Anomaly Flags</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.anomaly_flags ?? '—'}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">In evaluations</p>
            </div>
            <div className="w-10 h-10 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg flex items-center justify-center">
              <AlertTriangle size={20} className="text-yellow-500" />
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      {/* ── Bottom Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pending Approvals Card */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <div className="flex items-center gap-2">
              {pendingApprovals.length > 0 && (
                <Badge variant="primary">{pendingApprovals.length}</Badge>
              )}
              <button
                onClick={() => navigate('/approvals')}
                className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
              >
                View all <ArrowRight size={11} />
              </button>
            </div>
          </CardHeader>
          <div className="space-y-3">
            {approvalsLoading ? (
              <CardItemSkeleton count={2} />
            ) : pendingApprovals.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <CheckCircle size={28} className="text-green-400 mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">No pending approvals</p>
              </div>
            ) : (
              pendingApprovals.slice(0, 3).map((approval: any) => (
                <div
                  key={approval.id}
                  className="border border-gray-100 dark:border-slate-800 rounded-xl p-4 hover:border-orange-200 dark:hover:border-orange-900 transition-colors bg-white dark:bg-slate-900/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={typeVariant(approval.type) as any}>{approval.type}</Badge>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(approval.created_at)}</span>
                  </div>
                  {/* Spec scenario message */}
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 line-clamp-3">
                    {approvalScenarioMessage(approval, stats)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="danger-outline" size="sm"
                      onClick={() => resolveApproval(approval.id, 'rejected')}>
                      <XCircle size={14} /> Reject
                    </Button>
                    <Button variant="primary" size="sm"
                      onClick={() => resolveApproval(approval.id, 'approved')}>
                      <CheckCircle size={14} /> Approve
                    </Button>
                  </div>
                </div>
              ))
            )}
            {pendingApprovals.length > 3 && (
              <button
                onClick={() => navigate('/approvals')}
                className="w-full text-center text-xs text-primary hover:underline py-2 cursor-pointer bg-transparent border-none"
              >
                +{pendingApprovals.length - 3} more — view all approvals
              </button>
            )}
          </div>
        </Card>

        {/* System Activity */}
        <Card>
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <button onClick={loadActivityLog} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer bg-transparent border-none p-0">
              Refresh
            </button>
          </CardHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activityLog.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">No activity yet</p>
            ) : (
              activityLog.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    log.log_type === 'success' ? 'bg-green-500'
                    : log.log_type === 'warning' ? 'bg-yellow-500'
                    : log.log_type === 'error'   ? 'bg-red-500'
                    : 'bg-blue-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-slate-300">{log.message}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(log.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
