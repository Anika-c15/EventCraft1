import React, { useState, useEffect } from 'react'
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
  Mail,
  Lock,
  Building,
  Eye,
  EyeOff,
  Check,
  X,
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { Modal } from '../components/ui/Modal'
import { Header } from '../components/Header'
import { useToast } from '../context/ToastAndConfirmContext'
import { authApi } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface JourneyStep {
  phase: string
  title: string
  shortLabel: string
  subtitle: string
  description: string
  icon: any
  actions: string[]
}

const JOURNEY_DATA: Record<'participant' | 'judge' | 'organizer', JourneyStep[]> = {
  participant: [
    { phase: "01", title: "Secure Onboarding", shortLabel: "Onboarding", subtitle: "Passwordless magic link login", description: "Log in securely via a one-click magic link sent to your registered email. No password needed.", icon: Mail, actions: ["Enter registered email", "Retrieve magic link", "One-click secure portal access"] },
    { phase: "02", title: "Smart Team Formation", shortLabel: "Team Matching", subtitle: "AI matching engine coordination", description: "AI groups you into balanced teams based on skills and experience. View your teammates instantly.", icon: Users, actions: ["Inspect assigned teammates", "Check dynamic matchmaking logs", "View collective team skill tags"] },
    { phase: "03", title: "Hacking & Submission", shortLabel: "Submission", subtitle: "Workspace details & dynamic deliverables", description: "Submit repository links and demo videos in the Submission Hub before the deadline.", icon: Zap, actions: ["Submit repository & link details", "Modify deliverables before deadline", "Track live timeline progression"] },
    { phase: "04", title: "Peer Evaluation", shortLabel: "Peer Review", subtitle: "Dynamic project showroom", description: "Explore other submissions and cast peer votes using the interactive scoring panel.", icon: Shield, actions: ["Browse submitted projects showroom", "Cast peer scoring parameters", "Ensure consensus evaluation alignment"] },
    { phase: "05", title: "Leaderboard & Results", shortLabel: "Live Board", subtitle: "Real-time consensus scoring", description: "Track real-time rankings and see final results once scores are locked.", icon: Sparkles, actions: ["Track live consensus leaderboard", "View certificate declarations", "Celebrate event outcomes"] }
  ],
  judge: [
    { phase: "01", title: "Invitation Intake", shortLabel: "Invitation", subtitle: "Secure registration link", description: "Receive a secure invite to join the review panel and access your dashboard.", icon: Mail, actions: ["Receive email invitation", "Open judge portal dashboard", "Confirm evaluation capacity"] },
    { phase: "02", title: "Secure Panel Entry", shortLabel: "Portal Access", subtitle: "Dedicated reviewer interface", description: "Access the reviewer console to view assigned teams and review instructions.", icon: Shield, actions: ["Click secure reviewer magic link", "Access team evaluation list", "Read judging overview instructions"] },
    { phase: "03", title: "AI Rubric Guidance", shortLabel: "AI Rubrics", subtitle: "Dynamic team-specific instructions", description: "Get personalized AI guidelines tailored to each team's project description and tech stack.", icon: Cpu, actions: ["Open team scoring modal", "Read custom AI scoring prompt guidelines", "Consult standardized grading scale"] },
    { phase: "04", title: "Interactive Evaluation", shortLabel: "Scoring", subtitle: "Continuous slider scoring", description: "Grade projects and leave feedback to update rankings in real time.", icon: Sparkles, actions: ["Adjust scoring parameters on sliders", "Provide qualitative comments", "Submit secure evaluations to consensus pool"] },
    { phase: "05", title: "Consensus Locking", shortLabel: "Sign-off", subtitle: "Finalizing peer & judge results", description: "Submit your final evaluation batch to lock consolidated rankings.", icon: Lock, actions: ["Mark evaluation batch as completed", "Review final aggregated scores", "Sign-off on rankings"] }
  ],
  organizer: [
    { phase: "01", title: "Roster Setup & Import", shortLabel: "Roster Intake", subtitle: "Intake synchronization", description: "Import participants via CSV and auto-generate passwordless dashboard links.", icon: Building, actions: ["Upload roster CSV in admin console", "Configure custom pipeline stages", "Broadcast passwordless portal invites"] },
    { phase: "02", title: "AI Matchmaking Engine", shortLabel: "Team Formation", subtitle: "Explainable multi-factor grouping", description: "Run the AI matching engine with custom rules to form balanced teams automatically.", icon: Users, actions: ["Adjust diversity matching rules", "Execute AI matchmaking algorithms", "Review and adjust formed teams manually"] },
    { phase: "03", title: "AI Assessment Setup", shortLabel: "Assessment", subtitle: "Dynamic rubric compilation", description: "Let the AI agent auto-compile customized evaluation guides for each team.", icon: Cpu, actions: ["Analyze team deliverables using AI", "Auto-compile specific rubric sheets", "Preview custom judge criteria guidelines"] },
    { phase: "04", title: "Bias Mitigation Panel", shortLabel: "Bias Check", subtitle: "Real-time score anomaly flagger", description: "Monitor live scoring; the system automatically flags judge score divergences.", icon: AlertCircle, actions: ["Monitor live evaluations feed", "Inspect flagged score divergences", "Initiate judge consensus review"] },
    { phase: "05", title: "Leaderboard & Publishing", shortLabel: "Reveal", subtitle: "Linear ranking reveal", description: "Lock rankings, publish the live leaderboard, and distribute certificates.", icon: Zap, actions: ["Validate and lock composite scoring", "Publish final rankings to live board", "Export event results analytics"] }
  ]
}

