import React, { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, ArrowRight, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { teamsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import { useToast, useConfirm } from '../context/ToastAndConfirmContext'

const teamColors = [
  { bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500' },
  { bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500' },
  { bg: 'bg-green-50', border: 'border-green-100', dot: 'bg-green-500' },
  { bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500' },
]

export const Teams: React.FC = () => {
  const { eventId, loadApprovals, loadDashboard, approvals, dashboardStats } = useAppContext()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [forming, setForming] = useState(false)

  useEffect(() => {
    if (eventId) loadTeams()
  }, [eventId])

  // Lock formation controls once stage has advanced past Team Formation (index > 1)
  // or once any team is approved
  const stageIndex = dashboardStats?.current_stage_index ?? 0
  const teamsApproved = teams.some(t => t.status === 'Approved' || t.status === 'Active')
  const formationLocked = stageIndex > 1 || teamsApproved

  const loadTeams = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const data = await teamsApi.list(eventId)
      setTeams(data)
    } catch (e: any) {
      toast.error(e.message || 'Error loading teams')
    } finally {
      setLoading(false)
    }
  }

  const handleFormTeams = async () => {
    if (!eventId) return
    setForming(true)
    try {
      await teamsApi.form(eventId)
      await loadTeams()
      await loadApprovals()
      await loadDashboard()
      toast.success('Teams formed with AI successfully!')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setForming(false)
    }
  }

  const handleClear = async () => {
    if (!eventId) return
    const confirmed = await confirm({
      title: 'Clear Teams',
      message: 'Are you sure you want to clear all teams? Any currently generated team compositions will be removed.',
      confirmText: 'Clear Teams',
      type: 'danger'
    })
    if (!confirmed) return
    try {
      await teamsApi.clear(eventId)
      setTeams([])
      await loadDashboard()
      toast.success('Teams cleared successfully')
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  return (
    <div className="pb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="text-sm text-gray-500 mt-0.5">{teams.length} teams formed</p>
        </div>
        <div className="flex items-center gap-2">
          {formationLocked ? (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg flex items-center gap-1.5">
              <CheckCircle size={13} className="text-green-500" /> Teams locked — formation complete
            </span>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClear}>
                <RefreshCw size={15} />
                Clear &amp; Re-form
              </Button>
              <Button variant="primary" onClick={handleFormTeams} disabled={forming}>
                <Sparkles size={15} />
                {forming ? 'Forming...' : 'Form Teams with AI'}
              </Button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-sm text-gray-400">Loading teams...</div>
      )}

      {/* Team Cards */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {teams.length === 0 ? (
            <div className="col-span-2 text-center py-16 text-gray-400">
              <Sparkles size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">No teams yet</p>
              <p className="text-xs mt-1">Click "Form Teams with AI" to get started</p>
            </div>
          ) : (
            teams.map((team, idx) => {
              const color = teamColors[idx % teamColors.length]
              return (
                <Card key={team.id} className="flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                      <h3 className="text-base font-bold text-gray-900">{team.name}</h3>
                    </div>
                    <Badge variant="yellow">{team.status}</Badge>
                  </div>

                  <div className={`rounded-lg p-3 mb-3 ${color.bg} border ${color.border}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Members ({(team.members || []).length})
                    </p>
                    <div className="space-y-1.5">
                      {(team.members || []).map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{m.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{m.institution}</span>
                          </div>
                          <div className="flex gap-1">
                            {(m.skills || []).slice(0, 2).map((s: string) => (
                              <span key={s} className="text-xs px-1.5 py-0.5 bg-white rounded text-gray-600 border border-gray-200">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      AI Rationale
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {team.rationale || 'Generating rationale...'}
                    </p>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* Bottom Bar — only while Team Formation approval is pending */}
      {teams.length > 0 && approvals.filter(a => a.status === 'pending' && a.type === 'Team Formation').length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-sm text-gray-600">
              <strong>{teams.length} teams formed</strong> — approval pending
            </span>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/approvals')}>
            <ArrowRight size={14} />
            View Approvals
          </Button>
        </div>
      )}
    </div>
  )
}
