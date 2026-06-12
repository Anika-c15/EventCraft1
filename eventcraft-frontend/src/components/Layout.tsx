import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Bot, Sparkles, GitBranch, ArrowRight, X, Users, Mail } from 'lucide-react'
import { OmniAgentSidebar } from './OmniAgentSidebar'
import { useAppContext } from '../context/AppContext'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const Layout: React.FC = () => {
  const { eventId, approvals, dashboardStats } = useAppContext()
  const token = localStorage.getItem('ec_token') || ''
  const [isOpen, setIsOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const navigate = useNavigate()

  // Committee invite state
  const [invites, setInvites] = useState<any[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const pendingProgression = approvals.find(
    (a: any) => a.status === 'pending' && a.type === 'Progression'
  )
  const showAdvanceBanner = !!pendingProgression && !bannerDismissed

  const stageDesc = pendingProgression?.description || ''
  const stageMatch = stageDesc.match(/'([^']+)'\s*→\s*'([^']+)'/)
  const fromStage = stageMatch?.[1] ?? dashboardStats?.current_stage ?? 'Current Stage'
  const toStage = stageMatch?.[2] ?? 'Next Stage'

  const loadInvites = async () => {
    if (!eventId || !token) return
    try {
      const res = await fetch(`${BASE_URL}/api/events/${eventId}/invites`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setInvites(await res.json())
    } catch {}
  }

  useEffect(() => { loadInvites() }, [eventId])

  const handleInvite = async () => {
    if (!inviteEmail || !eventId) return
    setInviteLoading(true)
    setInviteError('')
    try {
      const res = await fetch(`${BASE_URL}/api/events/${eventId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail })
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Failed to send invite')
      }
      setInviteEmail('')
      setShowInviteModal(false)
      await loadInvites()
    } catch (e: any) {
      setInviteError(e.message)
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRemoveInvite = async (inviteId: string) => {
    if (!eventId) return
    try {
      await fetch(`${BASE_URL}/api/events/${eventId}/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      await loadInvites()
    } catch {}
  }

  return (
    <div className="flex min-h-screen bg-background dark:bg-slate-950 transition-colors duration-200 relative">
      
      {/* ONLY SHOW LEFT COLUMN IF AN EVENT EXISTS */}
      {eventId && (
        <div className="flex flex-col">
          <Sidebar />

          {/* Committee Members Panel — inside sidebar column */}
          <div className="w-60 px-3 pb-4 border-t border-gray-100 dark:border-slate-800 mt-2 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Users size={12} className="text-gray-400" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Committee
                </span>
              </div>
              <button
                onClick={() => { setShowInviteModal(true); setInviteError('') }}
                className="text-[10px] text-primary hover:underline font-bold"
              >
                + Invite
              </button>
            </div>

            <div className="space-y-1">
              {invites.length === 0 && (
                <p className="text-[10px] text-gray-400 px-1">No co-admins yet</p>
              )}
              {invites.map((inv: any) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 group"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">
                      {inv.email.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] text-gray-700 dark:text-slate-300 truncate max-w-[90px]">
                      {inv.email}
                    </span>
                    {inv.is_accepted
                      ? <span className="text-[8px] text-green-600 bg-green-50 dark:bg-green-950/30 px-1 rounded-full flex-shrink-0">Active</span>
                      : <span className="text-[8px] text-orange-500 bg-orange-50 dark:bg-orange-950/30 px-1 rounded-full flex-shrink-0">Pending</span>
                    }
                  </div>
                  <button
                    onClick={() => handleRemoveInvite(inv.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 flex-shrink-0 ml-1"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        {/* Pipeline Advance Notification Banner */}
        {showAdvanceBanner && (
          <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-orange-400 text-white px-5 py-2.5 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <GitBranch size={15} className="flex-shrink-0 animate-pulse" />
              <p className="text-sm font-semibold truncate">
                Pipeline ready to advance:
                <span className="font-normal opacity-90 ml-1">
                  <strong>{fromStage}</strong> → <strong>{toStage}</strong>
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigate('/approvals')}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                Approve Now <ArrowRight size={12} />
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Floating AI Companion Trigger */}
      {eventId && (
        <>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="fixed bottom-6 right-6 z-40 p-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all cursor-pointer flex items-center justify-center border border-white/10"
          >
            <div className="relative">
              <Bot size={22} className="animate-pulse" />
              <Sparkles size={11} className="absolute -top-1.5 -right-1.5 text-yellow-300 animate-bounce" />
            </div>
          </button>

          <OmniAgentSidebar
            eventId={eventId}
            role="admin"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />
        </>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/30 rounded-xl flex items-center justify-center">
                <Mail size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Invite Co-Admin</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">They'll get an email to join this event</p>
              </div>
            </div>

            <input
              type="email"
              placeholder="colleague@email.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
              autoFocus
            />

            {inviteError && (
              <p className="text-xs text-red-500 mb-3">{inviteError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteError('') }}
                className="flex-1 border border-gray-200 dark:border-slate-700 rounded-xl py-2 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviteLoading || !inviteEmail}
                className="flex-1 bg-primary text-white rounded-xl py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
              >
                {inviteLoading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}