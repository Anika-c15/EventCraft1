import React, { useState, useEffect, useRef } from 'react'
import { Upload, Plus, ExternalLink, Trash2, Search, X, Send, Copy, Check } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { TableSkeleton } from '../components/ui/Skeleton'
import { participantsApi, communicationsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import { useToast, useConfirm } from '../context/ToastAndConfirmContext'
import type { ParticipantLevel, ParticipantStatus } from '../types'

const levelVariant = (level: string) => {
  switch (level) {
    case 'Beginner': return 'info'
    case 'Intermediate': return 'success'
    case 'Advanced': return 'warning'
    case 'Expert': return 'danger'
    default: return 'default'
  }
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'Active': return 'success'
    case 'Pending': return 'warning'
    case 'Inactive': return 'gray'
    case 'Waitlisted': return 'purple'
    default: return 'default'
  }
}

const emptyForm = {
  name: '',
  email: '',
  institution: '',
  level: 'Intermediate' as ParticipantLevel,
  skills: '',
  status: 'Active' as ParticipantStatus,
}

export const Participants: React.FC = () => {
  const { eventId } = useAppContext()
  const toast = useToast()
  const confirm = useConfirm()
  const [participants, setParticipants] = useState<any[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sendingLinks, setSendingLinks] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (eventId) load()
  }, [eventId, search])

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const data = await participantsApi.list(eventId, search || undefined)
      setParticipants(data)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!form.name || !form.email || !eventId) return
    try {
      await participantsApi.add(eventId, {
        name: form.name,
        email: form.email,
        institution: form.institution || undefined,
        level: form.level,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        status: form.status,
      })
      setForm(emptyForm)
      setShowAddModal(false)
      toast.success('Participant added successfully')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!eventId) return
    // THIS is your pop-up!
    const confirmed = await confirm({
      title: 'Remove Participant',
      message: 'Are you sure you want to remove this participant? This action cannot be undone.',
      confirmText: 'Remove',
      type: 'danger'
    })
    if (!confirmed) return
    try {
      await participantsApi.delete(eventId, id)
      toast.success('Participant removed successfully')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !eventId) return
    setImporting(true)
    try {
      const result = await participantsApi.importCsv(eventId, file)
      toast.success(`Imported ${result.imported} participants. Skipped: ${result.skipped}`)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSendPortalLinks = async () => {
    if (!eventId) return
    const confirmed = await confirm({
      title: 'Send Portal Links',
      message: `Send personal portal links to all ${participants.length} participants via email?`,
      confirmText: 'Send Links',
      type: 'info'
    })
    if (!confirmed) return
    setSendingLinks(true)
    try {
      const result = await communicationsApi.sendPortalLinks(eventId)
      toast.success(`Portal links sent to ${result.recipients} participants successfully!`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSendingLinks(false)
    }
  }

  const copyPortalLink = (p: any) => {
    const url = `${window.location.origin}/portal/${p.portal_token}?event=${eventId}`
    navigator.clipboard.writeText(url)
    setCopiedId(p.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Participants</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {participants.length} registered in roster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <Button
            variant="secondary"
            onClick={handleSendPortalLinks}
            disabled={sendingLinks || participants.length === 0}
            title="Email each participant their unique portal link"
          >
            <Send size={15} />
            {sendingLinks ? 'Sending...' : 'Send Portal Links'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload size={15} />
            {importing ? 'Importing...' : 'Bulk Import'}
          </Button>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            <Plus size={15} />
            Add Participant
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search participants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* CSV hint */}
      <div className="mb-4 text-xs text-gray-400">
        CSV format: <code className="bg-gray-100 px-1 rounded">name, email, institution, level, skills</code>
        {' '}(skills comma-separated in quotes)
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Name', 'Institution', 'Level', 'Skills', 'Status', 'Portal'].map((h) => (
                  <th key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : participants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Search size={36} className="text-gray-200 dark:text-slate-700" />
                      <p className="text-sm font-medium text-gray-400 dark:text-slate-500">No participants found</p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="text-xs text-primary font-semibold hover:underline"
                      >
                        + Add your first participant
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                participants.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.institution || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={levelVariant(p.level) as any}>{p.level}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.skills || []).map((skill: string) => (
                          <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(p.status) as any}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.portal_token && (
                          <>
                            <a
                              href={`/portal/${p.portal_token}?event=${eventId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
                            >
                              View
                              <ExternalLink size={12} />
                            </a>
                            <button
                              onClick={() => copyPortalLink(p)}
                              className="p-1 text-gray-400 hover:text-primary transition-colors rounded"
                              title="Copy portal link"
                            >
                              {copiedId === p.id
                                ? <Check size={13} className="text-green-500" />
                                : <Copy size={13} />}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Participant">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. Rahul Verma" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. rahul@iit.ac.in" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
            <input type="text" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. IIT Delhi" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as ParticipantLevel })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option>Beginner</option><option>Intermediate</option>
                <option>Advanced</option><option>Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ParticipantStatus })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option>Active</option><option>Pending</option>
                <option>Inactive</option><option>Waitlisted</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input type="text" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. Python, ML, TensorFlow" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd}><Plus size={14} />Add Participant</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
