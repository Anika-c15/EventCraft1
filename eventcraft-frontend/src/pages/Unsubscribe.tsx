import React, { useState } from 'react'
import { BellOff, Mail, CheckCircle, ChevronDown } from 'lucide-react'
import { subscribersApi } from '../api/client'

const REASONS = [
  'I no longer want to receive these emails',
  'I never signed up for this',
  'The emails are too frequent',
  'The content is not relevant to me',
  'Other',
]

type Status = 'idle' | 'loading' | 'success' | 'error'

export const Unsubscribe: React.FC = () => {
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email address'); return }
    if (!email.includes('@')) { setError('Please enter a valid email address'); return }

    setStatus('loading')
    setError('')
    try {
      await subscribersApi.unsubscribe(email.trim(), reason)
      setStatus('success')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4">
            <BellOff size={26} className="text-gray-500 dark:text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Unsubscribe</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            We're sorry to see you go. Enter your email below to unsubscribe.
          </p>
        </div>

        {status === 'success' ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">You've been unsubscribed</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              <b>{email}</b> has been removed from our notification list.
            </p>
            <p className="text-xs text-gray-400 mt-3">You won't receive any future event announcements from us.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="e.g. priya@iitb.ac.in"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-slate-600"
                  />
                </div>
              </div>

              {/* Reason — optional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Reason <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-slate-600 text-gray-700 dark:text-slate-300"
                  >
                    <option value="">Select a reason…</option>
                    {REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-gray-800 dark:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <BellOff size={15} />
                {status === 'loading' ? 'Processing…' : 'Unsubscribe Me'}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              Changed your mind?{' '}
              <a href="/subscribe" className="text-primary hover:underline">Subscribe again</a>
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
