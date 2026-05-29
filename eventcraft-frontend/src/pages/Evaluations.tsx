import React, { useState, useEffect } from 'react'
import { Plus, BookOpen, Sliders, RefreshCw, Link2, Copy, CheckCircle, Github, Youtube } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { evaluationsApi, teamsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'

// Use window.location to derive API base — avoids ImportMeta.env issues
const API_BASE = 'http://localhost:8000'

const criteriaConfig = [
  { key: 'innovation',   label: 'Innovation',   description: 'Originality and creativity of the solution' },
  { key: 'execution',    label: 'Execution',     description: 'Technical implementation and code quality' },
  { key: 'presentation', label: 'Presentation',  description: 'Clarity of demo and communication' },
  { key: 'impact',       label: 'Impact',        description: 'Real-world potential and scalability' },
]

const emptyForm = {
  judgeName: '', judgeEmail: '', teamId: '',
  innovation: 7, execution: 5, presentation: 7, impact: 6, notes: '',
}

export const Evaluations: React.FC = () => {
  const { eventId, loadApprovals, loadDashboard, dashboardStats } = useAppContext()

  const activeStage = dashboardStats?.current_stage?.toLowerCase() || ''
  const isClosed = activeStage.includes('result') || activeStage.includes('progression')
  const isEvaluationPhase = !dashboardStats || 
    activeStage.includes('eval') || 
    activeStage.includes('result') || 
    activeStage.includes('progression') || 
    activeStage.includes('finale') || 
    activeStage.includes('submission') || 
    activeStage.includes('presentation') || 
    activeStage.includes('pitch') || 
    activeStage.includes('project') || 
    dashboardStats.current_stage_index >= 2

  const [scores, setScores]           = useState<any[]>([])
  const [teams, setTeams]             = useState<any[]>([])
  const [showModal, setShowModal]     = useState(false)
  const [showInvite, setShowInvite]   = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [loading, setLoading]         = useState(false)
  const [guide, setGuide]             = useState<string | null>(null)
  const [loadingGuide, setLoadingGuide] = useState(false)

  // Judge invite state
  const [inviteName, setInviteName]   = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteResult, setInviteResult] = useState<any>(null)
  const [copied, setCopied]           = useState(false)

  // AI Bias Mitigation & Public Consensus State
  const [mitigations, setMitigations] = useState<any[]>([])
  const [publicScores, setPublicScores] = useState<{ [key: string]: string }>({})
  const [customScores, setCustomScores] = useState<{ [key: string]: string }>({})

  const loadBiasMitigation = async () => {
    if (!eventId) return
    try {
      const data = await evaluationsApi.getBiasMitigation(eventId)
      setMitigations(data)
    } catch (e) {
      console.error('Error fetching bias mitigation:', e)
    }
  }

  const handleSavePublicVote = async (teamId: string) => {
    const val = publicScores[teamId]
    if (!val || isNaN(parseFloat(val))) return
    try {
      await evaluationsApi.savePublicVote(eventId!, teamId, parseFloat(val))
      setPublicScores({ ...publicScores, [teamId]: '' })
      await loadBiasMitigation()
      await loadScores()
    } catch (e: any) {
      alert(e.message || 'Error saving public score')
    }
  }

  const handleLockScore = async (teamId: string, finalScore: number, rationale?: string) => {
    try {
      await evaluationsApi.lockScore(eventId!, teamId, {
        final_score: finalScore,
        bias_rationale: rationale,
      })
      await loadBiasMitigation()
      await loadScores()
      await loadApprovals()
      await loadDashboard()
    } catch (e: any) {
      alert(e.message || 'Error locking score')
    }
  }

  useEffect(() => {
    if (eventId) {
      loadScores()
      teamsApi.list(eventId).then(setTeams).catch(() => setTeams([]))
      loadBiasMitigation()
      loadDashboard()
    }
  }, [eventId])

  const loadScores = async () => {
    if (!eventId) return
    setLoading(true)
    try { setScores(await evaluationsApi.list(eventId)) }
    catch { setScores([]) }
    finally { setLoading(false) }
  }

  const avg = ((form.innovation + form.execution + form.presentation + form.impact) / 4).toFixed(2)
  const selectedTeam = teams.find((t) => t.id === form.teamId)

  const handleSubmit = async () => {
    if (!form.judgeName || !form.judgeEmail || !form.teamId || !eventId) return
    try {
      await evaluationsApi.submit(eventId, {
        team_id: form.teamId,
        judge_name: form.judgeName,
        judge_email: form.judgeEmail,
        scores: {
          innovation: form.innovation, execution: form.execution,
          presentation: form.presentation, impact: form.impact,
        },
        notes: form.notes || undefined,
      })
      setForm(emptyForm)
      setShowModal(false)
      await loadScores()
      await loadApprovals()
      await loadDashboard()
      await loadBiasMitigation()
    } catch (e: any) { alert(e.message) }
  }

  const handleConsolidate = async () => {
    if (!eventId) return
    try {
      const result = await evaluationsApi.consolidate(eventId)
      alert(`Scores consolidated! ${result.rankings?.length ?? 0} teams ranked.`)
      await loadApprovals()
      await loadDashboard()
      await loadBiasMitigation()
    } catch (e: any) { alert(e.message) }
  }

  const handleInviteJudge = async () => {
    if (!eventId || !inviteName || !inviteEmail) return
    try {
      const token = localStorage.getItem('ec_token') || ''
      const res = await fetch(`${API_BASE}/api/events/${eventId}/evaluations/invite-judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ judge_name: inviteName, judge_email: inviteEmail }),
      })
      if (!res.ok) throw new Error('Failed to generate invite')
      setInviteResult(await res.json())
    } catch (e: any) { alert(e.message) }
  }

  const copyLink = () => {
    if (inviteResult?.portal_url) {
      navigator.clipboard.writeText(inviteResult.portal_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const loadGuide = async (teamId: string) => {
    if (!eventId || !teamId) return
    setLoadingGuide(true)
    setGuide(null)
    try {
      const res = await evaluationsApi.assessmentGuide(eventId, teamId)
      setGuide(res.guide)
    } catch { setGuide('Could not generate guide.') }
    finally { setLoadingGuide(false) }
  }

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{scores.length} scores submitted</p>
        </div>
        {isEvaluationPhase && dashboardStats && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleConsolidate}>
              <RefreshCw size={15} /> Consolidate Scores
            </Button>
            <Button variant="secondary" onClick={() => { setInviteResult(null); setInviteName(''); setInviteEmail(''); setShowInvite(true) }} disabled={isClosed}>
              <Link2 size={15} /> Invite Judge
            </Button>
            <Button variant="primary" onClick={() => setShowModal(true)} disabled={isClosed}>
              <Plus size={15} /> Submit Score
            </Button>
          </div>
        )}
      </div>

      {!isEvaluationPhase ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-2xl mx-auto my-12 shadow-sm">
          <BookOpen size={36} className="text-gray-300 /30 mx-auto mb-3" />
          <h3 className="font-bold text-gray-700 mb-1">Evaluation Panel Locked</h3>
          <p className="text-sm text-gray-500">
            Evaluation panel will unlock once the event transitions to the Evaluation phase.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Assessment Guide ── */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Assessment Guide</CardTitle>
                  <BookOpen size={16} className="text-gray-400" />
                </CardHeader>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Evaluate each team across four key dimensions. Scores range from 0–10.
                  </p>
                  {criteriaConfig.map((c) => (
                    <div key={c.key} className="flex items-start gap-3">
                      <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 bg-primary" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                        <p className="text-xs text-gray-500">{c.description}</p>
                      </div>
                    </div>
                  ))}

                  {teams.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-2">AI Assessment Guide</p>
                      <select
                        onChange={(e) => e.target.value && loadGuide(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 mb-2"
                        defaultValue=""
                      >
                        <option value="">Select team for guide...</option>
                        {teams.filter(t => t.submission_status === 'Submitted').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {loadingGuide && <p className="text-xs text-gray-400">Generating guide...</p>}
                      {guide && (
                        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                          <p className="text-xs text-orange-800 leading-relaxed whitespace-pre-wrap">{guide}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* ── Scores Table ── */}
            <div className="lg:col-span-2">
              <Card padding={false}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Submitted Scores</h3>
                  <Badge variant={scores.length > 0 ? 'success' : 'gray'}>{scores.length} submitted</Badge>
                </div>
                {loading ? (
                  <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
                ) : scores.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Sliders size={20} className="text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No scores submitted yet</p>
                    <p className="text-xs text-gray-400 mt-1">Click "Submit Score" or invite a judge via link</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {['Judge', 'Team', 'Innovation', 'Execution', 'Presentation', 'Impact', 'Avg'].map((h) => (
                            <th key={h} className={`text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 ${h === 'Avg' ? 'text-right' : 'text-left'}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {scores.map((s: any) => (
                          <tr key={s.id} className={`hover:bg-gray-50/50 ${s.is_anomaly ? 'bg-yellow-50/50' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{s.judge_name}</div>
                              <div className="text-xs text-gray-400">{s.judge_email}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{getTeamName(s.team_id)}</td>
                            <td className="px-4 py-3 text-center text-sm">{s.scores_json?.innovation ?? '—'}</td>
                            <td className="px-4 py-3 text-center text-sm">{s.scores_json?.execution ?? '—'}</td>
                            <td className="px-4 py-3 text-center text-sm">{s.scores_json?.presentation ?? '—'}</td>
                            <td className="px-4 py-3 text-center text-sm">{s.scores_json?.impact ?? '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {s.is_anomaly && <span title="Score anomaly detected">⚠️</span>}
                                <span className="text-sm font-bold text-primary">{s.average}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ── AI Bias Mitigation & Public Consensus Panel ── */}
          <div className="mt-8">
            <Card>
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Score: Audience & Judge Balance</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    70% expert judge average · 30% combined public (social scrape + peer review average)
                  </p>
                </div>
                <Badge variant="purple" className="font-bold">AI Active</Badge>
              </div>

              <div className="space-y-4">
                {mitigations.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">No approved/active teams to evaluate yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mitigations.map((m: any) => {
                      const hasPublic = m.public_vote_score !== null && m.public_vote_score !== undefined
                      const isLocked = m.final_score !== null && m.final_score !== undefined
                      const deviation = hasPublic ? Math.abs(m.judge_avg - m.public_vote_score) : 0
                      const isFlagged = deviation > 2.0
                      const peerCount = m.peer_review_count ?? 0

                      return (
                        <div key={m.team_id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                          {/* Team header */}
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="font-semibold text-sm text-gray-800">{m.team_name}</span>
                              {peerCount > 0 && (
                                <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-1.5 py-0.5 rounded-full">
                                  {peerCount} peer {peerCount === 1 ? 'vote' : 'votes'}
                                </span>
                              )}
                            </div>
                            {isLocked ? (
                              <Badge variant="purple">Locked ({m.final_score.toFixed(2)})</Badge>
                            ) : isFlagged ? (
                              <Badge variant="danger">Bias Flagged</Badge>
                            ) : hasPublic ? (
                              <Badge variant="success">Balanced</Badge>
                            ) : (
                              <Badge variant="yellow">Pending Public Vote</Badge>
                            )}
                          </div>

                          {/* Three score blocks */}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {/* JUDGES 70% */}
                            <div className="bg-white p-2.5 rounded-lg border border-gray-100 text-center">
                              <span className="text-[9px] text-gray-400 block uppercase tracking-wide font-semibold">Judges (70%)</span>
                              <span className="text-sm font-bold text-gray-800 block mt-0.5">{m.judge_avg.toFixed(2)}</span>
                              <span className="text-[9px] text-gray-400">/ 10</span>
                            </div>

                            {/* PUBLIC 30% — combined social + peer */}
                            <div className="bg-white p-2.5 rounded-lg border border-indigo-100 text-center">
                              <span className="text-[9px] text-indigo-500 block uppercase tracking-wide font-semibold">Public (30%)</span>
                              <span className="text-sm font-bold text-indigo-700 block mt-0.5">
                                {hasPublic ? m.public_vote_score.toFixed(2) : '—'}
                              </span>
                              <span className="text-[9px] text-gray-400">
                                {m.social_vote_score != null && m.peer_avg != null
                                  ? `S:${m.social_vote_score.toFixed(1)} P:${m.peer_avg.toFixed(1)}`
                                  : m.social_vote_score != null
                                  ? `Social: ${m.social_vote_score.toFixed(1)}`
                                  : m.peer_avg != null
                                  ? `Peer: ${m.peer_avg.toFixed(1)}`
                                  : 'No data yet'}
                              </span>
                            </div>

                            {/* AI PROPOSED */}
                            <div className="bg-white p-2.5 rounded-lg border border-orange-100 text-center">
                              <span className="text-[9px] text-orange-500 block uppercase tracking-wide font-semibold">AI Proposed</span>
                              <span className="text-sm font-bold text-primary block mt-0.5">
                                {m.ai_proposed_score !== null && m.ai_proposed_score !== undefined
                                  ? m.ai_proposed_score.toFixed(2)
                                  : '—'}
                              </span>
                              <span className="text-[9px] text-gray-400">/ 10</span>
                            </div>
                          </div>

                          {/* Social score entry (admin input) */}
                          {!isLocked && !isClosed && (
                            <div className="mb-3">
                              <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wide">
                                Social Score Input {m.social_vote_score != null ? `(current: ${m.social_vote_score.toFixed(1)})` : '(not set)'}
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="10"
                                  placeholder="Social/scrape score (0-10)..."
                                  value={publicScores[m.team_id] || ''}
                                  onChange={(e) => setPublicScores({ ...publicScores, [m.team_id]: e.target.value })}
                                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                                <Button size="sm" variant="secondary" onClick={() => handleSavePublicVote(m.team_id)}>
                                  Save
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Bias alert box */}
                          {hasPublic && isFlagged && m.bias_rationale && (
                            <div className="bg-yellow-50 border border-yellow-100 text-[11px] text-yellow-800 rounded-lg p-2.5 mb-3 leading-relaxed">
                              <span className="font-bold block text-yellow-950 mb-0.5">⚠️ AI Bias Mitigation Alert</span>
                              <span className="text-[10px] text-yellow-700 block mb-1">
                                Judge avg vs combined public (social + {peerCount} peer votes) differs by {deviation.toFixed(2)} pts
                              </span>
                              {m.bias_rationale}
                            </div>
                          )}

                          {/* Lock controls */}
                          {hasPublic && !isLocked && !isClosed && (
                            <div className="space-y-2.5">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="flex-1 text-xs"
                                  onClick={() => handleLockScore(m.team_id, m.ai_proposed_score, m.bias_rationale)}
                                >
                                  Accept & Lock AI Score
                                </Button>
                              </div>

                              <div className="flex gap-2 border-t border-gray-100/50 pt-2">
                                <input
                                  type="number"
                                  step="0.05"
                                  min="0"
                                  max="10"
                                  placeholder="Override score..."
                                  value={customScores[m.team_id] || ''}
                                  onChange={(e) => setCustomScores({ ...customScores, [m.team_id]: e.target.value })}
                                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    const val = customScores[m.team_id]
                                    if (val && !isNaN(parseFloat(val))) {
                                      handleLockScore(m.team_id, parseFloat(val), m.bias_rationale || undefined)
                                    }
                                  }}
                                >
                                  Override
                                </Button>
                              </div>
                            </div>
                          )}

                          {!isLocked && isClosed && (
                            <div className="text-[10px] text-gray-500 font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center mt-1">
                              🔒 Evaluations & voting closed
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── Invite Judge Modal ── */}
      <Modal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite Judge — No Account Required"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-700 leading-relaxed">
              A signed JWT link will be generated for this judge. They can open it in any browser
              and submit scores directly — <strong>no account or login needed</strong>.
              The link expires in 7 days.
            </p>
          </div>

          {!inviteResult ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judge Name *</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Dr. Anand Kumar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judge Email *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="judge@institution.ac.in"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleInviteJudge} disabled={!inviteName || !inviteEmail}>
                  <Link2 size={14} /> Generate Link
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-green-600" />
                  <p className="text-sm font-semibold text-green-800">Judge link generated!</p>
                </div>
                <p className="text-xs text-green-700 mb-3">
                  Share this link with <strong>{inviteResult.judge_name}</strong>. They can open it
                  directly — no account needed.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteResult.portal_url}
                    className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-gray-700 font-mono truncate"
                  />
                  <Button variant="secondary" size="sm" onClick={copyLink}>
                    {copied ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setInviteResult(null); setInviteName(''); setInviteEmail('') }}>
                  Invite Another
                </Button>
                <Button variant="primary" onClick={() => setShowInvite(false)}>Done</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Submit Score Modal ── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Submit Judge Score" maxWidth="max-w-xl">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Judge Name *</label>
              <input type="text" value={form.judgeName}
                onChange={(e) => setForm({ ...form, judgeName: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Dr. Anil Kumar" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Judge Email *</label>
              <input type="email" value={form.judgeEmail}
                onChange={(e) => setForm({ ...form, judgeEmail: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="judge@event.com" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team *</label>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="">Select team...</option>
              {teams.filter(t => t.submission_status === 'Submitted').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {selectedTeam && (
            <div className="bg-orange-50/40 border border-orange-100/50 rounded-xl p-4 mt-3 space-y-2">
              <h4 className="font-bold text-sm text-gray-900">{selectedTeam.project_title || 'Untitled Project'}</h4>
              <p className="text-xs text-gray-600 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                {selectedTeam.project_description || 'No project description provided.'}
              </p>
              <div className="flex gap-2 flex-wrap pt-1">
                {(selectedTeam.github_url || selectedTeam.github_link) && (
                  <a href={selectedTeam.github_url || selectedTeam.github_link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                    <Github size={13} /> GitHub Repository
                  </a>
                )}
                {(selectedTeam.video_url || selectedTeam.demo_link) && (
                  <a href={selectedTeam.video_url || selectedTeam.demo_link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 bg-white border border-red-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-50 transition-colors">
                    <Youtube size={13} /> Video Demo
                  </a>
                )}
                {selectedTeam.presentation_url && (
                  <a href={selectedTeam.presentation_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-indigo-50 transition-colors">
                    <Link2 size={13} /> Presentation Slides
                  </a>
                )}
              </div>
            </div>
          )}

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
                      {form[c.key as keyof typeof form]}
                    </span>
                  </div>
                  <input type="range" min={0} max={10} step={0.5}
                    value={form[c.key as keyof typeof form] as number}
                    onChange={(e) => setForm({ ...form, [c.key]: parseFloat(e.target.value) })}
                    className="w-full"
                    style={{ background: `linear-gradient(to right, #E8450A ${(form[c.key as keyof typeof form] as number) * 10}%, #e5e7eb ${(form[c.key as keyof typeof form] as number) * 10}%)` }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>0</span><span>5</span><span>10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Additional observations..." />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit}>Submit Score</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
