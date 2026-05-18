import React, { useState } from 'react'
import { Sparkles, RefreshCw, Trophy, Users } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { teams, participants } from '../data/mockData'

type TabType = 'cards' | 'leaderboard'

const teamColors = [
  { bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500', text: 'text-blue-700' },
  { bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500', text: 'text-purple-700' },
  { bg: 'bg-green-50', border: 'border-green-100', dot: 'bg-green-500', text: 'text-green-700' },
  { bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500', text: 'text-orange-700' },
]

export const Teams: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('cards')

  const getMembers = (memberIds: string[]) =>
    participants.filter((p) => memberIds.includes(p.id))

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="text-sm text-gray-500 mt-0.5">{teams.length} teams formed</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <RefreshCw size={15} />
            Clear &amp; Re-form
          </Button>
          <Button variant="primary">
            <Sparkles size={15} />
            Form Teams with AI
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        <button
          onClick={() => setActiveTab('cards')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            activeTab === 'cards'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Team Cards
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            activeTab === 'leaderboard'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Leaderboard
        </button>
      </div>

      {/* Team Cards */}
      {activeTab === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {teams.map((team, idx) => {
            const color = teamColors[idx % teamColors.length]
            const members = getMembers(team.memberIds)
            return (
              <Card key={team.id} className="flex flex-col">
                {/* Team Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                    <h3 className="text-base font-bold text-gray-900">{team.name}</h3>
                  </div>
                  <Badge variant="yellow">{team.status}</Badge>
                </div>

                {/* Members */}
                <div className={`rounded-lg p-3 mb-3 ${color.bg} border ${color.border}`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Members ({members.length})
                  </p>
                  <div className="space-y-1.5">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{m.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{m.institution}</span>
                        </div>
                        <div className="flex gap-1">
                          {m.skills.slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className="text-xs px-1.5 py-0.5 bg-white rounded text-gray-600 border border-gray-200"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rationale */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    AI Rationale
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">{team.rationale}</p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Leaderboard */}
      {activeTab === 'leaderboard' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Trophy size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900">Team Leaderboard</h3>
            <Badge variant="warning" className="ml-auto">Scores Pending</Badge>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Rank
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Team
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Members
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Status
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-right">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {teams.map((team, idx) => {
                const members = getMembers(team.memberIds)
                return (
                  <tr key={team.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                        {idx + 1}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${teamColors[idx % teamColors.length].dot}`} />
                        <span className="font-semibold text-sm text-gray-900">{team.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Users size={14} className="text-gray-400" />
                        {members.length} members
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="yellow">{team.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm text-gray-400 italic">—</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between z-10" style={{ paddingLeft: 'calc(var(--sidebar-width, 240px) + 24px)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-sm text-gray-600">
            <strong>{teams.length} teams formed</strong> — approval pending
          </span>
        </div>
        <Button variant="primary" size="sm">
          Submit for Approval
        </Button>
      </div>
    </div>
  )
}
