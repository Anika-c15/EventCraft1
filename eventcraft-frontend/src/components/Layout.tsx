import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Bot, Sparkles, GitBranch, ArrowRight, X } from 'lucide-react'
import { OmniAgentSidebar } from './OmniAgentSidebar'
import { useAppContext } from '../context/AppContext'
import { useToast } from '../context/ToastAndConfirmContext'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const Layout: React.FC = () => {
  const { eventId, approvals, dashboardStats, loadEventsList, setEventId, user } = useAppContext()
  const [isOpen, setIsOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const [pendingInvites, setPendingInvites] = useState<any[]>([])

  const loadPendingInvites = async () => {
    const token = localStorage.getItem('ec_token')
    if (!token) return
    try {
      const res = await fetch(`${BASE_URL}/api/events/invitations/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setPendingInvites(await res.json())
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (user) {
      loadPendingInvites()
    }
  }, [user])

  const handleAcceptInvite = async (inviteId: string, eventIdToSwitch: string, eventName: string) => {
    const token = localStorage.getItem('ec_token')
    try {
      const res = await fetch(`${BASE_URL}/api/events/invitations/${inviteId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        toast.success(`Accepted invitation to manage "${eventName || 'Event'}"!`)
        await loadEventsList()
        setEventId(eventIdToSwitch)
        await loadPendingInvites()
        navigate('/dashboard')
      } else {
        toast.error("Failed to accept invitation.")
      }
    } catch (err) {
      toast.error("An error occurred while accepting.")
    }
  }

  const handleDeclineInvite = async (inviteId: string, eventName: string) => {
    const token = localStorage.getItem('ec_token')
    try {
      const res = await fetch(`${BASE_URL}/api/events/invitations/${inviteId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        toast.success(`Declined invitation to manage "${eventName || 'Event'}".`)
        await loadPendingInvites()
      } else {
        toast.error("Failed to decline invitation.")
      }
    } catch (err) {
      toast.error("An error occurred while declining.")
    }
  }

  const pendingProgression = approvals.find(
    (a: any) => a.status === 'pending' && a.type === 'Progression'
  )
  const showAdvanceBanner = !!pendingProgression && !bannerDismissed

  const stageDesc = pendingProgression?.description || ''
  const stageMatch = stageDesc.match(/'([^']+)'\s*→\s*'([^']+)'/)
  const fromStage = stageMatch?.[1] ?? dashboardStats?.current_stage ?? 'Current Stage'
  const toStage = stageMatch?.[2] ?? 'Next Stage'



  return (
    <div className="flex min-h-screen bg-background dark:bg-slate-950 transition-colors duration-200 relative">
      
      {/* ONLY SHOW LEFT COLUMN IF AN EVENT EXISTS */}
      {eventId && <Sidebar />}

      <main className="flex-1 overflow-auto">
        {/* Pending Invitations Banner */}
        {pendingInvites.map((invite) => (
          <div
            key={invite.id}
            className="sticky top-0 z-30 bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3 flex items-center justify-between gap-3 shadow-md border-b border-orange-400/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base flex-shrink-0 animate-bounce">📩</span>
              <p className="text-sm font-semibold truncate">
                Co-Admin Invitation:
                <span className="font-normal opacity-90 ml-1">
                  You have been invited to co-manage the event{' '}
                  <strong>{invite.event_name || 'EventCraft Workspace'}</strong>.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleDeclineInvite(invite.id, invite.event_name)}
                className="bg-transparent hover:bg-white/10 text-white/90 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border border-white/20 cursor-pointer"
              >
                Decline
              </button>
              <button
                onClick={() => handleAcceptInvite(invite.id, invite.event_id, invite.event_name)}
                className="bg-white hover:bg-orange-50 text-orange-600 text-xs font-black px-4 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                Accept & Enter
              </button>
            </div>
          </div>
        ))}

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


    </div>
  )
}