import React, { useEffect } from 'react'
import { Users, UserCheck, ShieldAlert, AlertTriangle, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAppContext } from '../context/AppContext'

const formatDate = (iso: string) => {
  const d = new Date(iso)
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
    approvals, loadApprovals, resolveApproval,
    dashboardStats, loadDashboard,
    activityLog, loadActivityLog,
  } = useAppContext()

  useEffect(() => {
    loadDashboard()
    loadApprovals()
    loadActivityLog()
  }, [])

  const pendingApprovals = approvals.filter((a) => a.status === 'pending')
  const stats = dashboardStats

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
            <span className="text-sm text-gray-500">
              Current Stage:{' '}
              <span className="font-medium text-gray-700">{stats?.current_stage ?? '—'}</span>
            </span>
          </div>
        </div>
        <div className="text-sm text-gray-500">{today}</div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Participants */}
        <div
          className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-200 transition-colors"
          onClick={() => navigate('/participants')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Participants</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.total_participants ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-1">registered in roster</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <UserCheck size={20} className="text-blue-500" />
            </div>
          </div>
        </div>

        {/* Teams */}
        <div
          className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-purple-200 transition-colors"
          onClick={() => navigate('/teams')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Teams Formed</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.teams_formed ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats?.teams_formed ? 'Formation pending' : 'Not yet formed'}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-purple-500" />
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div
          className={`bg-white rounded-xl p-5 shadow-sm border cursor-pointer transition-colors ${
            (stats?.pending_approvals ?? 0) > 0
              ? 'border-orange-200 ring-1 ring-orange-100 hover:border-orange-300'
              : 'border-gray-100 hover:border-gray-200'
          }`}
          onClick={() => navigate('/approvals')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Pending Approvals</p>
              <p className="text-3xl font-bold text-primary">{stats?.pending_approvals ?? '—'}</p>
              <p className="text-xs text-primary font-medium mt-1">
                {(stats?.pending_approvals ?? 0) > 0 ? 'Action required' : 'All clear'}
              </p>
            </div>
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <ShieldAlert size={20} className="text-primary" />
            </div>
          </div>
        </div>

        {/* Anomaly Flags */}
        <div
          className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-yellow-200 transition-colors"
          onClick={() => navigate('/evaluations')}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Anomaly Flags</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.anomaly_flags ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-1">In evaluations</p>
            </div>
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
              <AlertTriangle size={20} className="text-yellow-500" />
            </div>
          </div>
        </div>
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
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight size={11} />
              </button>
            </div>
          </CardHeader>
          <div className="space-y-3">
            {pendingApprovals.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <CheckCircle size={28} className="text-green-400 mb-2" />
                <p className="text-sm text-gray-400">No pending approvals</p>
              </div>
            ) : (
              pendingApprovals.slice(0, 3).map((approval: any) => (
                <div
                  key={approval.id}
                  className="border border-gray-100 rounded-xl p-4 hover:border-orange-200 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={typeVariant(approval.type) as any}>{approval.type}</Badge>
                    <span className="text-xs text-gray-400">{formatDate(approval.created_at)}</span>
                  </div>
                  {/* Spec scenario message */}
                  <p className="text-sm text-gray-600 mb-3 line-clamp-3">
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
                className="w-full text-center text-xs text-primary hover:underline py-2"
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
            <button onClick={loadActivityLog} className="text-xs text-gray-400 hover:text-gray-600">
              Refresh
            </button>
          </CardHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activityLog.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No activity yet</p>
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
                    <p className="text-sm text-gray-700">{log.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.created_at)}</p>
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
