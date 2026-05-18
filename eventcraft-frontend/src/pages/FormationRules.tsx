
import React, { useState, useEffect } from 'react'
import { Save, Settings, Info, CheckCircle, Users, Building, Layers } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { eventsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import type { FormationRules as FormationRulesType } from '../types'

const Toggle: React.FC<{
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}> = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3">
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0 ml-4 ${
        checked ? 'bg-primary' : 'bg-gray-200'
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
)

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

  const estimatedTeams = Math.floor(12 / rules.teamSize)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formation Rules</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure how participants are distributed into teams. Rules apply on the next "Form
            Teams" run.
          </p>
        </div>
        <Button variant="primary" onClick={handleSave} disabled={loading}>
          {saved ? (
            <>
              <CheckCircle size={15} />
              Saved
            </>
          ) : (
            <>
              <Save size={15} />
              {loading ? 'Saving...' : 'Save Rules'}
            </>
          )}
        </Button>
      </div>

      <div className="mt-6 space-y-5 max-w-2xl">
        {/* General */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-gray-500" />
              <CardTitle>General</CardTitle>
            </div>
          </CardHeader>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
            <input
              type="text"
              value={rules.eventName}
              onChange={(e) => setRules({ ...rules, eventName: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </Card>

        {/* Team Size */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-500" />
              <CardTitle>Team Size</CardTitle>
            </div>
          </CardHeader>
          <div>
            <p className="text-xs text-gray-500 mb-4">How many participants per team</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={rules.teamSize}
                onChange={(e) => setRules({ ...rules, teamSize: parseInt(e.target.value) })}
                className="flex-1"
                style={{
                  background: `linear-gradient(to right, #E8450A ${((rules.teamSize - 2) / 4) * 100}%, #e5e7eb ${((rules.teamSize - 2) / 4) * 100}%)`,
                }}
              />
              <span className="text-2xl font-bold text-primary w-8 text-right">
                {rules.teamSize}
              </span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
              {[2, 3, 4, 5, 6].map((n) => (
                <span key={n} className={rules.teamSize === n ? 'text-primary font-bold' : ''}>
                  {n}
                </span>
              ))}
            </div>

            {/* Allow incomplete teams toggle */}
            <div className="mt-4 border border-gray-100 rounded-lg px-4">
              <Toggle
                checked={rules.allowIncompleteTeams}
                onChange={(v) => setRules({ ...rules, allowIncompleteTeams: v })}
                label="Allow incomplete teams"
                description="If participants don't divide evenly, allow teams smaller than target size"
              />
            </div>
          </div>
        </Card>

        {/* Institution Constraints */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building size={16} className="text-gray-500" />
              <CardTitle>Institution Constraints</CardTitle>
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            <Toggle
              checked={rules.institutionDiversity}
              onChange={(v) => setRules({ ...rules, institutionDiversity: v })}
              label="Institution Diversity"
              description="Avoid placing multiple participants from the same institution in one team"
            />
            {rules.institutionDiversity && (
              <div className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Max per Institution</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Maximum participants from the same institution per team
                    </p>
                  </div>
                  <span className="text-xl font-bold text-primary w-8 text-right">
                    {rules.maxPerInstitution}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={rules.teamSize}
                  step={1}
                  value={rules.maxPerInstitution}
                  onChange={(e) =>
                    setRules({ ...rules, maxPerInstitution: parseInt(e.target.value) })
                  }
                  className="w-full"
                  style={{
                    background: `linear-gradient(to right, #E8450A ${((rules.maxPerInstitution - 1) / (rules.teamSize - 1)) * 100}%, #e5e7eb ${((rules.maxPerInstitution - 1) / (rules.teamSize - 1)) * 100}%)`,
                  }}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Skill & Experience */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-gray-500" />
              <CardTitle>Skill &amp; Experience Balancing</CardTitle>
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            <Toggle
              checked={rules.skillBalance}
              onChange={(v) => setRules({ ...rules, skillBalance: v })}
              label="Skill Balance"
              description="Distribute complementary skills across teams to maximize coverage"
            />
            <div className="pt-3 pb-1">
              <p className="text-sm font-medium text-gray-800 mb-3">Experience Level Grouping</p>
              <div className="space-y-2">
                {[
                  {
                    value: 'mixed',
                    label: 'Mixed Levels',
                    description: 'Combine beginners with experts for mentorship dynamics',
                  },
                  {
                    value: 'similar',
                    label: 'Similar Levels',
                    description: 'Group participants of comparable experience together',
                  },
                  {
                    value: 'none',
                    label: 'No Grouping',
                    description: 'Ignore experience level when forming teams',
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      rules.experienceLevelGrouping === option.value
                        ? 'border-primary bg-orange-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="experienceGrouping"
                      value={option.value}
                      checked={rules.experienceLevelGrouping === option.value}
                      onChange={() =>
                        setRules({
                          ...rules,
                          experienceLevelGrouping:
                            option.value as FormationRulesType['experienceLevelGrouping'],
                        })
                      }
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          rules.experienceLevelGrouping === option.value
                            ? 'text-primary'
                            : 'text-gray-800'
                        }`}
                      >
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Max Teams */}
        <Card>
          <CardHeader>
            <CardTitle>Team Cap</CardTitle>
          </CardHeader>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-800">Maximum Teams</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hard cap on total number of teams formed
                </p>
              </div>
              <span className="text-2xl font-bold text-primary">{rules.maxTeams}</span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={rules.maxTeams}
              onChange={(e) => setRules({ ...rules, maxTeams: parseInt(e.target.value) })}
              className="w-full"
              style={{
                background: `linear-gradient(to right, #E8450A ${((rules.maxTeams - 2) / 18) * 100}%, #e5e7eb ${((rules.maxTeams - 2) / 18) * 100}%)`,
              }}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>2</span>
              <span>10</span>
              <span>20</span>
            </div>
          </div>
        </Card>

        {/* Summary + Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Configuration Summary
            </p>
            <div className="space-y-2">
              {[
                ['Event', rules.eventName],
                ['Team Size', `${rules.teamSize} members`],
                ['Max Teams', String(rules.maxTeams)],
                ['Skill Balance', rules.skillBalance ? 'Enabled' : 'Disabled'],
                ['Institution Diversity', rules.institutionDiversity ? 'Enabled' : 'Disabled'],
                ['Level Grouping', rules.experienceLevelGrouping],
                ['Est. Teams (12 participants)', String(estimatedTeams)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold text-gray-900 capitalize">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800 mb-1">
                  How AI Formation Works
                </p>
                <p className="text-xs text-blue-700 leading-relaxed">
                  The AI analyzes participant profiles, skill declarations, and institutional
                  affiliations to form balanced teams. It uses a constraint-satisfaction algorithm
                  that respects your configured rules while maximizing team complementarity scores.
                  Each team gets an LLM-generated rationale for committee review.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pb-6">
          <Button variant="primary" onClick={handleSave} className="px-8" disabled={loading}>
            {saved ? (
              <>
                <CheckCircle size={15} />
                Rules Saved!
              </>
            ) : (
              <>
                <Save size={15} />
                {loading ? 'Saving...' : 'Save Rules'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
