import React, { useState, useEffect } from 'react'
import { Save, Settings, CheckCircle, Users, Building, Layers, Zap, ChevronRight } from 'lucide-react'
import { eventsApi, teamsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import type { FormationRules as FormationRulesType } from '../types'

const Toggle: React.FC<{
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}> = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3.5 group">
    <div className="flex-1 pr-4">
      <p className={`text-sm font-semibold transition-colors ${checked ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{label}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{description}</p>
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 ${
        checked
          ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-md shadow-orange-500/30'
          : 'bg-gray-200 dark:bg-slate-700'
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300 ${checked ? 'translate-x-6 scale-95' : 'translate-x-1'}`} />
    </button>
  </div>
)

const SectionCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; accent?: string }> = ({
  icon, title, children, accent = 'from-orange-500 to-red-500'
}) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
    <div className="px-5 py-4 border-b border-gray-50 dark:border-slate-800 flex items-center gap-3">
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center text-white shadow-sm`}>
        {icon}
      </div>
      <h3 className="text-sm font-bold text-gray-800 dark:text-white tracking-tight">{title}</h3>
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
)

const RangeSlider: React.FC<{
  min: number; max: number; value: number; onChange: (v: number) => void; step?: number
}> = ({ min, max, value, onChange, step = 1 }) => {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="relative pt-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer focus:outline-none"
        style={{
          background: `linear-gradient(to right, #f97316 0%, #ef4444 ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`,
        }}
      />
    </div>
  )
}

const AVATAR_COLORS = [
  'bg-orange-500', 'bg-blue-500', 'bg-purple-500',
  'bg-green-500', 'bg-pink-500', 'bg-teal-500',
  'bg-yellow-500', 'bg-red-500', 'bg-indigo-500',
]

