import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Bot, Sparkles } from 'lucide-react'
import { OmniAgentSidebar } from './OmniAgentSidebar'
import { useAppContext } from '../context/AppContext'

export const Layout: React.FC = () => {
  const { eventId } = useAppContext()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background dark:bg-slate-950 transition-colors duration-200 relative">
      <Sidebar />
      <main className="flex-1 overflow-auto">
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
