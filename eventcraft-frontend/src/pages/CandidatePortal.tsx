import React, { useState, useEffect } from 'react'
import { FileUp, Loader2, CheckCircle, Sparkles, User, Mail, Building2, Code2, AlertCircle, RefreshCw } from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { participantsApi, eventsApi } from '../api/client'
import type { ParticipantLevel } from '../types'
import { Modal } from '../components/ui/Modal'

interface ExtractedProfile {
  name: string; email: string; institution: string
  level: ParticipantLevel; skills: string; summary: string
  fit_score?: number
  fit_breakdown?: { technical_depth: number; project_experience: number; collaboration: number; innovation: number }
  strengths?: string[]
  flags?: string[]
}

type PageState = 'upload' | 'extracting' | 'review' | 'submitted' | 'error'

async function extractFromResume(eventId: string, file: File): Promise<ExtractedProfile | null> {
  try {
    const extracted = await participantsApi.parseResume(eventId, file)
    if (!extracted) return null
    const validLevels: ParticipantLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
    if (!validLevels.includes(extracted.level)) extracted.level = 'Intermediate'
    return extracted as ExtractedProfile
  } catch (err) {
    console.error("Error parsing resume:", err)
    return null
  }
}

export const CandidatePortal: React.FC = () => {
  const { addApproval } = useAppContext()
  const [activeEventId, setActiveEventId] = useState<string>('')
  const [activeEvent, setActiveEvent] = useState<any>(null)
  const [pageState, setPageState] = useState<PageState>('upload')
  const [profile, setProfile] = useState<ExtractedProfile>({
    name: '', email: '', institution: '', level: 'Intermediate', skills: '', summary: ''
  })
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Verification state
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyError, setVerifyError] = useState('')

  useEffect(() => {
    // Use public endpoint — candidates are not logged in
    eventsApi.getActiveEvent().then(data => {
      setActiveEventId(data.event_id)
      setActiveEvent({ id: data.event_id, name: data.event_name })
    }).catch(err => console.error("Failed to load active event:", err))
  }, [])

  const reset = () => {
    setPageState('upload'); setFileName(''); setEditMode(false)
    setProfile({ name: '', email: '', institution: '', level: 'Intermediate', skills: '', summary: '' })
  }

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(pdf|txt|doc|docx)$/i)) { alert('Please upload a PDF, TXT, DOC or DOCX file'); return }
    setFileName(file.name); setPageState('extracting')
    
    let evId = activeEventId
    let evObj = activeEvent
    if (!evId) {
      try {
        const data = await eventsApi.getActiveEvent()
        evId = data.event_id
        evObj = { id: data.event_id, name: data.event_name }
        setActiveEventId(evId)
        setActiveEvent(evObj)
      } catch {}
    }

    if (!evId) {
      setPageState('error')
      return
    }

    const extracted = await extractFromResume(evId, file)
    extracted ? (setProfile(extracted), setPageState('review')) : setPageState('error')
  }

  const handleSubmit = () => {
    if (!profile.name || !profile.email) return
    addApproval({
      type: 'Candidate Registration',
      status: 'pending',
      description: `New candidate registration from ${profile.name} (${profile.email}) — ${profile.institution || 'No institution'}. Skills: ${profile.skills || 'N/A'}. Level: ${profile.level}. AI Fit Score: ${profile.fit_score ?? 'N/A'}/100. Submitted via Resume Portal. Please review and approve to add to participant roster.`,
      payload: {
        name: profile.name,
        email: profile.email,
        institution: profile.institution,
        level: profile.level,
        skills: profile.skills,
        summary: profile.summary,
        fit_score: profile.fit_score,
        fit_breakdown: profile.fit_breakdown,
        strengths: profile.strengths,
        flags: profile.flags,
      },
    })
    setPageState('submitted')
  }

  const handleVerifyAndSubmit = () => {
    setVerifyError('')
    if (!activeEvent) {
      // Fallback if events failed to load
      handleSubmit()
      setShowVerifyModal(false)
      return
    }

    if (verifyInput.trim().toLowerCase() !== activeEvent.name.trim().toLowerCase()) {
      setVerifyError('The event name does not match. Please verify the event name you are registering for.')
      return
    }

    handleSubmit()
    setShowVerifyModal(false)
    setVerifyInput('')
  }

  const levelColors: Record<ParticipantLevel, string> = {
    Beginner: 'bg-blue-100 text-blue-700 border-blue-200',
    Intermediate: 'bg-green-100 text-green-700 border-green-200',
    Advanced: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Expert: 'bg-red-100 text-red-700 border-red-200',
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 py-10 transition-colors duration-200">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Sparkles size={26} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">EventCraft — Candidate Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Upload your resume — AI will automatically extract your profile and register you</p>
        </div>

        {/* UPLOAD */}
        {pageState === 'upload' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-orange-800 mb-2">How it works</p>
              <ol className="text-xs text-orange-700 space-y-1.5 list-decimal list-inside">
                <li>Upload your resume (PDF or TXT format)</li>
                <li>AI automatically extracts your name, skills, and institution</li>
                <li>Review the extracted profile and edit if needed</li>
                <li>Submit — the committee will review and approve your registration</li>
              </ol>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
              onClick={() => document.getElementById('resume-input')?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'}`}>
              <FileUp size={36} className={`mx-auto mb-3 ${dragOver ? 'text-primary' : 'text-gray-300'}`} />
              <p className="text-sm font-semibold text-gray-700">Drag your resume here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse files</p>
              <p className="text-xs text-gray-300 mt-3">PDF • TXT • DOC • DOCX</p>
              <input id="resume-input" type="file" accept=".pdf,.txt,.doc,.docx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            <p className="text-xs text-gray-400 text-center">
              For best results, save your resume as a <strong>.txt file</strong>.<br />
              PDF works if it is text-based (not a scanned image).
            </p>
          </div>
        )}

        {/* EXTRACTING */}
        {pageState === 'extracting' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <Loader2 size={44} className="animate-spin text-primary mx-auto mb-4" />
            <p className="text-base font-semibold text-gray-800">AI is reading your resume...</p>
            <p className="text-sm text-gray-500 mt-1">{fileName}</p>
            <p className="text-xs text-gray-400 mt-3">Extracting skills, institution and experience level</p>
          </div>
        )}

        {/* ERROR */}
        {pageState === 'error' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
            <AlertCircle size={44} className="text-red-400 mx-auto" />
            <p className="text-base font-semibold text-gray-800">Could not extract profile</p>
            <p className="text-sm text-gray-500">The file may be a scanned PDF or unreadable.<br />Please save your resume as a <strong>.txt file</strong> and try again.</p>
            <button onClick={reset} className="flex items-center gap-2 mx-auto text-sm text-primary font-medium hover:underline">
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {/* REVIEW */}
        {pageState === 'review' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-orange-400 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-white" />
                <span className="text-sm font-semibold text-white">AI Extracted Profile — Please Review</span>
              </div>
              <span className="text-xs text-white/70">{fileName}</span>
            </div>
            <div className="p-6 space-y-4">
              {profile.summary && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-indigo-600 mb-0.5">AI Summary</p>
                  <p className="text-sm text-indigo-800">{profile.summary}</p>
                </div>
              )}

              {/* AI Fit Score */}
              {profile.fit_score !== undefined && (
                <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Fit Score</p>
                    <span className={`text-lg font-black ${
                      profile.fit_score >= 80 ? 'text-green-600' :
                      profile.fit_score >= 60 ? 'text-blue-600' :
                      profile.fit_score >= 40 ? 'text-yellow-600' : 'text-red-500'
                    }`}>{profile.fit_score}<span className="text-xs font-normal text-gray-400">/100</span></span>
                  </div>
                  {/* Score bar */}
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        profile.fit_score >= 80 ? 'bg-green-500' :
                        profile.fit_score >= 60 ? 'bg-blue-500' :
                        profile.fit_score >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                      }`}
                      style={{ width: `${profile.fit_score}%` }}
                    />
                  </div>
                  {/* Breakdown */}
                  {profile.fit_breakdown && (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(profile.fit_breakdown).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                          <span className="font-semibold text-gray-700">{val}/25</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Strengths */}
                  {profile.strengths && profile.strengths.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-600 mb-1">✓ Strengths</p>
                      <ul className="space-y-0.5">
                        {profile.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                            <span className="text-green-500 mt-0.5">•</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Flags */}
                  {profile.flags && profile.flags.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-yellow-600 mb-1">⚠ Flags</p>
                      <ul className="space-y-0.5">
                        {profile.flags.map((f, i) => (
                          <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                            <span className="text-yellow-500 mt-0.5">•</span>{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-3">
                {[
                  { key: 'name' as const, label: 'Full Name', icon: <User size={11} />, required: true, type: 'text' },
                  { key: 'email' as const, label: 'Email', icon: <Mail size={11} />, required: true, type: 'email' },
                  { key: 'institution' as const, label: 'Institution', icon: <Building2 size={11} />, required: false, type: 'text' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      {field.icon} {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {editMode ? (
                      <input type={field.type} value={profile[field.key]}
                        onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    ) : (
                      <p className="text-sm font-medium text-gray-900 px-1">
                        {profile[field.key] || <span className="text-red-400 italic">Not found — click Edit</span>}
                      </p>
                    )}
                  </div>
                ))}

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    <Code2 size={11} /> Skills
                  </label>
                  {editMode ? (
                    <input value={profile.skills} onChange={e => setProfile(p => ({ ...p, skills: e.target.value }))}
                      placeholder="Python, ML, React (comma separated)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  ) : (
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {profile.skills ? profile.skills.split(',').map(s => (
                        <span key={s} className="px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-700 font-medium border border-gray-200">{s.trim()}</span>
                      )) : <span className="text-sm text-gray-400">—</span>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Experience Level</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['Beginner', 'Intermediate', 'Advanced', 'Expert'] as ParticipantLevel[]).map(l => (
                      <button key={l} onClick={() => setProfile(p => ({ ...p, level: l }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${profile.level === l ? levelColors[l] + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <div className="flex gap-2">
                  <button onClick={() => setEditMode(!editMode)}
                    className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5">
                    {editMode ? '✓ Done Editing' : '✏️ Edit Fields'}
                  </button>
                  <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                    <RefreshCw size={11} /> Upload New
                  </button>
                </div>
                <button onClick={() => { setVerifyError(''); setVerifyInput(''); setShowVerifyModal(true); }} disabled={!profile.name || !profile.email}
                  className="flex items-center gap-2 bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Submit Registration →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBMITTED */}
        {pageState === 'submitted' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center space-y-4">
            <CheckCircle size={52} className="text-green-500 mx-auto" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Registration Submitted!</h2>
              <p className="text-sm text-gray-500 mt-1">Your application has been sent to the committee for review.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
              {[['Name', profile.name], ['Email', profile.email], ['Institution', profile.institution || '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-900">{v}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Level</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${levelColors[profile.level]}`}>{profile.level}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400">You will be notified once the committee approves your registration.</p>
          </div>
        )}

      </div>

      {/* Event Name Verification Modal */}
      <Modal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        title="Verify Event Name"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-655 dark:text-slate-300 leading-relaxed">
            Please enter the name of the event you are registering for to verify your submission:
          </p>
          <input
            type="text"
            value={verifyInput}
            onChange={e => { setVerifyInput(e.target.value); setVerifyError(''); }}
            placeholder="e.g. EventCraft"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
          {verifyError && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 rounded-lg px-3 py-2 text-xs text-red-655 dark:text-red-400 flex items-start gap-1.5 leading-relaxed">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{verifyError}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowVerifyModal(false)}
              className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-slate-300 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleVerifyAndSubmit}
              disabled={!verifyInput.trim()}
              className="bg-primary text-white rounded-lg px-4 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Verify &amp; Submit
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}