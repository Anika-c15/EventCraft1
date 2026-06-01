import React, { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Bot, Sparkles, GitBranch, ArrowRight, X } from 'lucide-react'
import { OmniAgentSidebar } from './OmniAgentSidebar'
import { useAppContext } from '../context/AppContext'

export const Layout: React.FC = () => {
  const { eventId, approvals, dashboardStats } = useAppContext()
  const [isOpen, setIsOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const navigate = useNavigate()

  // Show banner when there's a pending Progression approval (stage advance ready)
  const pendingProgression = approvals.find(
    a => a.status === 'pending' && a.type === 'Progression'
  )
  const showAdvanceBanner = !!pendingProgression && !bannerDismissed

  // Extract stage info from the approval description
  const stageDesc = pendingProgression?.description || ''
  const stageMatch = stageDesc.match(/'([^']+)'\s*→\s*'([^']+)'/)
  const fromStage = stageMatch?.[1] ?? dashboardStats?.current_stage ?? 'Current Stage'
  const toStage = stageMatch?.[2] ?? 'Next Stage'

  return (
    <div className="flex min-h-screen bg-background dark:bg-slate-950 transition-colors duration-200 relative">
      <Sidebar />
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
    </div>
  )
}
