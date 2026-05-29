import React, { useState, useRef } from 'react'
import { Upload, Plus, ExternalLink, Trash2, Search, X, CheckCircle, AlertCircle, FileText, Download, FileUp, Loader2, Sparkles, Link2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { participants as initialParticipants } from '../data/mockData'
import type { Participant, ParticipantLevel, ParticipantStatus } from '../types'

const levelVariant = (level: ParticipantLevel) => {
  switch (level) {
    case 'Beginner': return 'info'
    case 'Intermediate': return 'success'
    case 'Advanced': return 'warning'
    case 'Expert': return 'danger'
    default: return 'default'
  }
}

const statusVariant = (status: ParticipantStatus) => {
  switch (status) {
    case 'Active': return 'success'
    case 'Pending': return 'warning'
    case 'Inactive': return 'gray'
    case 'Waitlisted': return 'purple'
    default: return 'default'
  }
}

const emptyForm = {
  name: '', email: '', institution: '',
  level: 'Intermediate' as ParticipantLevel,
  skills: '', status: 'Active' as ParticipantStatus,
}

const VALID_LEVELS: ParticipantLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const VALID_STATUSES: ParticipantStatus[] = ['Active', 'Pending', 'Inactive', 'Waitlisted']

interface CSVPreviewRow {
  name: string; email: string; institution: string
  level: ParticipantLevel; skills: string[]; status: ParticipantStatus
  valid: boolean; error?: string
}

function parseCSV(text: string): CSVPreviewRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
  const nameIdx = header.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname')
  const emailIdx = header.findIndex(h => h === 'email')
  const instIdx = header.findIndex(h => h.includes('institution') || h.includes('college'))
  const levelIdx = header.findIndex(h => h === 'level' || h === 'experience')
  const skillsIdx = header.findIndex(h => h.includes('skill'))
  const statusIdx = header.findIndex(h => h === 'status')
  if (nameIdx === -1 || emailIdx === -1) return []
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
    const name = cols[nameIdx] || ''
    const email = cols[emailIdx] || ''
    const institution = instIdx >= 0 ? cols[instIdx] || '' : ''
    const rawLevel = levelIdx >= 0 ? cols[levelIdx] : 'Intermediate'
    const rawSkills = skillsIdx >= 0 ? cols[skillsIdx] : ''
    const rawStatus = statusIdx >= 0 ? cols[statusIdx] : 'Active'
    const level = VALID_LEVELS.find(l => l.toLowerCase() === rawLevel.toLowerCase()) || 'Intermediate'
    const status = VALID_STATUSES.find(s => s.toLowerCase() === rawStatus.toLowerCase()) || 'Active'
    const skills = rawSkills ? rawSkills.split(';').map(s => s.trim()).filter(Boolean) : []
    let error = ''
    if (!name) error = 'Name missing'
    else if (!email || !email.includes('@')) error = 'Invalid email'
    return { name, email, institution, level, skills, status, valid: !error, error }
  })
}

