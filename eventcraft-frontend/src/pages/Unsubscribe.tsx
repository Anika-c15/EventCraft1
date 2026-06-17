import React, { useState, useEffect } from 'react'
import { BellOff, Mail, CheckCircle, ChevronDown, Loader2, ShieldCheck } from 'lucide-react'
import { subscribersApi, eventsApi, authApi } from '../api/client'

const REASONS = [
  'I no longer want to receive these emails',
  'I never signed up for this',
  'The emails are too frequent',
  'The content is not relevant to me',
  'Other',
]

type View = 'form' | 'otp' | 'success'

export const Unsubscribe: React.FC = () => {
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [activeEventId, setActiveEventId] = useState<string>('')
  const [view, setView] = useState<View>('form')
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [fromEmailLink, setFromEmailLink] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlEmail = params.get('email')
    const urlEventId = params.get('event_id')

    if (urlEmail) setEmail(urlEmail)
    if (urlEventId) {
      setActiveEventId(urlEventId)
    } else {
      eventsApi.getActiveEvent().then(data => setActiveEventId(data.event_id)).catch(() => {})
    }

    // One-click from email link — auto unsubscribe immediately
    if (urlEmail && urlEventId) {
      setFromEmailLink(true)
      subscribersApi.unsubscribe(urlEmail, urlEventId, 'Unsubscribed via email link')
        .then(() => setView('success'))
        .catch(() => setView('success')) // idempotent — already unsubscribed is fine
    }
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address'); return }
    if (!activeEventId) { setError('Could not determine the event. Please try again.'); return }
    setSendingOtp(true)
    setError('')
    try {
      await authApi.sendOtp(email.trim())
      setView('otp')
      setResendCooldown(30)
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP.')
    } finally {
      setSendingOtp(false)
    }
  }

  const handleVerifyAndUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp.trim() || otp.length < 4) { setError('Please enter the OTP'); return }
    setOtpLoading(true)
    setError('')
    try {
      await authApi.verifyOtp(email.trim(), otp.trim())
      await subscribersApi.unsubscribe(email.trim(), activeEventId, reason)
      setView('success')
    } catch (err: any) {
      setError(err.message || 'Invalid OTP or email not found.')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    try {
      await authApi.sendOtp(email.trim())
      setResendCooldown(30)
    } catch {}
  }

  // Loading state while auto-unsubscribing from email link
  if (fromEmailLink && view !== 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 size={36} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-gray-500">Processing your unsubscribe request…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Success */}
        {view === 'success' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4">
                <BellOff size={26} className="text-gray-500 dark:text-slate-400" />
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">You've been unsubscribed</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                <b>{email}</b> has been removed from our notification list.
              </p>
              <p className="text-xs text-gray-400 mt-3">You won't receive any future event announcements from us.</p>
              <a href="/subscribe" className="mt-5 inline-block text-xs text-primary hover:underline">
                Subscribe again
              </a>
            </div>
          </>
        )}

        {/* Step 1: Email + Reason */}
        {view === 'form' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4">
                <BellOff size={26} className="text-gray-500 dark:text-slate-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Unsubscribe</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">We'll send a code to verify it's you</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="email" value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="e.g. priya@iitb.ac.in"
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <select value={reason} onChange={e => setReason(e.target.value)}
                      className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-700 dark:text-slate-300">
                      <option value="">Select a reason…</option>
                      {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={sendingOtp}
                  className="w-full bg-gray-800 dark:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  {sendingOtp ? <Loader2 size={15} className="animate-spin" /> : <BellOff size={15} />}
                  {sendingOtp ? 'Sending OTP…' : 'Continue — Verify Email'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Step 2: OTP */}
        {view === 'otp' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4">
                <ShieldCheck size={26} className="text-gray-500 dark:text-slate-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify Your Email</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-8">
              <form onSubmit={handleVerifyAndUnsubscribe} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Enter OTP</label>
                  <input type="text" value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                    placeholder="6-digit code" maxLength={6} autoFocus
                    className="w-full text-center text-xl font-bold tracking-widest px-4 py-3 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={otpLoading || otp.length < 4}
                  className="w-full bg-gray-800 dark:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  {otpLoading ? <Loader2 size={15} className="animate-spin" /> : <BellOff size={15} />}
                  {otpLoading ? 'Processing…' : 'Verify & Unsubscribe'}
                </button>
              </form>
              <div className="mt-4 text-center space-y-2">
                <button onClick={handleResendOtp} disabled={resendCooldown > 0}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50">
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                </button>
                <br />
                <button onClick={() => { setView('form'); setOtp(''); setError('') }}
                  className="text-xs text-gray-400 hover:text-gray-600">
                  ← Change email
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
