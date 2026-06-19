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
import { useToast, useConfirm } from '../context/ToastAndConfirmContext'

const stageIcon = (name: string) => {
  if (name.toLowerCase().includes('intake') || name.toLowerCase().includes('participant')) return <UserPlus size={20} />
  if (name.toLowerCase().includes('team') || name.toLowerCase().includes('formation')) return <Users size={20} />
  if (name.toLowerCase().includes('eval')) return <ClipboardList size={20} />
  if (name.toLowerCase().includes('result')) return <Trophy size={20} />
  return <GitBranch size={20} />
}

const formatDate = (iso?: string) => {
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const Pipeline: React.FC = () => {
  const { eventId, loadApprovals, approvals, eventsList, loadEventsList } = useAppContext()
  const currentEvent = eventsList?.find((e: any) => e.id === eventId)
  const isCompleted = currentEvent?.is_completed === true
  const toast = useToast()
  const confirm = useConfirm()
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedStageName, setSelectedStageName] = useState('')
  const [overriding, setOverriding] = useState(false)

  useEffect(() => {
    if (eventId) load()
  }, [eventId])

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const data = await eventsApi.stages(eventId)
      setStages(data)
      const active = data.find((s) => s.status === 'active')
      if (active) setSelectedStageName(active.name)
      else if (data.length > 0) setSelectedStageName(data[0].name)
    } catch { setStages([]) }
    finally { setLoading(false) }
  }

  const handleOverrideStage = async () => {
    if (!eventId || !selectedStageName) return
    setOverriding(true)
    setSuccessMsg('')
    try {
      const res = await eventsApi.setStageDirect(eventId, selectedStageName)
      setSuccessMsg(`Debug: Successfully set pipeline stage to '${res.current_stage}' directly.`)
      toast.success(`Pipeline Stage set to ${res.current_stage}!`)
      await load()
      await loadApprovals()
    } catch (e: any) {
      toast.error(e.message || 'Failed to override stage')
    } finally {
      setOverriding(false)
    }
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
      toast.error('There is already a pending progression approval. Go to the Approvals page and approve it first.')
      return
    }
    setRequesting(true)
    setSuccessMsg('')
    try {
      await eventsApi.advanceStage(eventId)
      await loadApprovals()
      setSuccessMsg('Approval request created. Go to Approvals and click Approve to advance the pipeline.')
      toast.success('Advancement approval request submitted!')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRequesting(false)
    }
  }

  const handleCompleteEvent = async () => {
    if (!eventId) return
    const ok = await confirm({
      title: "Complete & Lock Event?",
      message: "This is the final stage of the pipeline. Advancing will finalize and lock the event as read-only. This will freeze all submissions, scores, voting, and Q&A. Are you sure?",
      type: "warning",
      confirmText: "Yes, Complete Event",
      cancelText: "Cancel",
    });
    if (!ok) return

    try {
      await eventsApi.complete(eventId)
      toast.success('Event has been completed and locked!')
      await loadEventsList()
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to complete event')
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
            {stages.length === 0 ? 'No pipeline configured yet' : `${completedCount} of ${stages.length} stages completed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeStage && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700">Active: {activeStage.name}</span>
            </div>
          )}
          {isLastStage ? (
            <Button
              variant="primary"
              onClick={handleCompleteEvent}
              disabled={isCompleted}
              title={isCompleted ? 'Event is completed and locked' : ''}
            >
              <CheckCircle size={15} />
              {isCompleted ? 'Completed & Locked' : 'Complete & Lock Event'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleRequestAdvance}
              disabled={requesting || hasPendingProgression || isCompleted}
              title={isCompleted ? 'Event is completed and locked' : hasPendingProgression ? 'Approve the pending progression first' : ''}
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
      ) : stages.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-10 text-center max-w-lg mx-auto my-8 shadow-sm">
          <GitBranch size={36} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-1">No Pipeline Configured</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
            This event doesn't have a pipeline yet. Use the <strong>AI Agent</strong> to describe your event and it will automatically configure the full pipeline — stages, team rules, evaluation criteria, and draft communications.
          </p>
        </div>
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
                          disabled={requesting || hasPendingProgression || isCompleted}
                          title={isCompleted ? 'Event is completed and locked' : ''}
                        >
                          <ArrowRight size={13} />
                          Advance
                        </Button>
                      </div>
                    )}
                    {stage.status === 'active' && idx === stages.length - 1 && (
                      <div className="mt-3">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleCompleteEvent}
                          disabled={isCompleted}
                          title={isCompleted ? 'Event is completed and locked' : ''}
                        >
                          <CheckCircle size={13} className="mr-1" />
                          Complete Event
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

          {/* Debug Stage Override Controller */}
          <div className="mt-8 bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              ⚙️ Debug: Pipeline Stage Override
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Directly transition the event stage in the database. This updates stage statuses and broadcasts a WebSocket notification to sync all portals and dashboards instantly.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedStageName}
                onChange={(e) => setSelectedStageName(e.target.value)}
                disabled={isCompleted}
                className="flex-1 max-w-sm border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Select target stage...</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} {s.status === 'active' ? '(Current Active)' : ''}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                onClick={handleOverrideStage}
                disabled={overriding || !selectedStageName || isCompleted}
                className="hover:bg-gray-100"
              >
                {overriding ? 'Overriding...' : 'Override Active Phase'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
