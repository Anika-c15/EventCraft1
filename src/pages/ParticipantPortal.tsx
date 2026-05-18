import React from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  User,
  Mail,
  Building,
  Users,
  Calendar,
  ArrowLeft,
  Award,
  CheckCircle,
  Clock,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { participants, teams } from '../data/mockData'
import type { ParticipantLevel } from '../types'

const levelVariant = (level: ParticipantLevel) => {
  switch (level) {
    case 'Beginner': return 'info'
    case 'Intermediate': return 'success'
    case 'Advanced': return 'warning'
    case 'Expert': return 'danger'
    default: return 'default'
  }
}

const keyDates = [
  { label: 'Registration Closed', date: 'May 6, 2026', done: true },
  { label: 'Team Formation', date: 'May 15, 2026', done: true },
  { label: 'Evaluation Opens', date: 'May 16, 2026', done: false },
  { label: 'Submission Deadline', date: 'May 17, 2026', done: false },
  { label: 'Results Announced', date: 'May 18, 2026', done: false },
  { label: 'Progression', date: 'May 19, 2026', done: false },
]

export const ParticipantPortal: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const participant = participants.find((p) => p.id === id)

  if (!participant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={28} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Participant Not Found</h2>
          <p className="text-gray-500 mb-4">
            No participant found with ID: <code className="bg-gray-100 px-1 rounded">{id}</code>
          </p>
          <Link
            to="/participants"
            className="text-primary font-medium hover:underline flex items-center gap-1 justify-center"
          >
            <ArrowLeft size={14} />
            Back to Participants
          </Link>
        </div>
      </div>
    )
  }

  const team = participant.teamId ? teams.find((t) => t.id === participant.teamId) : null
  const teammates = team
    ? participants.filter(
        (p) => team.memberIds.includes(p.id) && p.id !== participant.id
      )
    : []

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
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">
                Participant Portal
              </div>
            </div>
          </div>
          <Link
            to="/participants"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Admin View
          </Link>
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
            <span className="text-sm font-medium">EventCraft Hackathon 2026 — Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Profile Card */}
          <div className="md:col-span-1 space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-lg">
                    {participant.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{participant.name}</p>
                  <Badge variant={levelVariant(participant.level)} className="mt-0.5">
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
                  <span>{participant.institution}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Award size={14} className="text-gray-400 flex-shrink-0" />
                  <span>{participant.level} Level</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {participant.skills.map((skill) => (
                    <span
                      key={skill}
                      className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Registration Status
              </p>
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-500" />
                <span className="text-sm font-semibold text-green-700">
                  {participant.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Registered{' '}
                {new Date(participant.registeredAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2 space-y-5">
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
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed line-clamp-3">
                    {team.rationale}
                  </p>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Your Teammates
                    </p>
                    <div className="space-y-2">
                      {teammates.map((tm) => (
                        <div
                          key={tm.id}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center">
                              <span className="text-primary text-xs font-bold">
                                {tm.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{tm.name}</p>
                              <p className="text-xs text-gray-500">{tm.institution}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {tm.skills.slice(0, 2).map((s) => (
                              <span
                                key={s}
                                className="text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600"
                              >
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
                  <p className="text-xs text-gray-400 mt-1">
                    You'll be notified once teams are formed
                  </p>
                </div>
              )}
            </div>

            {/* Current Stage */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h2 className="font-semibold text-gray-900">Current Event Stage</h2>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                <p className="text-sm font-bold text-primary">Team Formation</p>
                <p className="text-xs text-orange-700 mt-1">
                  Teams are being formed. You'll receive an email once your team assignment is
                  confirmed and approved.
                </p>
              </div>
            </div>

            {/* Key Dates */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-primary" />
                <h2 className="font-semibold text-gray-900">Key Dates</h2>
              </div>
              <div className="space-y-2">
                {keyDates.map((kd, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {kd.done ? (
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <Clock size={16} className="text-gray-300 flex-shrink-0" />
                    )}
                    <div className="flex items-center justify-between flex-1">
                      <span
                        className={`text-sm ${kd.done ? 'text-gray-500 line-through' : 'text-gray-800 font-medium'}`}
                      >
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