const checkPasswordStrength = (pass: string) => {
  return {
    minLength: pass.length >= 8,
    hasNumber: /\d/.test(pass),
    hasSpecial: /[^a-zA-Z0-9]/.test(pass),
  }
}

export const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const context = useAppContext()
  const theme = context?.theme || 'light'
  const { login } = useAppContext()
  const toast = useToast()

  const [portalInput, setPortalInput] = useState<string>('')
  const [portalError, setPortalError] = useState<string>('')
  const [showEmailPopup, setShowEmailPopup] = useState<boolean>(false)

  // Admin Login / Register state
  const [adminTab, setAdminTab] = useState<'login' | 'register' | 'forgot_email' | 'forgot_otp'>('login')
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [confirmPassword, setConfirmPassword] = useState<string>('')
  const [name, setName] = useState<string>('') // Updated from orgName
  const [formError, setFormError] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false)
  const [activeRole, setActiveRole] = useState<'participant' | 'judge' | 'organizer'>('organizer')
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0)
  const [activeSection, setActiveSection] = useState<'features' | 'journey' | 'portal-access' | null>(null)

  const [registerStep, setRegisterStep] = useState<'form' | 'otp'>('form')
  const [otpValue, setOtpValue] = useState<string>('')
  const [otpLoading, setOtpLoading] = useState<boolean>(false)
  
  // Updated state type to match 'name' instead of 'orgName'
  const [pendingRegisterData, setPendingRegisterData] = useState<{email: string, password: string, name: string} | null>(null)

  // Forgot password states
  const [forgotEmail, setForgotEmail] = useState<string>('')
  const [forgotOtp, setForgotOtp] = useState<string>('')
  const [newPassword, setNewPassword] = useState<string>('')
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('')
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState<boolean>(false)

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 160 // offset for fixed header
      const featuresEl = document.getElementById('features')
      const journeyEl = document.getElementById('journey')
      const portalEl = document.getElementById('portal-access')

      if (featuresEl && scrollPosition >= featuresEl.offsetTop) {
        setActiveSection('features')
      } else if (journeyEl && scrollPosition >= journeyEl.offsetTop) {
        setActiveSection('journey')
      } else if (portalEl && scrollPosition >= portalEl.offsetTop) {
        setActiveSection('portal-access')
      } else {
        setActiveSection(null)
      }
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // run once initially
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!email || !password) { setFormError('Please fill in all fields.'); return }
    if (password.length > 128) { setFormError('Password cannot be longer than 128 characters.'); return }
    try {
      await login(email, password)
      
      if (localStorage.getItem('ec_event_id')) {
        navigate('/dashboard')
      } else {
        navigate('/setup')
      }
    } catch (err: any) {
      setFormError(err.message || 'Login failed')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!email || !password || !name) { setFormError('Please fill in all fields.'); return }
    if (password.length > 128) { setFormError('Password cannot be longer than 128 characters.'); return }
    const strength = checkPasswordStrength(password)
    if (!strength.minLength) { setFormError('Password must be at least 8 characters long.'); return }
    if (!strength.hasNumber) { setFormError('Password must contain at least one number.'); return }
    if (!strength.hasSpecial) { setFormError('Password must contain at least one special character.'); return }
    if (password !== confirmPassword) { setFormError('Passwords do not match.'); return }
    setOtpLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed to send OTP')
      
      setPendingRegisterData({ email, password, name })
      setRegisterStep('otp')
    } catch (err: any) {
      setFormError(err.message || 'Failed to send OTP')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!forgotEmail) { setFormError('Please enter your email.'); return }
    setForgotPasswordLoading(true)
    try {
      await authApi.forgotPassword(forgotEmail)
      setAdminTab('forgot_otp')
      setFormError('')
    } catch (err: any) {
      setFormError(err.message || 'Failed to send verification code')
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!forgotOtp || !newPassword || !confirmNewPassword) {
      setFormError('Please fill in all fields.')
      return
    }
    if (forgotOtp.length !== 6) {
      setFormError('Verification code must be exactly 6 digits.')
      return
    }
    if (newPassword.length > 128) {
      setFormError('Password cannot be longer than 128 characters.')
      return
    }
    const strength = checkPasswordStrength(newPassword)
    if (!strength.minLength) {
      setFormError('Password must be at least 8 characters long.')
      return
    }
    if (!strength.hasNumber) {
      setFormError('Password must contain at least one number.')
      return
    }
    if (!strength.hasSpecial) {
      setFormError('Password must contain at least one special character.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setFormError('Passwords do not match.')
      return
    }
    setForgotPasswordLoading(true)
    try {
      await authApi.resetPassword(forgotEmail, forgotOtp, newPassword)
      setAdminTab('login')
      setForgotOtp('')
      setNewPassword('')
      setConfirmNewPassword('')
      setFormError('')
      toast.success('Password reset successfully. You can now login.')
    } catch (err: any) {
      setFormError(err.message || 'Failed to reset password')
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!otpValue || !pendingRegisterData) return
    setOtpLoading(true)
    try {
      // 1. Verify OTP
      const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingRegisterData.email, otp: otpValue }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.detail || 'Invalid OTP')
      }

      // 2. Register User
      const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: pendingRegisterData.email, 
          password: pendingRegisterData.password, 
          name: pendingRegisterData.name 
        }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) throw new Error(regData.detail || 'Registration failed')

      // 3. Login and redirect to EventSetup instead of dashboard
      await login(pendingRegisterData.email, pendingRegisterData.password)
     if (localStorage.getItem('ec_event_id')) {
        navigate('/dashboard')
      } else {
        navigate('/setup')
      }
    } catch (err: any) {
      setFormError(err.message || 'Verification failed')
    } finally {
      setOtpLoading(false)
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
    } catch (err) { }

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
    <div
      className={`min-h-screen font-sans selection:bg-orange-500 selection:text-white relative overflow-x-hidden transition-colors duration-300 ${theme === 'light' ? 'text-slate-800' : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'}`}
      style={theme === 'light' ? { background: 'linear-gradient(to bottom, #FCD5C5 0%, #FCE7DC 30%, #FFF1EB 60%, #FEF5F0 100%)' } : {}}
    >

      {/* Background Fluid Waves & Grid */}
      {theme === 'light' ? (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute inset-0 bg-transparent" />
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage: `
                radial-gradient(circle at 80% 10%, rgba(232, 69, 10, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 20% 25%, rgba(253, 216, 204, 0.15) 0%, transparent 45%),
                radial-gradient(circle at 50% -5%, rgba(254, 240, 235, 0.20) 0%, transparent 40%),
                radial-gradient(circle at 90% 45%, rgba(250, 177, 153, 0.10) 0%, transparent 50%),
                radial-gradient(circle at 10% 60%, rgba(232, 69, 10, 0.04) 0%, transparent 40%),
                radial-gradient(circle at 60% 30%, rgba(253, 216, 204, 0.08) 0%, transparent 60%)
              `
            }}
          />
          <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[60%] rounded-full bg-gradient-to-br from-orange-200/10 via-amber-100/10 to-red-100/5 blur-[130px]" />
          <svg className="absolute top-0 left-0 w-full h-[750px] opacity-[0.25] mix-blend-multiply pointer-events-none" viewBox="0 0 1440 750" fill="none" preserveAspectRatio="none">
            <path d="M0,0 L1440,0 L1440,350 C1300,480 1100,300 850,400 C600,500 350,310 0,480 Z" fill="url(#fluid-grad-1)" />
            <path d="M0,0 L1440,0 L1440,280 C1200,410 950,260 700,370 C450,480 200,330 0,420 Z" fill="url(#fluid-grad-2)" opacity="0.45" />
            <defs>
              <linearGradient id="fluid-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEECE5" />
                <stop offset="40%" stopColor="#FCD1C0" />
                <stop offset="80%" stopColor="#FAA687" />
                <stop offset="100%" stopColor="#FEECE5" />
              </linearGradient>
              <linearGradient id="fluid-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FEECE5" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#FCD1C0" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FAA687" stopOpacity="0.5" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_0.5px,transparent_0.5px)] [background-size:16px_16px] opacity-40" />
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                radial-gradient(circle at 80% 10%, rgba(124, 45, 18, 0.10) 0%, transparent 50%),
                radial-gradient(circle at 20% 25%, rgba(154, 52, 18, 0.08) 0%, transparent 45%),
                radial-gradient(circle at 50% -5%, rgba(124, 45, 18, 0.06) 0%, transparent 40%),
                radial-gradient(circle at 90% 45%, rgba(154, 52, 18, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 10% 60%, rgba(124, 45, 18, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 60% 30%, rgba(154, 52, 18, 0.06) 0%, transparent 60%)
              `
            }}
          />
          <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[60%] rounded-full bg-gradient-to-br from-orange-600/10 via-amber-600/5 to-transparent blur-[140px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[50%] rounded-full bg-gradient-to-tr from-red-600/5 via-orange-600/5 to-transparent blur-[120px]" />
          <svg className="absolute top-0 left-0 w-full h-[750px] opacity-[0.22] mix-blend-screen pointer-events-none" viewBox="0 0 1440 750" fill="none" preserveAspectRatio="none">
            <path d="M0,0 L1440,0 L1440,350 C1300,480 1100,300 850,400 C600,500 350,310 0,480 Z" fill="url(#fluid-grad-dark-1)" />
            <path d="M0,0 L1440,0 L1440,280 C1200,410 950,260 700,370 C450,480 200,330 0,420 Z" fill="url(#fluid-grad-dark-2)" opacity="0.6" />
            <defs>
              <linearGradient id="fluid-grad-dark-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c2d12" />
                <stop offset="40%" stopColor="#9a3412" />
                <stop offset="80%" stopColor="#c2410c" />
                <stop offset="100%" stopColor="#7c2d12" />
              </linearGradient>
              <linearGradient id="fluid-grad-dark-2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#9a3412" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#9a3412" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#7c2d12" stopOpacity="0.5" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,122,24,0.03)_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>
      )}

      {/* Floating Header */}
      <Header activeSection={activeSection} isLandingPage />

      {/* Main Hero & Access Section */}
      <main className="max-w-7xl mx-auto px-6 pt-28 pb-12 lg:pt-36 lg:pb-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

          {/* Left Column: Hero Text */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${theme === 'light'
              ? 'border-orange-200 bg-orange-50/60 text-orange-600'
              : 'border-orange-500/20 bg-orange-500/5 text-orange-400'
              }`}>
              <Sparkles size={12} /> Live Event Engine Active
            </div>

            <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              Intelligent, AI-Powered <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A18] via-[#FF5E62] to-[#FF5E62]">
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
                className={`px-6 py-3 border rounded-xl font-semibold text-sm transition-all duration-150 flex items-center gap-2 cursor-pointer ${theme === 'light'
                  ? 'border-orange-200 bg-orange-50/40 text-orange-700 hover:bg-orange-100/40'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
              >
                Access Guest Portal
              </button>
            </div>

            {/* Quick Metrics */}
            <div className={`grid grid-cols-3 gap-6 pt-8 border-t max-w-md ${theme === 'light' ? 'border-orange-100/60' : 'border-slate-800'
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
            <div className="absolute inset-0 bg-gradient-to-tr from-[#FF7A18] to-[#FF5E62] rounded-3xl blur-xl opacity-20 dark:opacity-25 pointer-events-none" />            {/* Admin Login / Register Card */}
            <div className="relative group/card">
              {/* Outer soft glowing background ring */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#FF7A18] to-[#FF5E62] rounded-3xl blur-xl opacity-20 group-hover/card:opacity-30 transition duration-500 pointer-events-none" />

              <div className={`relative backdrop-blur-2xl border rounded-3xl p-6 sm:p-8 space-y-6 transition-all duration-300 shadow-2xl ${theme === 'light'
                ? 'bg-[#FFF7F4]/80 border-[rgba(255,122,24,0.4)] shadow-[rgba(255,122,24,0.15)]'
                : 'bg-slate-900/80 border-slate-800/80 shadow-black/30'
                }`}>
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl flex items-center justify-center transition-transform duration-300 hover:rotate-12 ${theme === 'light'
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
                      {adminTab === 'login' 
                        ? 'Manage your live hackathons' 
                        : adminTab === 'register' 
                        ? 'Create a fresh event dashboard' 
                        : 'Reset your committee access password'}
                    </p>
                  </div>
                </div>

                 {/* Tab Switcher */}
                <div className={`flex rounded-2xl p-1 bg-slate-100/80 dark:bg-slate-950/50 border border-slate-200/40 dark:border-slate-800/50`}>
                  <button
                    type="button"
                    onClick={() => { setAdminTab('login'); setRegisterStep('form'); setFormError('') }}
                    className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all duration-200 cursor-pointer ${adminTab === 'login' || adminTab === 'forgot_email' || adminTab === 'forgot_otp'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-md scale-[1.02]'
                      : theme === 'light'
                        ? 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                      }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdminTab('register'); setFormError('') }}
                    className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all duration-200 cursor-pointer  
                      ${adminTab === 'register'
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
                          className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
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
                          maxLength={128}
                          className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
                            ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                            }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-1 rounded-lg"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => { setAdminTab('forgot_email'); setFormError('') }}
                          className="text-xs text-orange-500 font-bold hover:underline cursor-pointer bg-transparent border-none p-0"
                        >
                          Forgot Password?
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
                  registerStep === 'otp' && pendingRegisterData ? (
                    <form onSubmit={handleVerifyAndRegister} className="space-y-5">
                      <div className="text-center space-y-2">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${theme === 'light' ? 'bg-orange-50' : 'bg-orange-500/10'}`}>
                          <Mail size={24} className="text-orange-500" />
                        </div>
                        <p className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>Check your email</p>
                        <p className={`text-xs ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                          We sent a 6-digit OTP to <span className="font-bold text-orange-500">{pendingRegisterData.email}</span>
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Enter OTP</label>
                        <input
                          type="text"
                          value={otpValue}
                          onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          maxLength={6}
                          className={`w-full border rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all ${theme === 'light' ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500' : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'}`}
                        />
                      </div>
                      {formError && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-500">
                          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                          <span className="font-semibold">{formError}</span>
                        </div>
                      )}
                      <button 
                        type="submit" 
                        disabled={otpLoading || otpValue.length !== 6}
                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {otpLoading ? 'Verifying...' : 'Verify & Create Account'} <ArrowRight size={14} />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => { setRegisterStep('form'); setFormError(''); setOtpValue('') }}
                        className={`w-full py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${theme === 'light' ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                      >
                        ← Back
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-5">
                      <div className="space-y-1.5">
                        <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Full Name</label>
                        <div className="relative group/input">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                            <Users size={16} />
                          </div>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your Full Name"
                            className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
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
                            className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
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
                            maxLength={128}
                            className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                              }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-1 rounded-lg"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {password && (
                          <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 space-y-1.5 text-[11px] font-semibold transition-all duration-300">
                            <p className={`text-[10px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Password Requirements</p>
                            <div className="flex items-center gap-2">
                              {checkPasswordStrength(password).minLength ? (
                                <Check size={12} className="text-green-500" />
                              ) : (
                                <X size={12} className="text-red-500" />
                              )}
                              <span className={checkPasswordStrength(password).minLength ? "text-green-600 dark:text-green-400" : "text-slate-500"}>Minimum 8 characters</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {checkPasswordStrength(password).hasNumber ? (
                                <Check size={12} className="text-green-500" />
                              ) : (
                                <X size={12} className="text-red-500" />
                              )}
                              <span className={checkPasswordStrength(password).hasNumber ? "text-green-600 dark:text-green-400" : "text-slate-500"}>At least one number</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {checkPasswordStrength(password).hasSpecial ? (
                                <Check size={12} className="text-green-500" />
                              ) : (
                                <X size={12} className="text-red-500" />
                              )}
                              <span className={checkPasswordStrength(password).hasSpecial ? "text-green-600 dark:text-green-400" : "text-slate-500"}>At least one special character</span>
                            </div>
                          </div>
                        )}
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
                            maxLength={128}
                            className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
                              ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                              }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-1 rounded-lg"
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
                        disabled={otpLoading}
                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer shadow-lg shadow-orange-500/10 hover:shadow-orange-500/25 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                      >
                        {otpLoading ? 'Sending OTP...' : 'Send OTP'} <ArrowRight size={14} />
                      </button>
                    </form>
                  )
                )}

                {/* Forgot Password - Email Form */}
                {adminTab === 'forgot_email' && (
                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Email</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Mail size={16} />
                        </div>
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="admin@organisation.com"
                          className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
                            ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                            }`}
                        />
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
                      disabled={forgotPasswordLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer shadow-lg shadow-orange-500/10 hover:shadow-orange-500/25 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                    >
                      {forgotPasswordLoading ? 'Sending...' : 'Send Verification OTP'} <ArrowRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdminTab('login'); setFormError('') }}
                      className={`w-full py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${theme === 'light' ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                    >
                      ← Back to Login
                    </button>
                  </form>
                )}

                {/* Forgot Password - Verify OTP & New Password Form */}
                {adminTab === 'forgot_otp' && (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-5">
                    <div className="text-center space-y-2">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${theme === 'light' ? 'bg-orange-50' : 'bg-orange-500/10'}`}>
                        <Mail size={24} className="text-orange-500" />
                      </div>
                      <p className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>Reset Password</p>
                      <p className={`text-xs ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                        We sent a 6-digit verification code to <span className="font-bold text-orange-500">{forgotEmail}</span>
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Enter OTP</label>
                      <input
                        type="text"
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        maxLength={6}
                        className={`w-full border rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all ${theme === 'light' ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500' : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'}`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>New Password</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New Password (max 128 chars)"
                          maxLength={128}
                          className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
                            ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                            }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-1 rounded-lg"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {newPassword && (
                        <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 space-y-1.5 text-[11px] font-semibold transition-all duration-300">
                          <p className={`text-[10px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Password Requirements</p>
                          <div className="flex items-center gap-2">
                            {checkPasswordStrength(newPassword).minLength ? (
                              <Check size={12} className="text-green-500" />
                            ) : (
                              <X size={12} className="text-red-500" />
                            )}
                            <span className={checkPasswordStrength(newPassword).minLength ? "text-green-600 dark:text-green-400" : "text-slate-500"}>Minimum 8 characters</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {checkPasswordStrength(newPassword).hasNumber ? (
                              <Check size={12} className="text-green-500" />
                            ) : (
                              <X size={12} className="text-red-500" />
                            )}
                            <span className={checkPasswordStrength(newPassword).hasNumber ? "text-green-600 dark:text-green-400" : "text-slate-500"}>At least one number</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {checkPasswordStrength(newPassword).hasSpecial ? (
                              <Check size={12} className="text-green-500" />
                            ) : (
                              <X size={12} className="text-red-500" />
                            )}
                            <span className={checkPasswordStrength(newPassword).hasSpecial ? "text-green-600 dark:text-green-400" : "text-slate-500"}>At least one special character</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className={`block text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Confirm New Password</label>
                      <div className="relative group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors group-focus-within/input:text-orange-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Confirm New Password"
                          maxLength={128}
                          className={`w-full border rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all duration-150 ${theme === 'light'
                            ? 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-orange-500 focus:bg-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-200 focus:border-orange-500'
                            }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-1 rounded-lg"
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
                      disabled={forgotPasswordLoading || forgotOtp.length !== 6}
                      className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {forgotPasswordLoading ? 'Resetting...' : 'Reset Password'} <ArrowRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdminTab('login'); setFormError(''); setForgotOtp(''); setNewPassword(''); setConfirmNewPassword('') }}
                      className={`w-full py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${theme === 'light' ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                    >
                      ← Cancel
                    </button>
                  </form>
                )}

                {/* Participant access link */}
                <div className={`pt-3.5 border-t text-center ${theme === 'light' ? 'border-slate-100' : 'border-slate-800'}`}>
                  <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                    Are you a participant?{' '}
                    <button
                      type="button"
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

        {/* Event Journey Section */}
        <section id="journey" className="py-20 mt-20 space-y-12 transition-all duration-300">
          {/* Header Title */}
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${theme === 'light'
              ? 'bg-orange-50 text-orange-600 border border-orange-100/55'
              : 'bg-orange-500/10 text-orange-300 border border-orange-500/25'
              }`}>
              <Sparkles size={11} className="animate-spin-slow" /> Interactive Journey
            </div>
            <h2 className={`text-3xl sm:text-4xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              Explore the Event Journey
            </h2>
            <p className={`text-sm sm:text-base leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              EventCraft coordinates participants, reviewers, and organizers through a real-time smart pipeline. Click on a role below to explore their synchronized path.
            </p>
          </div>

          {/* Role Selector Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto px-4">
            {/* Organizer Role Card */}
            <button
              type="button"
              onClick={() => { setActiveRole('organizer'); setActiveStepIndex(0); }}
              className={`flex items-center gap-4 border rounded-2xl p-5 text-left transition-all duration-300 group cursor-pointer ${activeRole === 'organizer'
                ? theme === 'light'
                  ? 'bg-gradient-to-r from-orange-500/10 to-orange-500/5 border-orange-300 shadow-md shadow-orange-500/5 scale-[1.02]'
                  : 'bg-slate-900/80 border-orange-500/40 shadow-xl shadow-orange-500/5 scale-[1.02]'
                : theme === 'light'
                  ? 'bg-white/50 border-slate-100 hover:border-orange-200 hover:bg-white'
                  : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 hover:bg-slate-900/50'
                }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${activeRole === 'organizer'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                : theme === 'light'
                  ? 'bg-orange-50 text-orange-500'
                  : 'bg-orange-950/30 text-orange-400'
                }`}>
                <Building size={22} />
              </div>
              <div>
                <div className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Organizer Track</div>
                <div className={`text-xs mt-0.5 ${activeRole === 'organizer' ? 'text-orange-500 dark:text-orange-400 font-semibold' : 'text-slate-400'}`}>
                  Matchmaking & Consensus
                </div>
              </div>
            </button>

            {/* Participant Role Card */}
            <button
              type="button"
              onClick={() => { setActiveRole('participant'); setActiveStepIndex(0); }}
              className={`flex items-center gap-4 border rounded-2xl p-5 text-left transition-all duration-300 group cursor-pointer ${activeRole === 'participant'
                ? theme === 'light'
                  ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-emerald-300 shadow-md shadow-emerald-500/5 scale-[1.02]'
                  : 'bg-slate-900/80 border-emerald-500/40 shadow-xl shadow-emerald-500/5 scale-[1.02]'
                : theme === 'light'
                  ? 'bg-white/50 border-slate-100 hover:border-emerald-200 hover:bg-white'
                  : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 hover:bg-slate-900/50'
                }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${activeRole === 'participant'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : theme === 'light'
                  ? 'bg-emerald-50 text-emerald-500'
                  : 'bg-emerald-950/30 text-emerald-400'
                }`}>
                <Users size={22} />
              </div>
              <div>
                <div className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Participant Track</div>
                <div className={`text-xs mt-0.5 ${activeRole === 'participant' ? 'text-emerald-500 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                  Roster, Teams & Submissions
                </div>
              </div>
            </button>

            {/* Judge Role Card */}
            <button
              type="button"
              onClick={() => { setActiveRole('judge'); setActiveStepIndex(0); }}
              className={`flex items-center gap-4 border rounded-2xl p-5 text-left transition-all duration-300 group cursor-pointer ${activeRole === 'judge'
                ? theme === 'light'
                  ? 'bg-gradient-to-r from-indigo-500/10 to-indigo-500/5 border-indigo-300 shadow-md shadow-indigo-500/5 scale-[1.02]'
                  : 'bg-slate-900/80 border-indigo-500/40 shadow-xl shadow-indigo-500/5 scale-[1.02]'
                : theme === 'light'
                  ? 'bg-white/50 border-slate-100 hover:border-indigo-200 hover:bg-white'
                  : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 hover:bg-slate-900/50'
                }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${activeRole === 'judge'
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                : theme === 'light'
                  ? 'bg-indigo-50 text-indigo-500'
                  : 'bg-indigo-950/30 text-indigo-400'
                }`}>
                <Shield size={22} />
              </div>
              <div>
                <div className={`font-bold text-base ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Judge Track</div>
                <div className={`text-xs mt-0.5 ${activeRole === 'judge' ? 'text-indigo-500 dark:text-indigo-400 font-semibold' : 'text-slate-400'}`}>
                  Secure Rubrics & Scoring
                </div>
              </div>
            </button>
          </div>

          {/* Horizontal Stepper Progress Bar */}
          <div className="max-w-3xl mx-auto px-4 mt-8 mb-12">
            <div className="relative flex items-center justify-between">
              {/* Connecting Track Line */}
              <div className={`absolute left-0 right-0 h-1 -translate-y-1/2 top-1/2 z-0 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-850/80'
                }`}>
                {/* Highlight active progress line */}
                <div
                  className={`h-full transition-all duration-500 ${activeRole === 'organizer'
                    ? 'bg-gradient-to-r from-orange-500 to-red-500'
                    : activeRole === 'judge'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    }`}
                  style={{ width: `${(activeStepIndex / 4) * 100}%` }}
                />
              </div>

              {/* Stepper Nodes */}
              {JOURNEY_DATA[activeRole].map((step, idx) => {
                const isSelected = idx === activeStepIndex
                const isCompleted = idx < activeStepIndex

                let nodeBorderColor = 'border-slate-200 dark:border-slate-800'
                let nodeBg = 'bg-white dark:bg-slate-900 text-[#999] dark:text-[#666]'
                let ringColor = ''

                if (isSelected) {
                  nodeBorderColor = activeRole === 'organizer' ? 'border-orange-500' : activeRole === 'judge' ? 'border-indigo-500' : 'border-emerald-500'
                  nodeBg = activeRole === 'organizer' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25' : activeRole === 'judge' ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25' : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                  ringColor = activeRole === 'organizer' ? 'ring-orange-500/20' : activeRole === 'judge' ? 'ring-indigo-500/20' : 'ring-emerald-500/20'
                } else if (isCompleted) {
                  nodeBorderColor = activeRole === 'organizer' ? 'border-orange-400/60' : activeRole === 'judge' ? 'border-indigo-400/60' : 'border-emerald-400/60'
                  nodeBg = activeRole === 'organizer' ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400' : activeRole === 'judge' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400' : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                }

                return (
                  <div key={idx} className="flex flex-col items-center relative z-10">
                    <button
                      type="button"
                      onClick={() => setActiveStepIndex(idx)}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all duration-300 cursor-pointer ${nodeBorderColor} ${nodeBg} ${isSelected ? 'scale-110 ring-4' : 'hover:scale-105 hover:bg-slate-50 dark:hover:bg-slate-800'
                        } ${ringColor}`}
                      title={step.title}
                    >
                      {step.phase}
                    </button>
                    <span className={`text-[10px] font-bold uppercase tracking-wider mt-2.5 max-w-[80px] text-center hidden sm:block transition-colors duration-300 ${isSelected
                      ? activeRole === 'organizer' ? 'text-orange-500' : activeRole === 'judge' ? 'text-indigo-500' : 'text-emerald-500'
                      : 'text-[#999] dark:text-[#666]'
                      }`}>
                      {step.shortLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Stepper Detail View (Single Card) */}
          <div className="max-w-3xl mx-auto px-4">
            <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in {
              animation: fadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
            {(() => {
              const step = JOURNEY_DATA[activeRole][activeStepIndex]
              const Icon = step.icon

              let roleBorderColor = 'border-emerald-100/80 dark:border-emerald-500/20 hover:border-emerald-200'
              let roleGlow = 'shadow-emerald-500/5'

              if (activeRole === 'judge') {
                roleBorderColor = 'border-indigo-100/80 dark:border-indigo-500/20 hover:border-indigo-200'
                roleGlow = 'shadow-indigo-500/5'
              } else if (activeRole === 'organizer') {
                roleBorderColor = 'border-orange-100/80 dark:border-orange-500/20 hover:border-orange-200'
                roleGlow = 'shadow-orange-500/5'
              }

              return (
                <div
                  key={`${activeRole}-${activeStepIndex}`}
                  className={`w-full border rounded-3xl p-6 sm:p-8 transition-all duration-500 backdrop-blur-sm animate-fade-in ${theme === 'light'
                    ? `bg-white/70 ${roleBorderColor} shadow-xl ${roleGlow}`
                    : `bg-[#1e2130] border border-white/15 shadow-2xl shadow-black/40`
                    }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${activeRole === 'organizer'
                          ? 'bg-orange-500/10 text-orange-500'
                          : activeRole === 'judge'
                            ? 'bg-indigo-500/10 text-indigo-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                          Phase {step.phase}
                        </span>
                        <span className={`text-xs font-bold uppercase tracking-wide ${theme === 'light' ? 'text-slate-400' : 'text-white/75'
                          }`}>
                          • {step.subtitle}
                        </span>
                      </div>
                      <h3 className={`text-xl sm:text-2xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'
                        }`}>
                        {step.title}
                      </h3>
                    </div>

                    {/* Dynamic Step Icon */}
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:rotate-6 self-start sm:self-center ${activeRole === 'organizer'
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                      : activeRole === 'judge'
                        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                        : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      }`}>
                      <Icon size={24} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-6">
                    {/* Left Column: Description */}
                    <div className="md:col-span-7 space-y-3">
                      <h4 className={`text-[10px] font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-white/75'
                        }`}>
                        Phase Overview
                      </h4>
                      <p className={`text-xs sm:text-sm leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-white/75'
                        }`}>
                        {step.description}
                      </p>
                    </div>

                    {/* Right Column: System Interactions */}
                    <div className={`md:col-span-5 rounded-2xl p-5 border md:mt-0 ${theme === 'light'
                      ? 'bg-slate-50/50 border-slate-100/80'
                      : 'bg-slate-950/40 border border-white/15'
                      }`}>
                      <h4 className={`text-[10px] font-extrabold uppercase tracking-wider mb-3 ${activeRole === 'organizer'
                        ? 'text-orange-500'
                        : activeRole === 'judge'
                          ? 'text-indigo-500'
                          : 'text-emerald-500'
                        }`}>
                        System Interactions
                      </h4>
                      <ul className="space-y-2">
                        {step.actions.map((act, aIdx) => (
                          <li key={aIdx} className="flex items-start gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${activeRole === 'organizer'
                              ? 'bg-orange-500'
                              : activeRole === 'judge'
                                ? 'bg-indigo-500'
                                : 'bg-emerald-500'
                              }`} />
                            <span className={`leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-white/75'
                              }`}>
                              {act}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 mt-20 space-y-12 transition-all">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${theme === 'light'
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
            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${theme === 'light'
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

            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${theme === 'light'
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

            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${theme === 'light'
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

            <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-200 group ${theme === 'light'
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
      <footer className="py-8 relative z-10 text-center transition-all bg-transparent">
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
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
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
                className={`w-full border rounded-xl pl-3 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-mono ${theme === 'light'
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
            type="button"
            onClick={() => setShowEmailPopup(false)}
            className={`w-full py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${theme === 'light'
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