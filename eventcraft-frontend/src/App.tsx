import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AppProvider, useAppContext } from './context/AppContext'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Participants } from './pages/Participants'
import { Teams } from './pages/Teams'
import { Evaluations } from './pages/Evaluations'
import { Communications } from './pages/Communications'
import { Pipeline } from './pages/Pipeline'
import { Approvals } from './pages/Approvals'
import { FormationRules } from './pages/FormationRules'
import { ParticipantPortal } from './pages/ParticipantPortal'
import { JudgePortal } from './pages/JudgePortal'
import { Agent } from './pages/Agent'

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

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/portal/:id" element={<ParticipantPortal />} />
          <Route path="/judge/:eventId" element={<JudgePortal />} />

          {/* Protected routes with sidebar */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/participants" element={<Participants />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/communications" element={<Communications />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/formation-rules" element={<FormationRules />} />
            <Route path="/agent" element={<Agent />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
