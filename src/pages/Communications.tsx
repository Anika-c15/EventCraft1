import React, { useState } from 'react'
import { Send, Plus, Mail, Clock, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { communications as initialComms } from '../data/mockData'
import type { Communication, CommStatus } from '../types'

const statusVariant = (status: CommStatus) => {
  switch (status) {
    case 'Sent': return 'success'
    case 'Draft': return 'gray'
    case 'Scheduled': return 'info'
    case 'Failed': return 'danger'
    default: return 'default'
  }
}

const statusIcon = (status: CommStatus) => {
  switch (status) {
    case 'Sent': return <CheckCircle size={14} className="text-green-500" />
    case 'Draft': return <FileText size={14} className="text-gray-400" />
    case 'Scheduled': return <Clock size={14} className="text-blue-500" />
    case 'Failed': return <AlertCircle size={14} className="text-red-500" />
  }
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

const draftTemplates = [
  {
    stage: 'Team Formation',
    subject: 'Team Formation Complete — Meet Your Team!',
    body: `Dear {participant_name},

We're excited to announce that teams have been formed for EventCraft Hackathon 2026!

You have been assigned to {team_name}. Your teammates are:
{team_members}

Please connect with your team and begin planning your project. The evaluation phase begins on May 16, 2026.

Best regards,
EventCraft Team`,
  },
  {
    stage: 'Evaluation',
    subject: 'Evaluation Portal Now Open — Submission Guidelines',
    body: `Dear Judge,

The evaluation portal for EventCraft Hackathon 2026 is now open.

Please log in to submit your scores for each team. Evaluation criteria include:
- Innovation (0-10)
- Execution (0-10)
- Presentation (0-10)
- Impact (0-10)

Deadline: May 17, 2026 at 11:59 PM IST

Best regards,
EventCraft Team`,
  },
]

export const Communications: React.FC = () => {
  const [comms, setComms] = useState<Communication[]>(initialComms)
  const [showModal, setShowModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(0)
  const [customSubject, setCustomSubject] = useState('')
  const [customRecipient, setCustomRecipient] = useState('All Participants')
  const [customBody, setCustomBody] = useState('')

  const handleSend = () => {
    const newComm: Communication = {
      id: `c${Date.now()}`,
      recipient: customRecipient,
      subject: customSubject || draftTemplates[selectedTemplate].subject,
      status: 'Sent',
      sentAt: new Date().toISOString(),
      stage: draftTemplates[selectedTemplate].stage,
    }
    setComms((prev) => [newComm, ...prev])
    setShowModal(false)
    setCustomSubject('')
    setCustomBody('')
  }

  const handleSaveDraft = () => {
    const newComm: Communication = {
      id: `c${Date.now()}`,
      recipient: customRecipient,
      subject: customSubject || draftTemplates[selectedTemplate].subject,
      status: 'Draft',
      sentAt: new Date().toISOString(),
      stage: draftTemplates[selectedTemplate].stage,
    }
    setComms((prev) => [newComm, ...prev])
    setShowModal(false)
    setCustomSubject('')
    setCustomBody('')
  }

  const sentCount = comms.filter((c) => c.status === 'Sent').length
  const draftCount = comms.filter((c) => c.status === 'Draft').length
  const scheduledCount = comms.filter((c) => c.status === 'Scheduled').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sentCount} sent · {draftCount} drafts · {scheduledCount} scheduled
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={15} />
          New Communication
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
            <CheckCircle size={18} className="text-green-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{sentCount}</p>
            <p className="text-xs text-gray-500">Sent</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center">
            <FileText size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{draftCount}</p>
            <p className="text-xs text-gray-500">Drafts</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
            <Clock size={18} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{scheduledCount}</p>
            <p className="text-xs text-gray-500">Scheduled</p>
          </div>
        </div>
      </div>

      {/* Communication Log */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Communication Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Recipient
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Subject
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Stage
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Status
                </th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 text-left">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {comms.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{c.recipient}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-800 font-medium max-w-xs truncate">
                    {c.subject}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {c.stage}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {statusIcon(c.status)}
                      <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(c.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Communication Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New Communication"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {/* Template Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template
            </label>
            <div className="grid grid-cols-2 gap-2">
              {draftTemplates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTemplate(i)}
                  className={`text-left p-3 rounded-lg border text-sm transition-all ${
                    selectedTemplate === i
                      ? 'border-primary bg-orange-50 text-primary'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="font-medium">{t.stage}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{t.subject}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
            <select
              value={customRecipient}
              onChange={(e) => setCustomRecipient(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
            >
              <option>All Participants</option>
              <option>Judges Panel</option>
              <option>Team Alpha</option>
              <option>Team Beta</option>
              <option>Team Gamma</option>
              <option>Team Delta</option>
              <option>Winners</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={customSubject || draftTemplates[selectedTemplate].subject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
            <textarea
              value={customBody || draftTemplates[selectedTemplate].body}
              onChange={(e) => setCustomBody(e.target.value)}
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={handleSaveDraft}>
              Save as Draft
            </Button>
            <Button variant="primary" onClick={handleSend}>
              <Send size={14} />
              Send Now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
