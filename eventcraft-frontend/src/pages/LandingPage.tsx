import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Shield,
  Zap,
  Users,
  Cpu,
  Sparkles,
  Link as LinkIcon,
  AlertCircle,
  Sun,
  Moon,
  Mail,
  Lock,
  Building,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { Modal } from '../components/ui/Modal'
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const context = useAppContext()
  const theme = context?.theme || 'light'
  const toggleTheme = context?.toggleTheme || (() => {})
  const { login } = useAppContext()

  const [portalInput, setPortalInput] = useState('')
  const [portalError, setPortalError] = useState('')
  const [showEmailPopup, setShowEmailPopup] = useState(false)

  // Admin Login / Register state
  const [adminTab, setAdminTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  

 const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault()
  setFormError('')
  if (!email || !password) { setFormError('Please fill in all fields.'); return }
  try {
    await login(email, password)
    navigate('/dashboard')
  } catch (err: any) {
    setFormError(err.message || 'Login failed')
  }
}
const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault()
  setFormError('')
  if (!email || !password || !orgName) { setFormError('Please fill in all fields.'); return }
  if (password !== confirmPassword) { setFormError('Passwords do not match.'); return }
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: orgName, org_name: orgName }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.detail || 'Registration failed'); return }
    await login(email, password)
    navigate('/dashboard')
  } catch (err: any) {
    setFormError(err.message || 'Registration failed')
  }
}

  const handlePortalAccess = (e: React.FormEvent) => {
    e.preventDefault()
    setPortalError('')
    const trimmed = portalInput.trim()

    if (!trimmed) {
      setPortalError('Please enter a URL or token.')
      return
    }

    try {
      let urlString = trimmed
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        if (trimmed.includes('/') || trimmed.includes('.')) {
          urlString = 'https://' + trimmed
        }
      }

      if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
        const url = new URL(urlString)

        if (url.pathname.includes('/portal/')) {
          const parts = url.pathname.split('/portal/')
          const token = parts[1]
          const eventId = url.searchParams.get('event')
          if (token && eventId) {
            navigate(`/portal/${token}?event=${eventId}`)
            return
          }
        }

        if (url.pathname.includes('/judge/')) {
          const parts = url.pathname.split('/judge/')
          const eventId = parts[1]
          const token = url.searchParams.get('token')
          if (eventId && token) {
            navigate(`/judge/${eventId}?token=${token}`)
            return
          }
        }
      }
    } catch (err) {}

    if (trimmed.includes('/portal/')) {
      const portalMatch = trimmed.match(/portal\/([^/?\s]+)(?:\?|&)?event=([^&\s]+)/)
      if (portalMatch && portalMatch[1] && portalMatch[2]) {
        navigate(`/portal/${portalMatch[1]}?event=${portalMatch[2]}`)
        return
      }
    } else if (trimmed.includes('/judge/')) {
      const judgeMatch = trimmed.match(/judge\/([^/?\s]+)(?:\?|&)?token=([^&\s]+)/)
      if (judgeMatch && judgeMatch[1] && judgeMatch[2]) {
        navigate(`/judge/${judgeMatch[1]}?token=${judgeMatch[2]}`)
        return
      }
    }

    if (trimmed.startsWith('eyJ') && trimmed.includes('.')) {
      setPortalError('This looks like a raw Judge Token. Please paste the full Judge URL from your email so we can identify the event.')
      return
    }

    setPortalError(
      'Could not parse link. Please paste the full Portal URL sent to your email (e.g., https://eventcraft.com/portal/abc?event=123).'
    )
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-orange-500 selection:text-white relative overflow-hidden transition-colors duration-300 ${
      theme === 'light'
        ? 'bg-white text-slate-800'
        : 'bg-gradient-to-br from-slate-955 via-slate-900 to-slate-955 text-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
    }`}>

      {/* Background Fluid Waves & Grid */}
      {theme === 'light' ? (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute inset-0 bg-white" />
          <div
            className="absolute inset-0 opacity-90"
            style={{
              backgroundImage: `
                radial-gradient(circle at 80% 10%, rgba(232, 69, 10, 0.12) 0%, transparent 50%),
                radial-gradient(circle at 20% 25%, rgba(253, 216, 204, 0.6) 0%, transparent 45%),
                radial-gradient(circle at 50% -5%, rgba(254, 240, 235, 0.9) 0%, transparent 40%),
                radial-gradient(circle at 90% 45%, rgba(250, 177, 153, 0.25) 0%, transparent 50%),
                radial-gradient(circle at 10% 60%, rgba(232, 69, 10, 0.06) 0%, transparent 40%),
                radial-gradient(circle at 60% 30%, rgba(253, 216, 204, 0.3) 0%, transparent 60%)
              `
            }}
          />
          <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[60%] rounded-full bg-gradient-to-br from-orange-200/20 via-amber-100/20 to-red-100/10 blur-[130px]" />
          <svg className="absolute top-0 left-0 w-full h-[750px] opacity-[0.35] mix-blend-multiply pointer-events-none" viewBox="0 0 1440 750" fill="none" preserveAspectRatio="none">
            <path d="M0,0 L1440,0 L1440,350 C1300,480 1100,300 850,400 C600,500 350,310 0,480 Z" fill="url(#fluid-grad-1)" />
            <path d="M0,0 L1440,0 L1440,280 C1200,410 950,260 700,370 C450,480 200,330 0,420 Z" fill="url(#fluid-grad-2)" opacity="0.6" />
            <defs>
              <linearGradient id="fluid-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF0EB" />
                <stop offset="40%" stopColor="#FDD8CC" />
                <stop offset="80%" stopColor="#FAB199" />
                <stop offset="100%" stopColor="#FEF0EB" />
              </linearGradient>
              <linearGradient id="fluid-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FEF0EB" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#FDD8CC" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FAB199" stopOpacity="0.5" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-60" />
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                radial-gradient(circle at 80% 10%, rgba(232, 69, 10, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 20% 25%, rgba(244, 99, 51, 0.1) 0%, transparent 45%),
                radial-gradient(circle at 50% -5%, rgba(253, 110, 50, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 90% 45%, rgba(251, 146, 60, 0.12) 0%, transparent 50%),
                radial-gradient(circle at 10% 60%, rgba(232, 69, 10, 0.12) 0%, transparent 40%),
                radial-gradient(circle at 60% 30%, rgba(251, 146, 60, 0.08) 0%, transparent 60%)
              `
            }}
          />
          <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[60%] rounded-full bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-transparent blur-[140px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[50%] rounded-full bg-gradient-to-tr from-red-500/10 via-orange-500/15 to-transparent blur-[120px]" />
          <svg className="absolute top-0 left-0 w-full h-[750px] opacity-[0.12] mix-blend-screen pointer-events-none" viewBox="0 0 1440 750" fill="none" preserveAspectRatio="none">
            <path d="M0,0 L1440,0 L1440,350 C1300,480 1100,300 850,400 C600,500 350,310 0,480 Z" fill="url(#fluid-grad-dark-1)" />
            <path d="M0,0 L1440,0 L1440,280 C1200,410 950,260 700,370 C450,480 200,330 0,420 Z" fill="url(#fluid-grad-dark-2)" opacity="0.6" />
            <defs>
              <linearGradient id="fluid-grad-dark-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#762304" />
                <stop offset="40%" stopColor="#C23A08" />
                <stop offset="80%" stopColor="#E8450A" />
                <stop offset="100%" stopColor="#762304" />
              </linearGradient>
              <linearGradient id="fluid-grad-dark-2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#762304" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#9C2E06" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#C23A08" stopOpacity="0.5" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>
      )}



      {/* Floating Header */}
      <header className={`sticky top-0 z-40 w-full backdrop-blur-md transition-colors ${
        theme === 'light'
          ? 'bg-white/75 border-b border-orange-100/60'
          : 'bg-slate-950/75 border-b border-slate-900'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <span className="text-white font-extrabold text-base tracking-tight">EC</span>
            </div>
            <div>
              <div className={`text-base font-black leading-none ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>EventCraft</div>
              <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">Orchestration System</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <a href="#features" className="hover:text-orange-500 transition-colors">Features</a>
            <a href="#stats" className="hover:text-orange-500 transition-colors">Milestones</a>
            <a href="#portal-access" className="hover:text-orange-500 transition-colors">Access Portal</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all cursor-pointer shadow-sm ${
                theme === 'light'
                  ? 'border-orange-100 bg-orange-50/50 text-orange-600 hover:bg-orange-100/50'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} className="text-yellow-500" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero & Access Section */}
      <main className="max-w-7xl mx-auto px-6 py-12 lg:py-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

          {/* Left Column: Hero Text */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${
              theme === 'light'
                ? 'border-orange-200 bg-orange-50/60 text-orange-600'
                : 'border-orange-500/20 bg-orange-500/5 text-orange-400'
            }`}>
              <Sparkles size={12} /> Live Event Engine Active
            </div>

            <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              Intelligent, AI-Powered <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-red-500 to-amber-500">
                Event Orchestration
              </span>
            </h1>

            <p className={`text-base sm:text-lg max-w-xl leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
              EventCraft automates participant roster intake, matches diverse teams using advanced grouping rules, generates automated assessment guides, and calculates consensus rankings—all in one seamless flow.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={() => navigate('/candidate')}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/20 hover:shadow-orange-500/35 transition-all duration-150 cursor-pointer flex items-center gap-2 hover:-translate-y-0.5"
              >
                Register as Participant <ArrowRight size={16} />
              </button>
              <button
                onClick={() => setShowEmailPopup(true)}
                className={`px-6 py-3 border rounded-xl font-semibold text-sm transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                  theme === 'light'
                    ? 'border-orange-200 bg-orange-50/40 text-orange-700 hover:bg-orange-100/40'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                Access Guest Portal
              </button>
            </div>

            {/* Quick Metrics */}
            <div className={`grid grid-cols-3 gap-6 pt-8 border-t max-w-md ${
              theme === 'light' ? 'border-orange-100/60' : 'border-slate-800'
            }`}>
              <div>
                <p className={`text-2xl font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>100%</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Passwordless Login</p>
              </div>
              <div>
                <p className={`text-2xl font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>AI</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Team Formations</p>
              </div>
              <div>
                <p className={`text-2xl font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>&lt; 2s</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Real-time Websockets</p>
              </div>
            </div>
          </div>

          {/* Right Column: Admin Login / Register Card */}
          <div id="portal-access" className="lg:col-span-5 relative space-y-6">
            {/* Floating mockup cards */}
            <div className="absolute -top-12 -left-12 w-48 p-4 rounded-2xl border backdrop-blur-md shadow-lg rotate-[-6deg] hidden sm:block pointer-events-none transition-all duration-300 hover:rotate-0 hover:scale-105 z-0 select-none overflow-hidden bg-white/70 dark:bg-slate-900/70 border-orange-100/60 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Roster Sync</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800/50 rounded-full" />
                <div className="h-1.5 w-4/5 bg-slate-200 dark:bg-slate-800/50 rounded-full" />
                <div className="h-1.5 w-3/5 bg-slate-200 dark:bg-slate-800/50 rounded-full" />
              </div>
            </div>

            <div className="absolute -bottom-8 -right-8 w-44 p-4 rounded-2xl border backdrop-blur-md shadow-lg rotate-[8deg] hidden sm:block pointer-events-none transition-all duration-300 hover:rotate-0 hover:scale-105 z-0 select-none overflow-hidden bg-white/70 dark:bg-slate-900/70 border-orange-100/60 dark:border-slate-800">
              <div className="flex items-center gap-1 text-orange-500 mb-1.5">
                <Sparkles size={12} />
                <span className="text-[9px] font-extrabold uppercase tracking-widest">AI Matchmaker</span>
              </div>
              <div className="flex -space-x-1.5 overflow-hidden">
                <div className=" h-5 w-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-orange-100 flex items-center justify-center text-[8px] font-bold text-orange-600">RS</div>
                <div className="h-5 w-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600">AS</div>
                <div className="h-5 w-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-purple-100 flex items-center justify-center text-[8px] font-bold text-purple-600">VN</div>
              </div>
            </div>

            {/* Glowing ring */}
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500 to-red-500 rounded-3xl blur-xl opacity-20 dark:opacity-25 pointer-events-none" />            {/* Admin Login / Register Card */}
            <div className="relative group/card">
              {/* Outer soft glowing background ring */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-red-500 rounded-3xl blur-xl opacity-20 group-hover/card:opacity-30 transition duration-500 pointer-events-none" />
              
              <div className={`relative backdrop-blur-2xl border rounded-3xl p-6 sm:p-8 space-y-6 transition-all duration-300 shadow-2xl ${
                theme === 'light'
                  ? 'bg-white/80 border-orange-100/90 shadow-orange-500/5'
                  : 'bg-slate-900/80 border-slate-800/80 shadow-black/30'
              }`}>
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl flex items-center justify-center transition-transform duration-300 hover:rotate-12 ${
                    theme === 'light'
                      ? 'bg-gradient-to-tr from-orange-50 to-orange-100/50 text-orange-600 border border-orange-150'
                      : 'bg-gradient-to-tr from-orange-500/10 to-orange-500/20 text-orange-400 border border-orange-500/30'
                  }`}>
                    <Shield size={20} />
                  </div>
                  <div>
                    <h2 className={`text-xl font-extrabold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                      Committee Access
                    </h2>
                    <p className={`text-xs mt-0.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {adminTab === 'login' ? 'Manage your live hackathons' : 'Create a fresh event dashboard'}
                    </p>
                  </div>
                </div>

                {/* Tab Switcher */}
                <div className={`flex rounded-2xl p-1 bg-slate-100/80 dark:bg-slate-950/50 border border-slate-200/40 dark:border-slate-800/50`}>
                  <button
                    onClick={() => { setAdminTab('login'); setFormError('') }}
                    className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all duration-200 cursor-pointer ${
                      adminTab === 'login'
                        ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-md scale-[1.02]'
                        : theme === 'light'
                          ? 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                    }`}
                  >
                    Login
                  </button>
                  <button
                    onClick={() => { setAdminTab('register'); setFormError('') }}
                    className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all duration-200 cursor-pointer ${
                      adminTab === 'register'
                        ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-md scale-[1.02]'
                        : theme === 'light'
                          ? 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                    }`}
                  >
                    Register
                  </button>
                </div>

                {/* Login Form */}
                {adminTab === 'login' && (
                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Email</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Mail size={16} />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@organisation.com"
                          className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${
                            theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Password</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${
                            theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-350 cursor-pointer p-1 rounded-lg"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    {formError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-500">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        <span className="font-semibold">{formError}</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer shadow-lg shadow-orange-500/10 hover:shadow-orange-500/25 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Login to Console <ArrowRight size={14} />
                    </button>
                  </form>
                )}

                {/* Register Form */}
                {adminTab === 'register' && (
                  <form onSubmit={handleRegister} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Organisation Name</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Building size={16} />
                        </div>
                        <input
                          type="text"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          placeholder="e.g. IIT Bombay Techfest"
                          className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${
                            theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Email</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Mail size={16} />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@organisation.com"
                          className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${
                            theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Password</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${
                            theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-350 cursor-pointer p-1 rounded-lg"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Confirm Password</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${
                            theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-350 cursor-pointer p-1 rounded-lg"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    {formError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-500">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        <span className="font-semibold">{formError}</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer shadow-lg shadow-orange-500/10 hover:shadow-orange-500/25 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Create Account <ArrowRight size={14} />
                    </button>
                  </form>
                )}

              {/* Participant access link */}
              <div className={`pt-3.5 border-t text-center ${theme === 'light' ? 'border-slate-100' : 'border-slate-800'}`}>
                <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  Are you a participant?{' '}
                  <button
                    onClick={() => setShowEmailPopup(true)}
                    className="text-orange-500 font-semibold hover:underline cursor-pointer bg-transparent border-none p-0"
                  >
                    Access your portal
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Features Section */}
        <section id="features" className={`py-20 border-t mt-20 space-y-12 transition-all ${
          theme === 'light' ? 'border-slate-100' : 'border-slate-900'
        }`}>
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              theme === 'light'
                ? 'bg-orange-50 text-orange-600 border border-orange-100/55'
                : 'bg-orange-500/10 text-orange-300 border border-orange-500/25'
            }`}>
              <Sparkles size={11} /> Feature Suite
            </div>
            <h2 className={`text-2xl sm:text-3xl font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              End-to-End Smart Orchestration
            </h2>
            <p className={`text-sm sm:text-base leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              From participant intake to consensus leaderboard ranking, EventCraft automates the entire event timeline with built-in AI helpers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${
              theme === 'light'
                ? 'bg-white/60 border-slate-100 hover:bg-white hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5'
                : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
            }`}>
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors duration-200">
                <Users size={20} />
              </div>
              <h3 className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Algorithmic Matchmaking</h3>
              <p className={`text-xs sm:text-sm leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Rules-based team creation that matches experience levels, skills, and affiliations, providing explainable AI reasoning for each team.
              </p>
            </div>

            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${
              theme === 'light'
                ? 'bg-white/60 border-slate-100 hover:bg-white hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5'
                : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
            }`}>
              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors duration-200">
                <Cpu size={20} />
              </div>
              <h3 className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>AI Assessment Guides</h3>
              <p className={`text-xs sm:text-sm leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Creates custom AI instructions specifically tailored to each team's submission details to guide evaluators during scoring.
              </p>
            </div>

            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${
              theme === 'light'
                ? 'bg-white/60 border-slate-100 hover:bg-white hover:border-pink-200 hover:shadow-lg hover:shadow-pink-500/5'
                : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
            }`}>
              <div className="w-10 h-10 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-500 group-hover:bg-pink-500 group-hover:text-white transition-colors duration-200">
                <Shield size={20} />
              </div>
              <h3 className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Bias Mitigation Panel</h3>
              <p className={`text-xs sm:text-sm leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Automatically flags score divergences greater than 2.0 points between judges and consensus scores, ensuring fair evaluations.
              </p>
            </div>

            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${
              theme === 'light'
                ? 'bg-white/60 border-slate-100 hover:bg-white hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5'
                : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
            }`}>
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-200">
                <Zap size={20} />
              </div>
              <h3 className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>WebSockets Integration</h3>
              <p className={`text-xs sm:text-sm leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Watch judge submissions, consensus shifts, and leaderboard updates happen in real time without refreshing your page.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`border-t py-8 relative z-10 text-center transition-all ${
        theme === 'light' ? 'border-slate-100 bg-white/70' : 'border-slate-900 bg-slate-950/80'
      }`}>
        <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-600'}`}>
          &copy; {new Date().getFullYear()} EventCraft Orchestration System. All rights reserved.
        </p>
      </footer>

      {/* Check Registered Email Modal */}
      <Modal
        isOpen={showEmailPopup}
        onClose={() => setShowEmailPopup(false)}
        title="Check Your Registered Email"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col items-center text-center p-4 space-y-4">
          <div className="w-16 h-16 bg-orange-50 dark:bg-orange-950/40 rounded-full flex items-center justify-center border border-orange-100 dark:border-orange-900 text-primary animate-bounce">
            <Mail size={28} />
          </div>
          <div className="space-y-3">
            <p className="text-sm text-gray-650 dark:text-slate-300 leading-relaxed font-medium">
              We have sent a secure, passwordless link to your registered email address.
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              Please check your inbox (and spam folder) and click the link to automatically log in to your portal.
            </p>
          </div>

          {/* Portal URL paste form inside modal */}
          <form onSubmit={handlePortalAccess} className="w-full space-y-3">
            <div className="relative">
              <input
                type="text"
                value={portalInput}
                onChange={(e) => setPortalInput(e.target.value)}
                placeholder="https://eventcraft.com/portal/token?event=id"
                className={`w-full border rounded-xl pl-3 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-mono ${
                  theme === 'light'
                    ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                    : 'bg-slate-950/80 border-slate-800 text-slate-200 focus:border-orange-500'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <LinkIcon size={14} />
              </div>
            </div>
            {portalError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-red-500">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{portalError}</span>
              </div>
            )}
            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              Enter Portal <ArrowRight size={14} />
            </button>
          </form>

          <button
            onClick={() => setShowEmailPopup(false)}
            className={`w-full py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              theme === 'light'
                ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Close
          </button>
        </div>
      </Modal>

    </div>
  )
}