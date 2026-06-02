import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, User, Users, ClipboardList, Send, GitBranch,
  Shield, Settings, ChevronLeft, ChevronRight, Bot, LogOut,
  Bell, Sun, Moon, Trophy,
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
  { path: '/formation-rules', label: 'Formation Rules',  icon: Settings },
  { path: '/agent',           label: 'AI Agent',         icon: Bot },
  { path: '/subscribers',     label: 'Subscribers',      icon: Bell },
]

export const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false) 
  const { user, logout, wsConnected, theme, toggleTheme, dashboardStats } = useAppContext()
  const navigate = useNavigate()

  const handleLogout = () => {
  setShowLogoutModal(true)
}

const confirmLogout = () => {
  logout()
  navigate('/')
}

  // Show Live Leaderboard only when event is in Results or Progression phase (scores fully locked)
  const stage = dashboardStats?.current_stage?.toLowerCase() || ''
  const scoresLocked = stage.includes('result') || stage.includes('progression')

  return (
    <>
    <aside
      className={`bg-white border-r border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-60'
      } h-screen sticky top-0 flex-shrink-0`}
    >
      {/* Logo */}
   {/* Logo Section */}
      <div className="flex items-center gap-4 px-3 py-3 border-b border-gray-100 dark:border-slate-800">
        
        {/* Shrunk the container even further to w-8 h-8 */}
        <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
          <img 
            src={logoImage} 
            alt="EventCraft Logo" 
            // Bumped scale to 1.7 so the logo stays the exact same visual size 
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

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
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

        {/* Live Leaderboard — only when scores are locked */}
        {scoresLocked && (
          <a
            href="/live-leaderboard"
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

      {/* User + Collapse */}
      <div className="px-2 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-950/40 mb-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-350 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        )}
        
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

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-all w-full cursor-pointer"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        
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
      </>
  )
}
