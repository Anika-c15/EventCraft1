import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  User, Mail, Building, Users, Calendar,
  ArrowLeft, Award, CheckCircle, Clock, Star,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { participantsApi } from '../api/client'

const levelVariant = (level: string) => {
  switch (level) {
    case 'Beginner': return 'info'
    case 'Intermediate': return 'success'
    case 'Advanced': return 'warning'
    case 'Expert': return 'danger'
    default: return 'default'
  }
}

export const ParticipantPortal: React.FC = () => {
  const { id: token } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const eventId = searchParams.get('event')

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !eventId) {
      setError('Invalid portal link — missing event or token.')
      setLoading(false)
      return
    }
    participantsApi.portal(eventId, token)
      .then(setData)
      .catch((e) => setError(e.message || 'Could not load portal'))
      .finally(() => setLoading(false))
  }, [token, eventId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={28} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Portal Not Found</h2>
          <p className="text-gray-500 mb-4 text-sm">{error || 'Invalid portal link.'}</p>
          <Link to="/" className="text-primary font-medium hover:underline flex items-center gap-1 justify-center">
            <ArrowLeft size={14} />Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const { participant, team, current_stage, key_dates, event_name, progression_eligible } = data
  const teammates = (team?.members || []).filter((m: any) => m.id !== participant.id)

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">EC</span>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">EventCraft</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">Participant Portal</div>
            </div>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Read-only view</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-primary to-orange-400 rounded-2xl p-6 text-white mb-6">
          <p className="text-sm font-medium opacity-80 mb-1">Welcome back,</p>
          <h1 className="text-2xl font-bold mb-1">{participant.name}</h1>
          <p className="text-sm opacity-80">{participant.email}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
            <span className="text-sm font-medium">{event_name} — Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Profile */}
          <div className="md:col-span-1 space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-lg">{participant.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{participant.name}</p>
                  <Badge variant={levelVariant(participant.level) as any} className="mt-0.5">
                    {participant.level}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate">{participant.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building size={14} className="text-gray-400 flex-shrink-0" />
                  <span>{participant.institution || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Award size={14} className="text-gray-400 flex-shrink-0" />
                  <span>{participant.level} Level</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {(participant.skills || []).map((skill: string) => (
                    <span key={skill} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status</p>
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-500" />
                <span className="text-sm font-semibold text-green-700">{participant.status}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Registered {new Date(participant.registered_at).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </p>
            </div>

            {/* Progression */}
            {progression_eligible && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Star size={18} className="text-green-600" />
                  <p className="text-sm font-bold text-green-800">Progression Eligible!</p>
                </div>
                <p className="text-xs text-green-700">
                  Your team has qualified for the next round. Await official confirmation from the committee.
                </p>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="md:col-span-2 space-y-5">
            {/* Current Stage */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h2 className="font-semibold text-gray-900">Current Event Stage</h2>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                <p className="text-sm font-bold text-primary">{current_stage || 'Participant Intake'}</p>
                <p className="text-xs text-orange-700 mt-1">
                  {current_stage === 'Team Formation'
                    ? 'Teams are being formed. You\'ll receive an email once your team assignment is confirmed.'
                    : current_stage === 'Evaluation'
                    ? 'Evaluation is underway. Judges are reviewing all team submissions.'
                    : current_stage === 'Results'
                    ? 'Results are being compiled. Final rankings will be announced soon.'
                    : current_stage === 'Progression'
                    ? 'Qualifying teams are being notified for the next round.'
                    : 'Registration is open. Your profile has been received.'}
                </p>
              </div>
            </div>

            {/* Team Assignment */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-primary" />
                <h2 className="font-semibold text-gray-900">Team Assignment</h2>
              </div>
              {team ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-bold text-gray-900">{team.name}</h3>
                    <Badge variant="yellow">{team.status}</Badge>
                  </div>
                  {team.rationale && !team.rationale.startsWith('[') && (
                    <p className="text-sm text-gray-600 mb-4 leading-relaxed line-clamp-3">
                      {team.rationale}
                    </p>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Your Teammates
                    </p>
                    <div className="space-y-2">
                      {teammates.map((tm: any) => (
                        <div key={tm.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center">
                              <span className="text-primary text-xs font-bold">{tm.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{tm.name}</p>
                              <p className="text-xs text-gray-500">{tm.institution}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {(tm.skills || []).slice(0, 2).map((s: string) => (
                              <span key={s} className="text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Clock size={28} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Team assignment pending</p>
                  <p className="text-xs text-gray-400 mt-1">You'll be notified once teams are formed and approved</p>
                </div>
              )}
            </div>

            {/* Final Scoring & Rationale Card */}
            {team && team.final_score !== null && team.final_score !== undefined && (() => {
              const publicVote = team.public_vote_score;
              let judgeAvg = team.final_score;
              if (publicVote !== null && publicVote !== undefined) {
                judgeAvg = (team.final_score - 0.30 * publicVote) / 0.70;
              }
              return (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-purple-100 pb-3">
                    <h3 className="text-sm font-bold text-purple-950 uppercase tracking-wider">Final Balanced Result</h3>
                    {team.rank && (
                      <Badge variant="purple" className="font-extrabold px-3 py-1">
                        Rank #{team.rank}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 border border-purple-100/50 shadow-xs text-center">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">Judges Weight (70%)</span>
                      <span className="text-base font-extrabold text-purple-950">{judgeAvg.toFixed(2)}</span>
                      <span className="text-xs text-gray-400"> / 10</span>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-purple-100/50 shadow-xs text-center">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">Public Vote (30%)</span>
                      <span className="text-base font-extrabold text-purple-950">
                        {publicVote !== null && publicVote !== undefined ? publicVote.toFixed(2) : '—'}
                      </span>
                      <span className="text-xs text-gray-400"> / 10</span>
                    </div>

                    <div className="bg-purple-600 rounded-lg p-3 text-white shadow-xs text-center">
                      <span className="text-[10px] opacity-80 uppercase tracking-wider block font-medium">Final Balanced Score</span>
                      <span className="text-base font-black">{team.final_score.toFixed(2)}</span>
                      <span className="text-xs opacity-80"> / 10</span>
                    </div>
                  </div>

                  {team.bias_rationale && (
                    <div className="bg-purple-100/40 border border-purple-100/60 rounded-lg p-3 text-xs text-purple-900 leading-relaxed">
                      <span className="font-bold block mb-1 text-purple-950">Audience & Judge Balance Rationale</span>
                      {team.bias_rationale}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Key Dates */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-primary" />
                <h2 className="font-semibold text-gray-900">Event Pipeline</h2>
              </div>
              <div className="space-y-2">
                {(key_dates || []).map((kd: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    {kd.done ? (
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <Clock size={16} className="text-gray-300 flex-shrink-0" />
                    )}
                    <div className="flex items-center justify-between flex-1">
                      <span className={`text-sm ${kd.done ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>
                        {kd.label}
                      </span>
                      <span className="text-xs text-gray-400">{kd.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
