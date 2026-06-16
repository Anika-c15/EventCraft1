import React, { useState, useEffect, useCallback } from 'react'
import { Bell, Trash2, Send, Users, CheckCircle, ExternalLink, Loader2 } from 'lucide-react'
import { subscribersApi } from '../api/client'
import { useAppContext } from '../context/AppContext'

export const Subscribers: React.FC = () => {
  const { eventId, eventName: currentEventName } = useAppContext()
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [eventName, setEventName] = useState('')
  const [description, setDescription] = useState('')
  const [notified, setNotified] = useState<number | null>(null)
  const [notifyFailed, setNotifyFailed] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [notifying, setNotifying] = useState(false)

  const loadSubscribers = useCallback(async () => {
    if (!eventId) return
    try {
      const data = await subscribersApi.list(eventId)
      setSubscribers(data)
    } catch (e) {
      console.error('Failed to load subscribers', e)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { loadSubscribers() }, [loadSubscribers])

  // Pre-fill event name from context
  useEffect(() => {
    if (currentEventName) setEventName(currentEventName)
  }, [currentEventName])

  const handleRemove = async (id: string) => {
    try {
      await subscribersApi.remove(id)
      setSubscribers(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      console.error('Failed to remove subscriber', e)
    }
  }

  const handleNotify = async () => {
    if (!eventName.trim() || !eventId) return
    setNotifying(true)
    try {
      const res = await subscribersApi.notifyAll(eventId, eventName, description)
      const sent = (res as any).sent ?? res.notified
      const failed = (res as any).failed ?? 0
      setNotified(sent)
      setNotifyFailed(failed)
      await loadSubscribers()
      setDescription('')
      setShowForm(false)
      setTimeout(() => { setNotified(null); setNotifyFailed(0) }, 5000)
    } catch (e) {
      console.error('Failed to notify subscribers', e)
    } finally {
      setNotifying(false)
    }
  }

  const unnotified = subscribers.filter(s => !s.notified).length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscribers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subscribers.length} people subscribed</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/subscribe?event_id=${eventId || ''}`}
            target="_blank"
            className="flex items-center gap-1.5 text-sm text-primary border border-primary/30 rounded-lg px-3 py-2 hover:bg-primary/5 transition-colors"
          >
            <ExternalLink size={14} />
            Subscribe Page
          </a>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send size={15} />
            Notify All {unnotified > 0 && <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{unnotified}</span>}
          </button>
        </div>
      </div>

      {/* Success banner */}
      {notified !== null && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle size={16} className="text-green-500" />
          <p className="text-sm font-medium text-green-700">
            {notified > 0
              ? `Emails sent to ${notified} subscriber${notified > 1 ? 's' : ''}${notifyFailed > 0 ? ` · ${notifyFailed} failed` : ''}`
              : 'All subscribers are already notified.'}
          </p>
        </div>
      )}

      {/* Notify Form */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><Bell size={15} /> Event Announcement</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Event Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. EventCraft Hackathon 2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Short Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Registrations are now open! Join us for..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-2 hover:text-gray-700">Cancel</button>
              <button
                onClick={handleNotify}
                disabled={!eventName.trim() || notifying}
                className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {notifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send to {subscribers.length} Subscribers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading subscribers…</span>
        </div>
      ) : subscribers.length === 0 ? (
        /* Empty state */
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Users size={20} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">No subscribers yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left">Name</th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left">Email</th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left">Subscribed</th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left">Status</th>
                <th className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subscribers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(s.subscribed_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.notified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {s.notified ? '✓ Notified' : '⏳ Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleRemove(s.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
