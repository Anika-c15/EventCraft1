import React, { useState, useEffect } from 'react'
import {
  CheckCircle, Circle, Clock, Users, ClipboardList,
  Trophy, GitBranch, UserPlus, ArrowRight, AlertTriangle, Shield,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { eventsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'

const stageIcon = (name: string) => {
  if (name.toLowerCase().includes('intake') || name.toLowerCase().includes('participant')) return <UserPlus size={20} />
  if (name.toLowerCase().includes('team') || name.toLowerCase().includes('formation')) return <Users size={20} />
  if (name.toLowerCase().includes('eval')) return <ClipboardList size={20} />
  if (name.toLowerCase().includes('result')) return <Trophy size={20} />
  return <GitBranch size={20} />
}

const formatDate = (iso?: string) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const Pipeline: React.FC = () => {
  const { eventId, loadApprovals, approvals } = useAppContext()
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (eventId) load()
  }, [eventId])

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const data = await eventsApi.stages(eventId)
      setStages(data)
    } catch { setStages([]) }
    finally { setLoading(false) }
  }

  // Count pending progression approvals — must be 0 before requesting another
  const pendingProgressionApprovals = approvals.filter(
    (a) => a.status === 'pending' && a.type === 'Progression'
  )
  const hasPendingProgression = pendingProgressionApprovals.length > 0

  // Request gated stage advancement — creates an approval item
  const handleRequestAdvance = async () => {
    if (!eventId) return
    if (hasPendingProgression) {
      alert('There is already a pending progression approval. Go to the Approvals page and approve it first.')
      return
    }
    setRequesting(true)
    setSuccessMsg('')
    try {
      await eventsApi.advanceStage(eventId)
      await loadApprovals()
      setSuccessMsg('Approval request created. Go to Approvals and click Approve to advance the pipeline.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setRequesting(false)
    }
  }

  const completedCount = stages.filter((s) => s.status === 'completed').length
  const activeStage = stages.find((s) => s.status === 'active')
  const isLastStage = stages.length > 0 && completedCount === stages.length - 1 &&
    stages[stages.length - 1]?.status === 'active'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {completedCount} of {stages.length} stages completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeStage && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700">Active: {activeStage.name}</span>
            </div>
          )}
          {!isLastStage && (
            <Button
              variant="primary"
              onClick={handleRequestAdvance}
              disabled={requesting || hasPendingProgression}
              title={hasPendingProgression ? 'Approve the pending progression first' : ''}
            >
              <Shield size={15} />
              {requesting ? 'Requesting...' : 'Request Stage Advance'}
            </Button>
          )}
        </div>
      </div>

      {/* Pending progression warning */}
      {hasPendingProgression && (
        <div className="mb-5 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-primary">Progression approval pending</p>
            <p className="text-sm text-orange-700 mt-0.5">
              A stage advancement request is waiting for committee approval.
              Go to the <strong>Approvals</strong> page and click <strong>Approve</strong> to advance the pipeline.
            </p>
          </div>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{successMsg}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading pipeline...</div>
      ) : (
        <>
          {/* Visual Pipeline */}
          <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
            {stages.map((stage, idx) => (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center min-w-[120px]">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                    stage.status === 'completed'
                      ? 'bg-green-500 border-green-500 text-white'
                      : stage.status === 'active'
                      ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}>
                    {stage.status === 'completed' ? <CheckCircle size={22} />
                     : stage.status === 'active' ? stageIcon(stage.name)
                     : <Circle size={22} />}
                  </div>
                  <div className="mt-2 text-center">
                    <p className={`text-xs font-semibold ${
                      stage.status === 'active' ? 'text-primary'
                      : stage.status === 'completed' ? 'text-green-600'
                      : 'text-gray-400'
                    }`}>{stage.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {stage.status === 'completed' ? formatDate(stage.completed_at)
                       : stage.status === 'active' ? 'In Progress' : 'Pending'}
                    </p>
                  </div>
                </div>
                {idx < stages.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 min-w-[30px] ${
                    stage.status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Stage Cards */}
          <div className="space-y-4">
            {stages.map((stage, idx) => (
              <Card key={stage.id} className={`border-l-4 ${
                stage.status === 'completed' ? 'border-l-green-500'
                : stage.status === 'active' ? 'border-l-primary'
                : 'border-l-gray-200'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      stage.status === 'completed' ? 'bg-green-50 text-green-600'
                      : stage.status === 'active' ? 'bg-orange-50 text-primary'
                      : 'bg-gray-50 text-gray-400'
                    }`}>
                      {stageIcon(stage.name)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                        <Badge variant={
                          stage.status === 'completed' ? 'success'
                          : stage.status === 'active' ? 'primary'
                          : 'gray'
                        }>
                          {stage.status === 'completed' ? 'Completed'
                           : stage.status === 'active' ? 'Active'
                           : 'Pending'}
                        </Badge>
                        {stage.status === 'active' && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{stage.description}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(stage.tasks || []).map((task: string, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            {stage.status === 'completed' ? (
                              <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                            ) : stage.status === 'active' && i < 2 ? (
                              <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                            ) : stage.status === 'active' ? (
                              <Clock size={13} className="text-yellow-500 flex-shrink-0" />
                            ) : (
                              <Circle size={13} className="text-gray-300 flex-shrink-0" />
                            )}
                            <span className={`text-xs ${
                              stage.status === 'completed' || (stage.status === 'active' && i < 2)
                                ? 'text-gray-600' : 'text-gray-400'
                            }`}>
                              {task}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    {stage.completed_at && (
                      <div>
                        <p className="text-xs text-gray-400">Completed</p>
                        <p className="text-xs font-medium text-gray-600">{formatDate(stage.completed_at)}</p>
                      </div>
                    )}
                    {stage.started_at && !stage.completed_at && (
                      <div>
                        <p className="text-xs text-gray-400">Started</p>
                        <p className="text-xs font-medium text-gray-600">{formatDate(stage.started_at)}</p>
                      </div>
                    )}
                    {/* Show advance button inline on active stage card */}
                    {stage.status === 'active' && idx < stages.length - 1 && (
                      <div className="mt-3">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleRequestAdvance}
                          disabled={requesting || hasPendingProgression}
                        >
                          <ArrowRight size={13} />
                          Advance
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Progress bar */}
          {stages.length > 0 && (
            <div className="mt-6 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Overall Progress</h3>
                <span className="text-sm font-bold text-primary">
                  {Math.round((completedCount / stages.length) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / stages.length) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>{completedCount} completed</span>
                <span>{stages.length - completedCount} remaining</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
