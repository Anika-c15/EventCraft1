import React, { useState } from 'react'
import { Bell, BellOff, CheckCircle, Mail, User } from 'lucide-react'
import { subscribersApi } from '../api/client'

type Status = 'idle' | 'loading' | 'success' | 'error'

export const Subscribe: React.FC = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  // Unsubscribe (shown after success)
  const [unsubLoading, setUnsubLoading] = useState(false)
  const [unsubDone, setUnsubDone] = useState(false)
  const [unsubError, setUnsubError] = useState('')

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setError('Name and email are both required'); return }
    if (!email.includes('@')) { setError('Please enter a valid email address'); return }
    setStatus('loading')
    setError('')
    try {
      await subscribersApi.subscribe(name.trim(), email.trim())
      setStatus('success')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const handleUnsubscribe = async () => {
    setUnsubLoading(true)
    setUnsubError('')
    try {
      await subscribersApi.unsubscribe(email.trim())
      setUnsubDone(true)
    } catch (err: any) {
      setUnsubError(err.message || 'Failed to unsubscribe.')
    } finally {
      setUnsubLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 transition-colors duration-200">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Bell size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stay Notified</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Subscribe to get notified when new events are announced</p>
        </div>

        {status === 'success' ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">You're subscribed!</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              We'll notify <b>{email}</b> whenever a new event is announced.
            </p>

            {/* Unsubscribe link */}
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800">
              {unsubDone ? (
                <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
                  <BellOff size={11} /> You've been unsubscribed.
                </p>
              ) : (
                <>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={unsubLoading}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 mx-auto disabled:opacity-50"
                  >
                    <BellOff size={11} />
                    {unsubLoading ? 'Unsubscribing…' : 'Unsubscribe from future events'}
                  </button>
                  {unsubError && <p className="text-xs text-red-500 mt-1">{unsubError}</p>}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
            <form onSubmit={handleSubscribe} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Your Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
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
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="e.g. priya@iitb.ac.in"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Bell size={15} />
                {status === 'loading' ? 'Subscribing…' : 'Notify Me for New Events'}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              No spam — event announcements only. Unsubscribe anytime.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
