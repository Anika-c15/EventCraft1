import React, { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, Trophy, Users, AlertTriangle, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { teamsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'

type TabType = 'cards' | 'leaderboard'

const teamColors = [
  { bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500' },
  { bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500' },
  { bg: 'bg-green-50', border: 'border-green-100', dot: 'bg-green-500' },
  { bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500' },
]

export const Teams: React.FC = () => {
  const { eventId, loadApprovals, loadDashboard, approvals } = useAppContext()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('cards')
  const [teams, setTeams] = useState<any[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [forming, setForming] = useState(false)

  useEffect(() => {
    if (eventId) {
      loadTeams()
      loadLeaderboard()
    }
  }, [eventId])

  const loadTeams = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const data = await teamsApi.list(eventId)
      setTeams(data)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadLeaderboard = async () => {
    if (!eventId) return
    try {
      const data = await teamsApi.leaderboard(eventId)
      setLeaderboard(data)
    } catch {
      setLeaderboard([])
    }
  }

  const handleFormTeams = async () => {
    if (!eventId) return
    setForming(true)
    try {
      await teamsApi.form(eventId)
      await loadTeams()
      await loadLeaderboard()
      await loadApprovals()
      await loadDashboard()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setForming(false)
    }
  }

  const handleClear = async () => {
    if (!eventId || !confirm('Clear all teams and re-form?')) return
    try {
      await teamsApi.clear(eventId)
      setTeams([])
      setLeaderboard([])
      await loadDashboard()
    } catch (e: any) {
      alert(e.message)
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
          <Button variant="secondary" onClick={handleClear}>
            <RefreshCw size={15} />
            Clear &amp; Re-form
          </Button>
          <Button variant="primary" onClick={handleFormTeams} disabled={forming}>
            <Sparkles size={15} />
            {forming ? 'Forming...' : 'Form Teams with AI'}
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {(['cards', 'leaderboard'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'cards' ? 'Team Cards' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-sm text-gray-400">Loading teams...</div>
      )}

      {/* Team Cards */}
      {!loading && activeTab === 'cards' && (
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

      {/* Leaderboard */}
      {!loading && activeTab === 'leaderboard' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Trophy size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900">Team Leaderboard</h3>
            <Badge variant="warning" className="ml-auto">
              {leaderboard.some((t) => t.score !== null) ? 'Live Scores' : 'Scores Pending'}
            </Badge>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Rank', 'Team', 'Members', 'Judges', 'Status', 'Anomaly', 'Score'].map((h) => (
                  <th key={h} className={`text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 ${h === 'Score' ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leaderboard.map((team, idx) => (
                <tr key={team.team_id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                      {idx + 1}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${teamColors[idx % teamColors.length].dot}`} />
                      <span className="font-semibold text-sm text-gray-900">{team.team_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Users size={14} className="text-gray-400" />
                      {team.member_count}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{team.judges_count}</td>
                  <td className="px-5 py-3">
                    <Badge variant="yellow">{team.status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {team.has_anomaly && (
                      <AlertTriangle size={16} className="text-yellow-500" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {team.score !== null ? (
                      <span className="text-sm font-bold text-primary">{team.score}</span>
                    ) : (
                      <span className="text-sm text-gray-400 italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Bar */}
      {teams.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-sm text-gray-600">
              <strong>{teams.length} teams formed</strong>
              {approvals.filter(a => a.status === 'pending' && a.type === 'Team Formation').length > 0
                ? ' — approval pending'
                : ' — approved ✓'}
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
