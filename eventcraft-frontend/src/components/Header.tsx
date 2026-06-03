import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { Moon, Sun } from 'lucide-react'
import logoImage from '../assets/logo.png'

interface HeaderProps {
  activeSection?: 'features' | 'journey' | 'portal-access' | null
  isLandingPage?: boolean
}

export const Header: React.FC<HeaderProps> = ({ activeSection = null, isLandingPage = false }) => {
  const navigate = useNavigate()
  const context = useAppContext()
  const theme = context?.theme || 'light'
  const toggleTheme = context?.toggleTheme || (() => {})

  const handleConsoleLogin = () => {
    if (isLandingPage) {
      const adminEl = document.getElementById('portal-access')
      if (adminEl) {
        adminEl.scrollIntoView({ behavior: 'smooth' })
      }
    } else {
      navigate('/#portal-access')
    }
  }

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 w-full backdrop-blur-md transition-colors border-b ${
      theme === 'light'
        ? 'bg-white/75 border-orange-100/60'
        : 'bg-slate-950/75 border-slate-900'
    }`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
            <img 
              src={logoImage} 
              alt="EventCraft Logo" 
              className="w-full h-full object-contain drop-shadow-md transition-transform hover:scale-[1.8] duration-300 scale-[1.7]" 
            />
          </div>
          <div>
            <div className={`text-base font-black leading-none ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>EventCraft</div>
            <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">Orchestration System</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <a 
            href={isLandingPage ? "#features" : "/#features"} 
            className={`relative py-1 transition-colors hover:text-orange-500 ${
              activeSection === 'features' ? 'text-orange-500 font-bold' : ''
            }`}
          >
            Features
            {activeSection === 'features' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full animate-fade-in" />
            )}
          </a>
          <a 
            href={isLandingPage ? "#journey" : "/#journey"} 
            className={`relative py-1 transition-colors hover:text-orange-500 ${
              activeSection === 'journey' ? 'text-orange-500 font-bold' : ''
            }`}
          >
            Event Journey
            {activeSection === 'journey' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full animate-fade-in" />
            )}
          </a>
          <a 
            href={isLandingPage ? "#portal-access" : "/#portal-access"} 
            className={`relative py-1 transition-colors hover:text-orange-500 ${
              activeSection === 'portal-access' ? 'text-orange-500 font-bold' : ''
            }`}
          >
            Access Portal
            {activeSection === 'portal-access' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full animate-fade-in" />
            )}
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
              theme === 'light'
                ? 'border-orange-100 bg-orange-50/50 text-orange-600 hover:bg-orange-100/50'
                : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-900 hover:text-white'
            }`}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button
            onClick={handleConsoleLogin}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold text-sm shadow-md shadow-orange-500/10 hover:shadow-orange-500/20 transition-all duration-150 cursor-pointer flex items-center gap-1.5"
          >
            Console Login
          </button>
        </div>
      </div>
    </header>
  )
}
