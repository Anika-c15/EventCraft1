import React, { useState, useEffect } from 'react'
import { Bell, BellOff, CheckCircle, Mail, User, XCircle, Loader2, ShieldCheck } from 'lucide-react'
import { subscribersApi, eventsApi, authApi } from '../api/client'

type View = 'form' | 'otp' | 'subscribed' | 'unsubscribeForm' | 'unsubscribed'

export const Subscribe: React.FC = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [view, setView] = useState<View>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const [unsubReason, setUnsubReason] = useState('')
  const [unsubLoading, setUnsubLoading] = useState(false)
  const [unsubError, setUnsubError] = useState('')

  const [activeEventId, setActiveEventId] = useState<string>('')
  const [activeEventName, setActiveEventName] = useState<string>('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlEventId = params.get('event_id')
    if (urlEventId) {
      setActiveEventId(urlEventId)
      eventsApi.getActiveEvent().then(data => setActiveEventName(data.event_name)).catch(() => {})
    } else {
      eventsApi.getActiveEvent().then(data => {
        setActiveEventId(data.event_id)
        setActiveEventName(data.event_name)
      }).catch(() => {})
    }
  }, [])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter your name'); return }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address'); return }
    if (!activeEventId) { setError('No active event found. Please try again.'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.sendOtp(email.trim())
      setView('otp')
      setResendCooldown(30)
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp.trim() || otp.length < 4) { setError('Please enter the OTP sent to your email'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.verifyOtp(email.trim(), otp.trim())
      await subscribersApi.subscribe(name.trim(), email.trim(), activeEventId)
      setView('subscribed')
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    setResending(true)
    setError('')
    try {
      await authApi.sendOtp(email.trim())
      setResendCooldown(30)
    } catch (err: any) {
      setError('Failed to resend OTP.')
    } finally {
      setResending(false)
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

        {/* ── Step 1: Name + Email ── */}
        {view === 'form' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                <Bell size={28} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stay Notified</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                {activeEventName ? `Subscribe for updates on ${activeEventName}` : 'Subscribe to get notified when new events are announced'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
              <form onSubmit={handleSendOtp} className="space-y-4">
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
                  disabled={loading}
                  className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
                  {loading ? 'Sending OTP…' : 'Continue — Verify Email'}
                </button>
              </form>
              <p className="text-xs text-gray-400 text-center mt-4">
                We'll send a 6-digit code to verify your email is real.
              </p>
            </div>
          </>
        )}

        {/* ── Step 2: OTP Verification ── */}
        {view === 'otp' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                <ShieldCheck size={28} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify Your Email</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
              <form onSubmit={handleVerifyAndSubscribe} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Enter OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="w-full text-center text-xl font-bold tracking-widest px-4 py-3 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || otp.length < 4}
                  className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  {loading ? 'Verifying…' : 'Verify & Subscribe'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || resending}
                  className="text-xs text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : resending ? 'Resending…' : 'Resend OTP'}
                </button>
              </div>
              <div className="mt-3 text-center">
                <button onClick={() => { setView('form'); setOtp(''); setError('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                  ← Change email
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Subscribed Success ── */}
        {view === 'subscribed' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">You're subscribed!</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              We'll notify <b>{email}</b> about updates for {activeEventName || 'this event'}.
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
                Unsubscribing <b>{email}</b> from event notifications.
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
                <button onClick={() => setView('subscribed')}
                  className="flex-1 py-2.5 text-sm border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button onClick={handleUnsubscribe} disabled={unsubLoading}
                  className="flex-1 py-2.5 text-sm bg-gray-800 dark:bg-slate-700 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  <BellOff size={14} />
                  {unsubLoading ? 'Processing…' : 'Unsubscribe Me'}
                </button>
              </div>
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
            <button
              onClick={() => { setView('form'); setName(''); setEmail(''); setOtp(''); setUnsubReason('') }}
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
