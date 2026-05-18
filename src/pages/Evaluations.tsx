import React, { useState } from 'react'
import { Plus, BookOpen, Sliders } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { teams, evaluationScores as initialScores } from '../data/mockData'
import type { EvaluationScore } from '../types'

interface ScoreForm {
  judgeName: string
  judgeEmail: string
  teamId: string
  innovation: number
  execution: number
  presentation: number
  impact: number
  notes: string
}

const emptyForm: ScoreForm = {
  judgeName: '',
  judgeEmail: '',
  teamId: '',
  innovation: 7,
  execution: 3.5,
  presentation: 8,
  impact: 7,
  notes: '',
}

const criteriaConfig = [
  {
    key: 'innovation' as const,
    label: 'Innovation',
    description: 'Originality and creativity of the solution',
    color: 'bg-blue-500',
  },
  {
    key: 'execution' as const,
    label: 'Execution',
    description: 'Technical implementation and code quality',
    color: 'bg-green-500',
  },
  {
    key: 'presentation' as const,
    label: 'Presentation',
    description: 'Clarity of demo and communication',
    color: 'bg-purple-500',
  },
  {
    key: 'impact' as const,
    label: 'Impact',
    description: 'Real-world potential and scalability',
    color: 'bg-orange-500',
  },
]

export const Evaluations: React.FC = () => {
  const [scores, setScores] = useState<EvaluationScore[]>(initialScores)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ScoreForm>(emptyForm)

  const avg = (
    (form.innovation + form.execution + form.presentation + form.impact) / 4
  ).toFixed(2)

  const handleSubmit = () => {
    if (!form.judgeName || !form.judgeEmail || !form.teamId) return
    const newScore: EvaluationScore = {
      id: `s${Date.now()}`,
      judgeName: form.judgeName,
      judgeEmail: form.judgeEmail,
      teamId: form.teamId,
      innovation: form.innovation,
      execution: form.execution,
      presentation: form.presentation,
      impact: form.impact,
      notes: form.notes,
      submittedAt: new Date().toISOString(),
    }
    setScores((prev) => [...prev, newScore])
    setForm(emptyForm)
    setShowModal(false)
  }

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{scores.length} scores submitted</p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={15} />
          Submit Score
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assessment Guide */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Guide</CardTitle>
              <BookOpen size={16} className="text-gray-400" />
            </CardHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Evaluate each team across four key dimensions. Scores range from 0 (poor) to 10
                (exceptional). Consider the following guidelines:
              </p>
              {criteriaConfig.map((c) => (
                <div key={c.key} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${c.color}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                    <p className="text-xs text-gray-500">{c.description}</p>
                  </div>
                </div>
              ))}
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mt-2">
                <p className="text-xs text-orange-700 font-medium">
                  💡 Tip: Scores are averaged across all judges. Ensure consistency in your
                  evaluation criteria across all teams.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Scores Table */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Submitted Scores</h3>
              <Badge variant={scores.length > 0 ? 'success' : 'gray'}>
                {scores.length} submitted
              </Badge>
            </div>
            {scores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Sliders size={20} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">No scores submitted yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Click "Submit Score" to add the first evaluation
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left">
                        Judge
                      </th>
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left">
                        Team
                      </th>
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-center">
                        Innovation
                      </th>
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-center">
                        Execution
                      </th>
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-center">
                        Presentation
                      </th>
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-center">
                        Impact
                      </th>
                      <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-right">
                        Avg
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {scores.map((s) => {
                      const average = (
                        (s.innovation + s.execution + s.presentation + s.impact) / 4
                      ).toFixed(2)
                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{s.judgeName}</div>
                            <div className="text-xs text-gray-400">{s.judgeEmail}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {getTeamName(s.teamId)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-700">
                            {s.innovation}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-700">
                            {s.execution}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-700">
                            {s.presentation}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-700">
                            {s.impact}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold text-primary">{average}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Submit Score Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Submit Judge Score"
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {/* Judge Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Judge Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.judgeName}
                onChange={(e) => setForm({ ...form, judgeName: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="Dr. Anil Kumar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Judge Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.judgeEmail}
                onChange={(e) => setForm({ ...form, judgeEmail: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="judge@iit.ac.in"
              />
            </div>
          </div>

          {/* Team */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Team <span className="text-red-500">*</span>
            </label>
            <select
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
            >
              <option value="">Select a team...</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scoring Criteria */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Scoring Criteria</label>
              <span className="text-sm font-bold text-primary">Avg: {avg}/10</span>
            </div>
            <div className="space-y-4">
              {criteriaConfig.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{c.label}</span>
                      <span className="text-xs text-gray-400">{c.description}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 w-8 text-right">
                      {form[c.key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={form[c.key]}
                    onChange={(e) =>
                      setForm({ ...form, [c.key]: parseFloat(e.target.value) })
                    }
                    className="w-full"
                    style={{
                      background: `linear-gradient(to right, #E8450A ${form[c.key] * 10}%, #e5e7eb ${form[c.key] * 10}%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>0</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              placeholder="Additional observations or feedback..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Submit Score
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