async function extractResumeWithAI(text: string): Promise<Partial<typeof emptyForm> | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are a resume parser. Extract structured information from the resume text.
Return ONLY a valid JSON object with no markdown or explanation:
{
  "name": "full name",
  "email": "email address or empty string",
  "institution": "university or college name or empty string",
  "level": "one of: Beginner, Intermediate, Advanced, Expert",
  "skills": "comma-separated technical skills"
}
For level: 0-1yr = Beginner, 1-2yr = Intermediate, 2-4yr = Advanced, 4+yr = Expert.`,
        messages: [{ role: 'user', content: `Extract from this resume:\n\n${text.slice(0, 3000)}` }]
      })
    })
    if (!response.ok) throw new Error('API error')
    const data = await response.json()
    const text2 = data.content?.[0]?.text || ''
    const clean = text2.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return null
  }
}

export const Participants: React.FC = () => {
  const [participantList, setParticipantList] = useState<Participant[]>(initialParticipants)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [csvPreview, setCsvPreview] = useState<CSVPreviewRow[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [importSuccess, setImportSuccess] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)
  const [resumeState, setResumeState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [resumeFileName, setResumeFileName] = useState('')

  const filtered = participantList.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    p.institution.toLowerCase().includes(search.toLowerCase())
  )

  const openAddModal = () => {
    setForm(emptyForm)
    setResumeState('idle')
    setResumeFileName('')
    setShowAddModal(true)
  }

  const handleAdd = () => {
    if (!form.name || !form.email) return
    const newP: Participant = {
      id: `p${Date.now()}`,
      name: form.name, email: form.email,
      institution: form.institution, level: form.level,
      skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
      status: form.status, registeredAt: new Date().toISOString(),
    }
    setParticipantList(prev => [...prev, newP])
    setForm(emptyForm)
    setResumeState('idle')
    setResumeFileName('')
    setShowAddModal(false)
  }

  const handleDelete = (id: string) => setParticipantList(prev => prev.filter(p => p.id !== id))

  const handleResumeUpload = async (file: File) => {
    if (!file.name.match(/\.(pdf|txt|doc|docx)$/i)) {
      alert('Please upload a PDF, TXT, DOC or DOCX file')
      return
    }
    setResumeFileName(file.name)
    setResumeState('loading')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      const extracted = await extractResumeWithAI(text)
      if (extracted) {
        setForm(prev => ({
          ...prev,
          name: extracted.name || prev.name,
          email: extracted.email || prev.email,
          institution: extracted.institution || prev.institution,
          level: (extracted.level as ParticipantLevel) || prev.level,
          skills: extracted.skills || prev.skills,
        }))
        setResumeState('done')
      } else {
        setResumeState('error')
      }
    }
    reader.onerror = () => setResumeState('error')
    reader.readAsText(file)
  }

  const handleFileRead = (file: File) => {
    if (!file.name.endsWith('.csv')) { alert('Only .csv files are allowed'); return }
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => { setCsvPreview(parseCSV(e.target?.result as string)); setImportSuccess(0) }
    reader.readAsText(file)
  }

  const handleImportConfirm = () => {
    const valid = csvPreview.filter(r => r.valid)
    setParticipantList(prev => [...prev, ...valid.map((r, i) => ({
      id: `csv_${Date.now()}_${i}`, name: r.name, email: r.email,
      institution: r.institution, level: r.level, skills: r.skills,
      status: r.status, registeredAt: new Date().toISOString(),
    }))])
    setImportSuccess(valid.length)
    setCsvPreview([]); setCsvFileName('')
    setTimeout(() => { setShowImportModal(false); setImportSuccess(0) }, 1800)
  }

  const handleDownloadSample = () => {
    const csv = `name,email,institution,level,skills,status
