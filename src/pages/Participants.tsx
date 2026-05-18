import React, { useState } from 'react'
import { Upload, Plus, ExternalLink, Trash2, Search, X } from 'lucide-react'
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
  name: '',
  email: '',
  institution: '',
  level: 'Intermediate' as ParticipantLevel,
  skills: '',
  status: 'Active' as ParticipantStatus,
}

export const Participants: React.FC = () => {
  const [participantList, setParticipantList] = useState<Participant[]>(initialParticipants)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  const filtered = participantList.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      p.institution.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = () => {
    if (!form.name || !form.email) return
    const newP: Participant = {
      id: `p${Date.now()}`,
      name: form.name,
      email: form.email,
      institution: form.institution,
      level: form.level,
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
      status: form.status,
      registeredAt: new Date().toISOString(),
    }
    setParticipantList((prev) => [...prev, newP])
    setForm(emptyForm)
    setShowAddModal(false)
  }

  const handleDelete = (id: string) => {
    setParticipantList((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Participants</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {participantList.length} registered in roster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Upload size={15} />
            Bulk Import
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

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                  Name
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                  Institution
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                  Level
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                  Skills
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                  Status
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left bg-gray-50">
                  Portal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.institution}</td>
                  <td className="px-4 py-3">
                    <Badge variant={levelVariant(p.level)}>{p.level}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/portal/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
                      >
                        View Portal
                        <ExternalLink size={12} />
                      </a>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                        title="Delete participant"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    No participants found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Participant Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Participant"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. Rahul Verma"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="e.g. rahul@iit.ac.in"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
            <input
              type="text"
              value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. IIT Delhi"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value as ParticipantLevel })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ParticipantStatus })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                <option>Active</option>
                <option>Pending</option>
                <option>Inactive</option>
                <option>Waitlisted</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. Python, ML, TensorFlow"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAdd}>
              <Plus size={14} />
              Add Participant
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
