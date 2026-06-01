import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AppProvider, useAppContext } from './context/AppContext'

const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
const Participants = React.lazy(() => import('./pages/Participants').then(m => ({ default: m.Participants })))
const Teams = React.lazy(() => import('./pages/Teams').then(m => ({ default: m.Teams })))
const Evaluations = React.lazy(() => import('./pages/Evaluations').then(m => ({ default: m.Evaluations })))
const Communications = React.lazy(() => import('./pages/Communications').then(m => ({ default: m.Communications })))
const Pipeline = React.lazy(() => import('./pages/Pipeline').then(m => ({ default: m.Pipeline })))
const Approvals = React.lazy(() => import('./pages/Approvals').then(m => ({ default: m.Approvals })))
const FormationRules = React.lazy(() => import('./pages/FormationRules').then(m => ({ default: m.FormationRules })))
const ParticipantPortal = React.lazy(() => import('./pages/ParticipantPortal').then(m => ({ default: m.ParticipantPortal })))
const JudgePortal = React.lazy(() => import('./pages/JudgePortal').then(m => ({ default: m.JudgePortal })))
const Agent = React.lazy(() => import('./pages/Agent').then(m => ({ default: m.Agent })))
const Subscribe = React.lazy(() => import('./pages/Subscribe').then(m => ({ default: m.Subscribe })))
const Subscribers = React.lazy(() => import('./pages/Subscribers').then(m => ({ default: m.Subscribers })))
const Unsubscribe = React.lazy(() => import('./pages/Unsubscribe').then(m => ({ default: m.Unsubscribe })))
const LiveLeaderboard = React.lazy(() => import('./pages/LiveLeaderboard').then(m => ({ default: m.LiveLeaderboard })))
const CandidatePortal = React.lazy(() => import('./pages/CandidatePortal').then(m => ({ default: m.CandidatePortal })))

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authChecked } = useAppContext()

  // While the initial session check is in flight, show nothing (prevents flash)
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading EventCraft...</p>
        </div>
      </div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

const PageLoader: React.FC = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
    <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    <p className="text-sm text-gray-400">Loading page...</p>
  </div>
)

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/portal/:id" element={<ParticipantPortal />} />
            <Route path="/judge/:eventId" element={<JudgePortal />} />
            <Route path="/subscribe" element={<Subscribe />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/live-leaderboard" element={<LiveLeaderboard />} />
            <Route path="/candidate" element={<CandidatePortal />} />

            {/* Protected routes with sidebar */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/participants" element={<Participants />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/evaluations" element={<Evaluations />} />
              <Route path="/communications" element={<Communications />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/formation-rules" element={<FormationRules />} />
              <Route path="/agent" element={<Agent />} />
              <Route path="/subscribers" element={<Subscribers />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
