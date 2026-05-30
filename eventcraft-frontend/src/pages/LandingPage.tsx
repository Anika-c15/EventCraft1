import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Shield,
  Zap,
  Users,
  Cpu,
  Lock,
  Sparkles,
  Link as LinkIcon,
  AlertCircle,
} from 'lucide-react'
import { eventsApi } from '../api/client'

export const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const [portalInput, setPortalInput] = useState('')
  const [portalError, setPortalError] = useState('')
  const [loadingGuest, setLoadingGuest] = useState(false)

  const handleAccessGuestPortal = async () => {
    setLoadingGuest(true)
    setPortalError('')
    try {
      const demo = await eventsApi.getDemoPortal()
      if (demo && demo.token && demo.event_id) {
        navigate(`/portal/${demo.token}?event=${demo.event_id}`)
      } else {
        setPortalError('Could not find a guest portal at the moment. Please paste your link manually.')
        document.getElementById('portal-access')?.scrollIntoView({ behavior: 'smooth' })
      }
    } catch (err: any) {
      setPortalError(err.message || 'Failed to fetch guest portal link. Please paste your link manually.')
      document.getElementById('portal-access')?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setLoadingGuest(false)
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
      // 1. Try parsing as full URL
      let urlString = trimmed
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        // If it looks like a path or domain without protocol, add dummy prefix to parse it
        if (trimmed.includes('/') || trimmed.includes('.')) {
          urlString = 'https://' + trimmed
        }
      }

      if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
        const url = new URL(urlString)
        
        // Case A: Participant portal `/portal/:token?event=eventId`
        if (url.pathname.includes('/portal/')) {
          const parts = url.pathname.split('/portal/')
          const token = parts[1]
          const eventId = url.searchParams.get('event')
          if (token && eventId) {
            navigate(`/portal/${token}?event=${eventId}`)
            return
          }
        }
        
        // Case B: Judge portal `/judge/:eventId?token=jwt`
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
    } catch (err) {
      // URL parsing failed, fall back to regex/string matches
    }

    // 2. String/regex matching fallback for relative paths or dirty pastes
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

    // 3. Fallback: Check if it's a JWT token directly (cannot redirect without event ID)
    if (trimmed.startsWith('eyJ') && trimmed.includes('.')) {
      setPortalError('This looks like a raw Judge Token. Please paste the full Judge URL from your email so we can identify the event.')
      return
    }

    // 4. Default error
    setPortalError(
      'Could not parse link. Please paste the full Portal URL sent to your email (e.g., https://eventcraft.com/portal/abc?event=123).'
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-orange-500 selection:text-white relative overflow-hidden">
      
      {/* Background Orbs & Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-orange-600/20 to-purple-600/0 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-indigo-600/20 to-orange-600/0 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      {/* Floating Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-slate-950/70 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <span className="text-white font-extrabold text-base tracking-tight">EC</span>
            </div>
            <div>
              <div className="text-base font-black text-white leading-none">EventCraft</div>
              <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">Orchestration System</div>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-slate-700 text-white transition-all duration-200 cursor-pointer shadow-sm hover:shadow-orange-500/5"
          >
            Committee Console <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Main Hero & Access Section */}
      <main className="max-w-7xl mx-auto px-6 py-12 lg:py-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Hero Text */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-orange-500/20 bg-orange-500/5 text-orange-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles size={12} /> Live Event Engine Active
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.1]">
              Intelligent, AI-Powered <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-red-500 to-amber-500">
                Event Orchestration
              </span>
            </h1>
            
            <p className="text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed">
              EventCraft automates participant roster intake, matches diverse teams using advanced grouping rules, generates automated assessment guides, and calculates consensus rankings—all in one seamless flow.
            </p>
            
            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={() => navigate('/candidate')}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/20 transition-all duration-150 cursor-pointer flex items-center gap-2 hover:-translate-y-0.5"
              >
                Register Now <ArrowRight size={16} />
              </button>
              <button
                onClick={handleAccessGuestPortal}
                disabled={loadingGuest}
                className="px-6 py-3 border border-slate-800 bg-slate-900/60 hover:bg-slate-900 disabled:opacity-50 text-slate-300 hover:text-white rounded-xl font-semibold text-sm transition-all duration-150 flex items-center gap-2 cursor-pointer"
              >
                {loadingGuest ? 'Loading...' : 'Access Guest Portal'}
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-900 max-w-md">
              <div>
                <p className="text-2xl font-black text-white">100%</p>
                <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">Passwordless Login</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">AI</p>
                <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">Team Formations</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">&lt; 2s</p>
                <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">Real-time Websockets</p>
              </div>
            </div>
          </div>

          {/* Right Column: Portal Access & Login Box */}
          <div id="portal-access" className="lg:col-span-5 relative">
            {/* Glowing ring around the card */}
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500 to-purple-600 rounded-2xl blur-lg opacity-25 pointer-events-none" />
            
            <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-orange-500/10 rounded-lg text-orange-400">
                    <Lock size={18} />
                  </div>
                  <h2 className="text-lg font-bold text-white">Secure Portal Access</h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Your portal access is passwordless and secure. Please click the unique link sent to your registered email to access your dashboard.
                </p>
              </div>

              {/* Form Input for Token Paste */}
              <form onSubmit={handlePortalAccess} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Paste Portal URL or Token
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={portalInput}
                      onChange={(e) => setPortalInput(e.target.value)}
                      placeholder="https://eventcraft.com/portal/token?event=id"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 rounded-xl pl-3 pr-10 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-mono"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <LinkIcon size={14} />
                    </div>
                  </div>
                </div>

                {portalError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-red-400 leading-relaxed">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
                    <span>{portalError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer border border-slate-700 flex items-center justify-center gap-2 hover:border-slate-600"
                >
                  Enter Portal <ArrowRight size={14} />
                </button>
              </form>

              <div className="pt-4 border-t border-slate-800 text-center">
                <p className="text-xs text-slate-500">
                  Are you a Committee Organizer?{' '}
                  <button
                    onClick={() => navigate('/login')}
                    className="text-orange-400 hover:text-orange-300 font-semibold hover:underline cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-0.5"
                  >
                    Login here
                  </button>
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Features Section */}
        <section className="py-20 border-t border-slate-900 mt-20 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              End-to-End Smart Orchestration
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              From participant intake to consensus leaderboard ranking, EventCraft automates the entire event timeline with built-in AI helpers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Feature 1 */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-4 hover:border-slate-800 transition-all duration-200 group">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-colors duration-200">
                <Users size={20} />
              </div>
              <h3 className="font-bold text-white text-base">Algorithmic Matchmaking</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Rules-based team creation that matches experience levels, skills, and affiliations, providing explainable AI reasoning for each team.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-4 hover:border-slate-800 transition-all duration-200 group">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-50 group-hover:text-white transition-colors duration-200">
                <Cpu size={20} />
              </div>
              <h3 className="font-bold text-white text-base">AI Assessment Guides</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Creates custom AI instructions specifically tailored to each team's submission details to guide evaluators during scoring.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-4 hover:border-slate-800 transition-all duration-200 group">
              <div className="w-10 h-10 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400 group-hover:bg-pink-500 group-hover:text-white transition-colors duration-200">
                <Shield size={20} />
              </div>
              <h3 className="font-bold text-white text-base">Bias Mitigation Panel</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Automatically flags score divergences greater than 2.0 points between judges and consensus scores, ensuring fair evaluations.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-4 hover:border-slate-800 transition-all duration-200 group">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-200">
                <Zap size={20} />
              </div>
              <h3 className="font-bold text-white text-base">WebSockets Integration</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Watch judge submissions, consensus shifts, and leaderboard updates happen in real time without refreshing your page.
              </p>
            </div>

          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-8 relative z-10 text-center">
        <p className="text-xs text-slate-600">
          &copy; {new Date().getFullYear()} EventCraft Orchestration System. All rights reserved.
        </p>
      </footer>

    </div>
  )
}
