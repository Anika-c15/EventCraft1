import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, User, Users, ClipboardList, Send, GitBranch,
  Shield, Settings, Sliders, ChevronLeft, ChevronRight, Bot, LogOut,
  Bell, Sun, Moon, Trophy, ChevronsUpDown, Trash2
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import logoImage from '../assets/logo.png'

const navItems = [
  { path: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, exact: true },
  { path: '/participants',    label: 'Participants',     icon: User },
  { path: '/teams',           label: 'Teams',            icon: Users },
  { path: '/evaluations',     label: 'Evaluations',      icon: ClipboardList },
  { path: '/communications',  label: 'Communications',   icon: Send },
  { path: '/pipeline',        label: 'Pipeline',         icon: GitBranch },
  { path: '/approvals',       label: 'Approvals',        icon: Shield },
  { path: '/formation-rules', label: 'Formation Rules',  icon: Sliders },
  { path: '/agent',           label: 'AI Agent',         icon: Bot },
  { path: '/subscribers',     label: 'Subscribers',      icon: Bell },
]

export const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false) 
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<any | null>(null)
  
  const { 
    user, 
    logout, 
    wsConnected, 
    theme, 
    toggleTheme, 
    dashboardStats, 
    eventsList, 
    eventId, 
    setEventId,
    deleteEvent
  } = useAppContext()
  const navigate = useNavigate()

  const handleLogout = () => {
    setShowLogoutModal(true)
  }

  const confirmLogout = () => {
    logout()
    navigate('/')
  }

  // Show Live Leaderboard only from Evaluation phase onwards
  const stage = dashboardStats?.current_stage?.toLowerCase() || ''
  const scoresLocked = stage.includes('eval') || stage.includes('result') || stage.includes('progression') || (dashboardStats?.current_stage_index !== undefined && dashboardStats.current_stage_index >= 2)



  // If there is no active event (e.g. they are on the setup page), HIDE THE ENTIRE SIDEBAR
  if (!eventId) {
    return null
  }

  return (
    <>
    <aside
      className={`bg-white border-r border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-60'
      } h-screen sticky top-0 flex-shrink-0`}
    >
      {/* Logo Section */}
      <div className="flex items-center gap-4 px-3 py-3 border-b border-gray-100 dark:border-slate-800">
        
        <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
          <img 
            src={logoImage} 
            alt="EventCraft Logo" 
            className="w-full h-full object-contain drop-shadow-md transition-transform hover:scale-[1.8] duration-300 scale-[1.7]" 
          />
        </div>

        {!collapsed && (
          <div className="overflow-hidden py-1">
            <div className="text-base font-bold text-gray-900 dark:text-white leading-tight whitespace-nowrap">
              EventCraft
            </div>
            <div className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap mt-0.5">
              Orchestration System
            </div>
          </div>
        )}
      </div>

      {/* Event Switcher */}
      {user && (user.role === 'admin' || user.role === 'committee') && eventsList.length > 0 && (
        <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-800 relative">
          {collapsed ? (
            <div className="flex justify-center py-1">
              <button
                onClick={() => setCollapsed(false)}
                className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/20 text-primary dark:text-primary-400 flex items-center justify-center font-bold text-sm shadow-sm border border-orange-100/50 dark:border-orange-900/30 hover:scale-105 active:scale-95 transition-all duration-200"
                title={`Active Event: ${eventsList.find((e: any) => e.id === eventId)?.name || 'EventCraft'}`}
              >
                {eventsList.find((e: any) => e.id === eventId)?.name?.charAt(0) || 'E'}
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-950/40 dark:hover:bg-slate-800/40 border border-gray-100 dark:border-slate-800/60 transition-all duration-200 group text-left cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider leading-none mb-1">
                    Current Event
                  </span>
                  <span className="block text-xs font-bold text-gray-800 dark:text-slate-200 truncate group-hover:text-primary dark:group-hover:text-primary-400 transition-colors leading-tight">
                    {eventsList.find((e: any) => e.id === eventId)?.name || 'Select Event'}
                  </span>
                </div>
                <ChevronsUpDown size={14} className="text-gray-400 group-hover:text-gray-600 dark:text-slate-500 dark:group-hover:text-slate-350 transition-colors flex-shrink-0" />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-3 py-1 border-b border-gray-50 dark:border-slate-800/50 mb-1">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                        Switch Event
                      </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {eventsList.map((e: any) => {
                        const isSelected = e.id === eventId
                        return (
                          <div
                            key={e.id}
                            className={`w-full group/item flex items-center justify-between px-3 py-2 transition-colors duration-150 ${
                              isSelected
                                ? 'bg-orange-50/80 dark:bg-orange-950/20'
                                : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setEventId(e.id)
                                setDropdownOpen(false)
                              }}
                              className={`flex-1 text-left text-xs font-semibold truncate cursor-pointer ${
                                isSelected
                                  ? 'text-primary dark:text-primary-400'
                                  : 'text-gray-600 dark:text-slate-400 dark:hover:text-slate-200'
                              }`}
                            >
                              {e.name}
                            </button>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary dark:bg-primary-400" />
                              )}
                              {(user?.role === 'admin' || user?.role === 'committee') && (
                                <button
                                  onClick={(evt) => {
                                    evt.stopPropagation()
                                    setEventToDelete(e)
                                    setDropdownOpen(false)
                                  }}
                                  className="opacity-0 group-hover/item:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded transition-all hover:bg-gray-100 dark:hover:bg-slate-750 cursor-pointer"
                                  title="Delete Event"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer group ${
                isActive
                  ? 'bg-orange-50 text-primary dark:bg-orange-950/20 dark:text-primary-400'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200'
              }`
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  className={`flex-shrink-0 ${
                    isActive
                      ? 'text-primary dark:text-primary-400'
                      : 'text-gray-400 group-hover:text-gray-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                  }`}
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}

        {/* Live Leaderboard */}
        {scoresLocked && (
          <a
            href={`/live-leaderboard${eventId ? `?event=${eventId}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? 'Live Leaderboard' : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer group text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950/20"
          >
            <Trophy size={18} className="flex-shrink-0 text-yellow-500" />
            {!collapsed && (
              <span className="truncate flex items-center gap-1.5">
                Live Leaderboard
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              </span>
            )}
          </a>
        )}
      </nav>

      {/* Bottom Section (User, Invites, Settings, Collapse) */}
      <div className="px-2 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1 flex-shrink-0">
        
        {/* User Badge */}
        {!collapsed && user && (
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-950/40 mb-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700 dark:text-slate-350 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 border-t border-gray-150 dark:border-slate-800 pt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${!eventId ? 'bg-gray-300' : wsConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                {!eventId ? 'No Active Event' : wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        )}

        {/* Settings Button */}
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200 transition-all w-full cursor-pointer"
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings size={18} className="flex-shrink-0 text-gray-400 dark:text-slate-500" />
          {!collapsed && <span>Settings</span>}
        </button>


        
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200 transition-all w-full cursor-pointer"
          title={collapsed ? (theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode') : undefined}
        >
          {theme === 'light' ? (
            <>
              <Moon size={18} className="flex-shrink-0 text-gray-400 dark:text-slate-500" />
              {!collapsed && <span>Dark Mode</span>}
            </>
          ) : (
            <>
              <Sun size={18} className="flex-shrink-0 text-yellow-500" />
              {!collapsed && <span>Light Mode</span>}
            </>
          )}
        </button>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-all w-full cursor-pointer"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        
        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200 transition-all w-full cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight size={18} className="flex-shrink-0" />
          ) : (
            <>
              <ChevronLeft size={18} className="flex-shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>


    </aside>
       
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <LogOut size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Logout?</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">You will be returned to the home page.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-xs font-semibold py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors"
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Deletion Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Delete Event?</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-[240px]">
                  "{eventToDelete.name}"
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
              This will permanently delete the event and all associated teams, participants, and scoring data. This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEventToDelete(null)}
                className="flex-1 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-xs font-semibold py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteEvent(eventToDelete.id)
                  } catch (err) {
                    console.error(err)
                  } finally {
                    setEventToDelete(null)
                  }
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}