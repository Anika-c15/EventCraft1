import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  User,
  Users,
  ClipboardList,
  Send,
  GitBranch,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bot,
  LogOut,
  Bell,
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/participants', label: 'Participants', icon: User },
  { path: '/teams', label: 'Teams', icon: Users },
  { path: '/evaluations', label: 'Evaluations', icon: ClipboardList },
  { path: '/communications', label: 'Communications', icon: Send },
  { path: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { path: '/approvals', label: 'Approvals', icon: Shield },
  { path: '/formation-rules', label: 'Formation Rules', icon: Settings },
  { path: '/agent', label: 'AI Agent', icon: Bot },
  { path: '/subscribers', label: 'Subscribers', icon: Bell },
]

export const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout, wsConnected } = useAppContext()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside
      className={`bg-white border-r border-gray-100 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-60'
      } min-h-screen flex-shrink-0`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        <div className="flex-shrink-0 w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm tracking-tight">EC</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap">
              EventCraft
            </div>
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-widest whitespace-nowrap">
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
                  ? 'bg-orange-50 text-primary'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  className={`flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600'}`}
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Collapse */}
      <div className="px-2 py-3 border-t border-gray-100 space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-2 rounded-lg bg-gray-50 mb-1">
            <p className="text-xs font-semibold text-gray-700 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-[10px] text-gray-400">
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all w-full"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all w-full"
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
  )
}
