import React, { useState } from 'react'
import { Bell, CheckCircle, Mail, User } from 'lucide-react'
import { useAppContext } from '../context/AppContext'

export const Subscribe: React.FC = () => {
  const { addSubscriber } = useAppContext()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setError('Name and email are both required'); return }
    if (!email.includes('@')) { setError('Please enter a valid email address'); return }
    const success = addSubscriber(name.trim(), email.trim())
    if (!success) { setError('This email is already subscribed!'); return }
    setSubmitted(true)
    setError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 transition-colors duration-200">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Bell size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Stay Notified</h1>
          <p className="text-sm text-gray-500 mt-1">Subscribe to get notified when new events are announced</p>
        </div>

        {submitted ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1">You are subscribed!</h2>
            <p className="text-sm text-gray-500">
              We will notify <b>{email}</b> whenever a new event is announced.
            </p>
            <p className="text-xs text-gray-400 mt-4">
              To unsubscribe, please contact the organizing committee.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setError('') }}
                    placeholder="e.g. Priya Sharma"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="e.g. priya@iitb.ac.in"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Bell size={15} />
                Notify Me for New Events
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              No spam — event announcements only. Unsubscribe anytime by contacting the committee.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}