Rahul Verma,rahul.verma@iitd.ac.in,IIT Delhi,Intermediate,Python;ML;TensorFlow,Active
Priya Sharma,priya.sharma@iitb.ac.in,IIT Bombay,Advanced,React;Node.js;MongoDB,Active
Arjun Patel,arjun.patel@bits.ac.in,BITS Pilani,Beginner,Java;Spring Boot,Active
Meera Nair,meera.nair@nitk.ac.in,NIT Karnataka,Expert,DevOps;AWS;Terraform,Active
Karan Singh,karan.singh@iitm.ac.in,IIT Madras,Intermediate,Flutter;Firebase,Pending`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'sample_participants.csv'; a.click()
  }

  const validCount = csvPreview.filter(r => r.valid).length
  const invalidCount = csvPreview.filter(r => !r.valid).length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Participants</h1>
          <p className="text-sm text-gray-500 mt-0.5">{participantList.length} registered in roster</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { setCsvPreview([]); setCsvFileName(''); setShowImportModal(true) }}>
            <Upload size={15} /> Bulk Import CSV
          </Button>
          <Button variant="primary" onClick={openAddModal}>
            <Plus size={15} /> Add Participant
          </Button>
        </div>
      </div>

      {/* Candidate Portal Banner */}
      <div className="mb-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-indigo-500" />
          <div>
            <p className="text-sm font-semibold text-indigo-800">Candidate Self-Registration Portal</p>
            <p className="text-xs text-indigo-500">Candidates can upload their resume — AI automatically extracts skills and registers them</p>
          </div>
        </div>
        <a href="/candidate" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors whitespace-nowrap">
          <Link2 size={12} /> Share Link
        </a>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by name, email, or institution..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Name', 'Institution', 'Level', 'Skills', 'Status', 'Portal'].map(h => (
                  <th key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.institution}</td>
                  <td className="px-4 py-3"><Badge variant={levelVariant(p.level)}>{p.level}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.skills.map(skill => (
                        <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium">{skill}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge variant={statusVariant(p.status)}>{p.status}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a href={`/portal/${p.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                        View <ExternalLink size={12} />
                      </a>
                      <button onClick={() => handleDelete(p.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No participants found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD PARTICIPANT MODAL */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Participant" maxWidth="max-w-xl">
        <div className="space-y-4">

          {/* Resume Upload Box */}
          <div className="border border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-500" />
                <span className="text-sm font-semibold text-indigo-700">Auto-fill from Resume</span>
                <span className="text-xs text-indigo-400">(AI powered)</span>
              </div>
              {resumeState === 'done' && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle size={12} /> Fields auto-filled!
                </span>
              )}
            </div>

            {resumeState === 'idle' || resumeState === 'error' ? (
              <div>
                <button onClick={() => resumeInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 border border-indigo-200 rounded-lg py-2.5 text-sm text-indigo-600 font-medium hover:bg-indigo-50 transition-colors bg-white">
                  <FileUp size={15} /> Upload Resume (PDF / TXT)
                </button>
                <input ref={resumeInputRef} type="file" accept=".pdf,.txt,.doc,.docx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f) }} />
                {resumeState === 'error' && (
                  <p className="text-xs text-red-500 mt-1.5 text-center">Could not extract — please fill the form manually</p>
                )}
                <p className="text-xs text-indigo-400 text-center mt-1.5">
                  AI will read the resume and auto-fill the form below
                </p>
              </div>
            ) : resumeState === 'loading' ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-indigo-600">
                <Loader2 size={15} className="animate-spin" />
                <span>Reading resume — AI is extracting profile...</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <FileText size={14} className="text-green-500" />
                  <span className="font-medium">{resumeFileName}</span>
                </div>
                <button onClick={() => { setResumeState('idle'); setResumeFileName('') }}
                  className="text-xs text-gray-400 hover:text-gray-600">Remove</button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">or fill manually</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. Rahul Verma" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. rahul@iit.ac.in" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
            <input type="text" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. IIT Delhi" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value as ParticipantLevel })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ParticipantStatus })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option>Active</option><option>Pending</option><option>Inactive</option><option>Waitlisted</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills <span className="text-gray-400 font-normal">(comma-separated)</span></label>
            <input type="text" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. Python, ML, TensorFlow" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd} disabled={resumeState === 'loading'}>
              <Plus size={14} /> Add Participant
            </Button>
          </div>
        </div>
      </Modal>

      {/* CSV IMPORT MODAL */}
      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Bulk Import Participants via CSV">
        <div className="space-y-4">
          {importSuccess > 0 ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <CheckCircle size={48} className="text-green-500" />
              <p className="text-lg font-semibold text-gray-900">{importSuccess} participants imported successfully!</p>
            </div>
          ) : csvPreview.length === 0 ? (
            <>
              <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-500" />
                  <span className="text-sm text-blue-700 font-medium">First time? Download the sample CSV template</span>
                </div>
                <button onClick={handleDownloadSample}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1">
                  <Download size={12} /> Sample CSV
                </button>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-700 mb-1">Required CSV columns:</p>
                <code className="text-xs text-purple-700">name, email, institution, level, skills, status</code>
                <p className="mt-1">• <b>skills:</b> separate with semicolons — <code>Python;ML;React</code></p>
                <p>• <b>level:</b> Beginner / Intermediate / Advanced / Expert</p>
                <p>• <b>status:</b> Active / Pending / Inactive / Waitlisted (default: Active)</p>
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileRead(f) }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50'}`}>
                <Upload size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">Drop your CSV file here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input ref={fileInputRef} type="file" accept=".csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileRead(f) }} className="hidden" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{csvFileName}</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> {validCount} valid</span>
                  {invalidCount > 0 && <span className="text-red-500 font-medium flex items-center gap-1"><AlertCircle size={12} /> {invalidCount} errors</span>}
                </div>
              </div>
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>{['#', 'Name', 'Email', 'Institution', 'Level', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvPreview.map((row, i) => (
                      <tr key={i} className={row.valid ? 'bg-white' : 'bg-red-50'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{row.name || <span className="text-red-400">—</span>}</div>
                          {row.error && <div className="text-red-500">{row.error}</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.email}</td>
                        <td className="px-3 py-2 text-gray-600">{row.institution || '—'}</td>
                        <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{row.level}</span></td>
                        <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center pt-1">
                <button onClick={() => { setCsvPreview([]); setCsvFileName('') }}
                  className="text-sm text-gray-500 hover:text-gray-700">← Choose another file</button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
                  <Button variant="primary" onClick={handleImportConfirm} disabled={validCount === 0}>
                    <Upload size={14} /> Import {validCount} Participant{validCount !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}