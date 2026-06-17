import React, { useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Shield } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAppContext } from '../context/AppContext'

const formatDate = (iso: string) => {
  if (!iso) return ''
  let cleanIso = iso.trim()
  if (cleanIso.includes(' ') && !cleanIso.includes('T')) {
    cleanIso = cleanIso.replace(' ', 'T')
  }
  const hasTimezone = /Z$/i.test(cleanIso) || /[+-]\d{2}:?\d{2}$/.test(cleanIso)
  if (!hasTimezone) {
    cleanIso += 'Z'
  }
  const d = new Date(cleanIso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  })
}

const typeVariant = (type: string) => {
  switch (type) {
    case 'Progression': return 'info'
    case 'Team Formation': return 'purple'
    case 'Score Override': return 'warning'
    case 'Rule Change': return 'danger'
    case 'Communication': return 'success'
    case 'Candidate Registration': return 'info'
    default: return 'default'
  }
}

export const Approvals: React.FC = () => {
  const { approvals, loadApprovals, resolveApproval } = useAppContext()

  useEffect(() => {
    loadApprovals()
  }, [])

  const pending = approvals.filter((a) => a.status === 'pending')
  const resolved = approvals.filter((a) => a.status !== 'pending')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pending.length} pending, {resolved.length} resolved
          </p>
        </div>
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          <Shield size={16} className="text-primary" />
          <span className="text-sm font-medium text-primary">
            {pending.length} action{pending.length !== 1 ? 's' : ''} required
          </span>
        </div>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-orange-500" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Pending Action
            </h2>
            <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </div>
          <div className="space-y-4">
            {pending.map((approval: any) => (
              <div
                key={approval.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-primary p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <Badge variant={typeVariant(approval.type) as any}>{approval.type}</Badge>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                    {formatDate(approval.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                  {approval.description}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="danger-outline" size="sm"
                    onClick={() => resolveApproval(approval.id, 'rejected')}>
                    <XCircle size={14} />Reject
                  </Button>
                  <Button variant="primary" size="sm"
                    onClick={() => resolveApproval(approval.id, 'approved')}>
                    <CheckCircle size={14} />Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="mb-8 bg-green-50 border border-green-100 rounded-xl p-6 text-center">
          <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-700">All caught up!</p>
          <p className="text-xs text-green-600 mt-1">No pending approvals at this time.</p>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-gray-400" />
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Resolved</h2>
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
              {resolved.length}
            </span>
          </div>
          <div className="space-y-3">
            {resolved.map((approval: any) => (
              <div key={approval.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 opacity-80">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={typeVariant(approval.type) as any}>{approval.type}</Badge>
                    <Badge variant={approval.status === 'approved' ? 'success' : 'danger'}>
                      {approval.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                    {formatDate(approval.resolved_at || approval.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                  {approval.description}
                </p>
                {approval.resolved_by && (
                  <p className="text-xs text-gray-400 mt-2">
                    Resolved by <span className="font-medium">{approval.resolved_by}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
