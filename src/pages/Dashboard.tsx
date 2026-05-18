import React from 'react'
import { Users, UserCheck, ShieldAlert, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { activityLog, participants, teams } from '../data/mockData'
import { useAppContext } from '../context/AppContext'

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const formatRelative = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export const Dashboard: React.FC = () => {
  const { appApprovals, resolveApproval } = useAppContext()

  const pendingApprovals = appApprovals.filter((a) => a.status === 'pending')
  const formedTeams = teams.length

  const today = new Date('2026-05-15T23:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
            <span className="text-sm text-gray-500">Current Stage: Team Formation</span>
          </div>
        </div>
        <div className="text-sm text-gray-500">{today}</div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Participants */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Participants
              </p>
              <p className="text-3xl font-bold text-gray-900">{participants.length}</p>
              <p className="text-xs text-gray-400 mt-1">registered</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <UserCheck size={20} className="text-blue-500" />
            </div>
          </div>
        </div>

        {/* Teams */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Teams Formed
              </p>
              <p className="text-3xl font-bold text-gray-900">{formedTeams}</p>
              <p className="text-xs text-gray-400 mt-1">Formation pending</p>
            </div>
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-purple-500" />
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-orange-200 ring-1 ring-orange-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Pending Approvals
              </p>
              <p className="text-3xl font-bold text-primary">{pendingApprovals.length}</p>
              <p className="text-xs text-primary font-medium mt-1">Action required</p>
            </div>
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <ShieldAlert size={20} className="text-primary" />
            </div>
          </div>
        </div>

        {/* Anomaly Flags */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Anomaly Flags
              </p>
              <p className="text-3xl font-bold text-gray-900">0</p>
              <p className="text-xs text-gray-400 mt-1">In evaluations</p>
            </div>
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
              <AlertTriangle size={20} className="text-yellow-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <Badge variant="primary">{pendingApprovals.length} pending</Badge>
          </CardHeader>
          <div className="space-y-3">
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No pending approvals</p>
            ) : (
              pendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant={
                        approval.type === 'Progression' ? 'info' : 'purple'
                      }
                    >
                      {approval.type}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {formatDate(approval.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {approval.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger-outline"
                      size="sm"
                      onClick={() => resolveApproval(approval.id, 'rejected')}
                    >
                      <XCircle size={14} />
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => resolveApproval(approval.id, 'approved')}
                    >
                      <CheckCircle size={14} />
                      Approve
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* System Activity */}
        <Card>
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {activityLog.map((log) => (
              <div key={log.id} className="flex items-start gap-3">
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    log.type === 'success'
                      ? 'bg-green-500'
                      : log.type === 'warning'
                      ? 'bg-yellow-500'
                      : log.type === 'error'
                      ? 'bg-red-500'
                      : 'bg-blue-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{log.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatRelative(log.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