export const FormationRules: React.FC = () => {
  const { eventId } = useAppContext()
  const [rules, setRules] = useState<FormationRulesType>({
    eventName: 'EventCraft Hackathon 2025',
    teamSize: 3,
    allowIncompleteTeams: false,
    skillBalance: true,
    institutionDiversity: true,
    maxPerInstitution: 1,
    experienceLevelGrouping: 'mixed',
    maxTeams: 6,
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [realTeams, setRealTeams] = useState<any[]>([])

  useEffect(() => {
    if (eventId) {
      teamsApi.list(eventId).then(setRealTeams).catch(() => {})
    }
  }, [eventId])

  useEffect(() => {
    if (eventId) {
      eventsApi.get(eventId).then((event) => {
        if (event.formation_rules) {
          const r = event.formation_rules
          setRules({
            eventName: r.event_name || event.name,
            teamSize: r.team_size ?? 3,
            allowIncompleteTeams: r.allow_incomplete_teams ?? false,
            skillBalance: r.skill_balance ?? true,
            institutionDiversity: r.institution_diversity ?? true,
            maxPerInstitution: r.max_per_institution ?? 1,
            experienceLevelGrouping: r.experience_level_grouping ?? 'mixed',
            maxTeams: r.max_teams ?? 6,
          })
        }
      }).catch(() => {})
    }
  }, [eventId])

  const handleSave = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      await eventsApi.updateFormationRules(eventId, {
        event_name: rules.eventName,
        team_size: rules.teamSize,
        allow_incomplete_teams: rules.allowIncompleteTeams,
        skill_balance: rules.skillBalance,
        institution_diversity: rules.institutionDiversity,
        max_per_institution: rules.maxPerInstitution,
        experience_level_grouping: rules.experienceLevelGrouping,
        max_teams: rules.maxTeams,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const estimatedTeams = Math.min(Math.floor(12 / rules.teamSize), rules.maxTeams)

  const mockParticipants = [
    { initials: 'RS', color: 'bg-orange-500' },
    { initials: 'AS', color: 'bg-blue-500' },
    { initials: 'VN', color: 'bg-purple-500' },
    { initials: 'PK', color: 'bg-green-500' },
    { initials: 'MR', color: 'bg-pink-500' },
    { initials: 'AT', color: 'bg-teal-500' },
  ]

  const mockPreviewTeams = Array.from({ length: Math.min(estimatedTeams, 3) }, (_, i) =>
    mockParticipants.slice(i * Math.min(rules.teamSize, 2), i * Math.min(rules.teamSize, 2) + Math.min(rules.teamSize, 2))
  )

  const hasRealTeams = realTeams.length > 0

  const displayTeams = hasRealTeams
    ? realTeams.slice(0, 3).map((t) => ({
        name: t.name,
        members: (t.members || []).slice(0, rules.teamSize).map((m: any, idx: number) => ({
          initials: m.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?',
          color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
          fullName: m.name || '',
        })),
        total: (t.members || []).length,
      }))
    : mockPreviewTeams.map((members, i) => ({
        name: `Team ${i + 1}`,
        members,
        total: members.length,
      }))

  const teamsCount = hasRealTeams ? realTeams.length : estimatedTeams

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 -m-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-1.5">
            <span>Dashboard</span>
            <ChevronRight size={12} />
            <span className="text-orange-500 font-medium">Formation Rules</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Formation Rules</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Configure how participants are distributed into teams.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-md cursor-pointer ${
            saved
              ? 'bg-green-500 text-white shadow-green-500/30'
              : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-orange-500/30 hover:-translate-y-0.5'
          }`}
        >
          {saved ? <><CheckCircle size={15} /> Saved!</> : <><Save size={15} /> {loading ? 'Saving…' : 'Save Rules'}</>}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left — Settings */}
        <div className="xl:col-span-2 space-y-4">

          <SectionCard icon={<Settings size={13} />} title="General">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Event Name</label>
            <input
              type="text"
              value={rules.eventName}
              onChange={(e) => setRules({ ...rules, eventName: e.target.value })}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
            />
          </SectionCard>

          <SectionCard icon={<Users size={13} />} title="Team Size">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Members per team</p>
              <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">{rules.teamSize}</span>
            </div>
            <RangeSlider min={2} max={6} value={rules.teamSize} onChange={(v) => setRules({ ...rules, teamSize: v })} />
            <div className="flex justify-between text-[10px] font-bold mt-2 px-0.5">
              {[2, 3, 4, 5, 6].map((n) => (
                <span key={n} className={rules.teamSize === n ? 'text-orange-500' : 'text-gray-300 dark:text-slate-600'}>{n}</span>
              ))}
            </div>
            <div className="mt-3 border-t border-gray-50 dark:border-slate-800">
              <Toggle
                checked={rules.allowIncompleteTeams}
                onChange={(v) => setRules({ ...rules, allowIncompleteTeams: v })}
                label="Allow incomplete teams"
                description="If participants don't divide evenly, allow smaller teams"
              />
            </div>
          </SectionCard>

          <SectionCard icon={<Building size={13} />} title="Institution Constraints" accent="from-blue-500 to-indigo-500">
            <div className="divide-y divide-gray-50 dark:divide-slate-800">
              <Toggle
                checked={rules.institutionDiversity}
                onChange={(v) => setRules({ ...rules, institutionDiversity: v })}
                label="Institution Diversity"
                description="Avoid multiple participants from the same institution in one team"
              />
              {rules.institutionDiversity && (
                <div className="pt-4 pb-1">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">Max per Institution</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Per team cap</p>
                    </div>
                    <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-500">{rules.maxPerInstitution}</span>
                  </div>
                  <RangeSlider
                    min={1} max={rules.teamSize} value={rules.maxPerInstitution}
                    onChange={(v) => setRules({ ...rules, maxPerInstitution: v })}
                  />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard icon={<Layers size={13} />} title="Skill & Experience" accent="from-purple-500 to-pink-500">
            <Toggle
              checked={rules.skillBalance}
              onChange={(v) => setRules({ ...rules, skillBalance: v })}
              label="Skill Balance"
              description="Distribute complementary skills across teams"
            />
            <div className="border-t border-gray-50 dark:border-slate-800 pt-4 pb-1">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Experience Grouping</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'mixed', label: 'Mixed', emoji: '🔀' },
                  { value: 'similar', label: 'Similar', emoji: '≈' },
                  { value: 'none', label: 'None', emoji: '○' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRules({ ...rules, experienceLevelGrouping: opt.value as any })}
                    className={`py-3 px-2 rounded-xl border-2 text-center transition-all duration-200 cursor-pointer ${
                      rules.experienceLevelGrouping === opt.value
                        ? 'border-orange-400 bg-orange-50 dark:bg-orange-500/10'
                        : 'border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="text-lg mb-1">{opt.emoji}</div>
                    <div className={`text-xs font-bold ${rules.experienceLevelGrouping === opt.value ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {opt.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<Zap size={13} />} title="Team Cap" accent="from-teal-500 to-green-500">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Maximum teams to form</p>
              <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-green-500">{rules.maxTeams}</span>
            </div>
            <RangeSlider min={2} max={20} value={rules.maxTeams} onChange={(v) => setRules({ ...rules, maxTeams: v })} />
            <div className="flex justify-between text-[10px] font-bold mt-2">
              <span className="text-gray-300 dark:text-slate-600">2</span>
              <span className="text-gray-300 dark:text-slate-600">10</span>
              <span className="text-gray-300 dark:text-slate-600">20</span>
            </div>
          </SectionCard>
        </div>

        {/* Right — Preview */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm sticky top-6">
            <div className="px-5 py-4 border-b border-gray-50 dark:border-slate-800 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-500/5 dark:to-red-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                    {hasRealTeams ? 'Formed Teams' : 'Live Preview'}
                  </p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white mt-0.5">
                    {hasRealTeams ? 'Current team composition' : 'How teams will form'}
                  </p>
                </div>
                {hasRealTeams && (
                  <span className="text-[9px] bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                    Live
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-4 text-white text-center shadow-md shadow-orange-500/20">
                  <div className="text-3xl font-black">{teamsCount}</div>
                  <div className="text-[10px] font-semibold opacity-80 mt-0.5">TEAMS</div>
                </div>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                  <div className="text-3xl font-black text-gray-800 dark:text-white">{rules.teamSize}</div>
                  <div className="text-[10px] font-semibold text-gray-400 mt-0.5">PER TEAM</div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  {hasRealTeams ? `Showing 3 of ${realTeams.length} teams` : 'Sample Teams'}
                </p>
                <div className="space-y-2">
                  {displayTeams.map((team, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 truncate max-w-[120px]">{team.name}</span>
                        <span className="text-[9px] bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                          {team.total}/{rules.teamSize}
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {team.members.map((m: any, j: number) => (
                          <div
                            key={j}
                            className={`w-7 h-7 rounded-lg ${m.color} flex items-center justify-center text-white text-[9px] font-bold`}
                            title={m.fullName || m.initials}
                          >
                            {m.initials}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {!hasRealTeams && (
                  <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-2 text-center">
                    Form teams to see real data here
                  </p>
                )}
              </div>

              <div className="border-t border-gray-50 dark:border-slate-800 pt-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Active Rules</p>
                {[
                  { label: 'Skill Balance', active: rules.skillBalance },
                  { label: 'Institution Diversity', active: rules.institutionDiversity },
                  { label: 'Incomplete Teams OK', active: rules.allowIncompleteTeams },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{r.label}</span>
                    <span className={`font-bold ${r.active ? 'text-green-500' : 'text-gray-300 dark:text-slate-600'}`}>
                      {r.active ? '✓ On' : '— Off'}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-gray-500 dark:text-gray-400">Grouping</span>
                  <span className="font-bold text-orange-500 capitalize">{rules.experienceLevelGrouping}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <Zap size={11} />
              </div>
              <p className="text-xs font-bold">AI Formation Engine</p>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Uses constraint-satisfaction to respect your rules while maximising team complementarity. Each team gets an LLM-generated rationale for review.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}