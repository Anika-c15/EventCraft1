import React, { useState, useEffect } from 'react'
import { Bell, BellOff, CheckCircle, Mail, User, XCircle } from 'lucide-react'
import { subscribersApi, eventsApi } from '../api/client'

type Status = 'idle' | 'loading' | 'success' | 'error'
type View = 'subscribeForm' | 'subscribed' | 'unsubscribeForm' | 'unsubscribed'

export const Subscribe: React.FC = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subStatus, setSubStatus] = useState<Status>('idle')
  const [subError, setSubError] = useState('')

  const [unsubReason, setUnsubReason] = useState('')
  const [unsubLoading, setUnsubLoading] = useState(false)
  const [unsubError, setUnsubError] = useState('')

  const [view, setView] = useState<View>('subscribeForm')
  const [activeEventId, setActiveEventId] = useState<string>('')
  const [activeEventName, setActiveEventName] = useState<string>('')

  useEffect(() => {
    // First try to get event_id from URL query param (from committee-shared link)
    const params = new URLSearchParams(window.location.search)
    const urlEventId = params.get('event_id')

    if (urlEventId) {
      // Fetch event name for this specific event
      eventsApi.getActiveEvent().then(data => {
        // Verify the event exists by trying active-event, but use the URL param id
        setActiveEventId(urlEventId)
        // Try to get event name
        setActiveEventName(data.event_name)
      }).catch(() => {
        setActiveEventId(urlEventId)
      })
    } else {
      // Fallback to active event
      eventsApi.getActiveEvent().then(data => {
        setActiveEventId(data.event_id)
        setActiveEventName(data.event_name)
      }).catch(() => {})
    }
  }, [])

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setSubError('Name and email are both required'); return }
    if (!email.includes('@')) { setSubError('Please enter a valid email address'); return }
    if (!activeEventId) { setSubError('No active event found. Please try again later.'); return }
    setSubStatus('loading')
    setSubError('')
    try {
      await subscribersApi.subscribe(name.trim(), email.trim(), activeEventId)
      setView('subscribed')
      setSubStatus('idle')
    } catch (err: any) {
      setSubError(err.message || 'Something went wrong. Please try again.')
      setSubStatus('error')
    }
  }

  const handleUnsubscribe = async () => {
    if (!activeEventId) return
    setUnsubLoading(true)
    setUnsubError('')
    try {
      await subscribersApi.unsubscribe(email.trim(), activeEventId, unsubReason.trim())
      setView('unsubscribed')
    } catch (err: any) {
      setUnsubError(err.message || 'Failed to unsubscribe.')
    } finally {
      setUnsubLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 transition-colors duration-200">
      <div className="w-full max-w-md">

        {/* ── Subscribe Form ── */}
        {view === 'subscribeForm' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                <Bell size={28} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stay Notified</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Subscribe to get notified when new events are announced</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
              <form onSubmit={handleSubscribe} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Your Name</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={e => { setName(e.target.value); setSubError('') }}
                      placeholder="e.g. Priya Sharma"
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setSubError('') }}
                      placeholder="e.g. priya@iitb.ac.in"
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
                {subError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{subError}</p>
                )}
                <button
                  type="submit"
                  disabled={subStatus === 'loading'}
                  className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Bell size={15} />
                  {subStatus === 'loading' ? 'Subscribing…' : 'Notify Me for New Events'}
                </button>
              </form>
              <p className="text-xs text-gray-400 text-center mt-4">
                No spam — event announcements only. Unsubscribe anytime.
              </p>
            </div>
          </>
        )}

        {/* ── Subscribed Success ── */}
        {view === 'subscribed' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">You're subscribed!</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              We'll notify <b>{email}</b> whenever a new event is announced.
            </p>
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                onClick={() => setView('unsubscribeForm')}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 mx-auto"
              >
                <BellOff size={11} />
                Unsubscribe from future events
              </button>
            </div>
          </div>
        )}

        {/* ── Unsubscribe Form ── */}
        {view === 'unsubscribeForm' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4">
                <BellOff size={26} className="text-gray-500 dark:text-slate-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Unsubscribe</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">We're sorry to see you go</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Unsubscribing <b>{email}</b> from all future event notifications.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Reason <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={unsubReason}
                  onChange={e => setUnsubReason(e.target.value)}
                  placeholder="e.g. Not interested anymore"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-slate-600"
                />
              </div>
              {unsubError && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{unsubError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setView('subscribed')}
                  className="flex-1 py-2.5 text-sm border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnsubscribe}
                  disabled={unsubLoading}
                  className="flex-1 py-2.5 text-sm bg-gray-800 dark:bg-slate-700 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <BellOff size={14} />
                  {unsubLoading ? 'Processing…' : 'Unsubscribe Me'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                You can re-subscribe at any time.
              </p>
            </div>
          </>
        )}

        {/* ── Unsubscribed Success ── */}
        {view === 'unsubscribed' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
            <XCircle size={48} className="text-gray-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">You've been unsubscribed</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              <b>{email}</b> has been removed from our notification list.
            </p>
            <p className="text-xs text-gray-400 mt-3">You won't receive any future event announcements.</p>
            <button
              onClick={() => { setView('subscribeForm'); setName(''); setEmail(''); setUnsubReason('') }}
              className="mt-5 text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
            >
              <Bell size={12} /> Subscribe again
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
