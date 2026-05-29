import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AppProvider } from './context/AppContext'
import { Dashboard } from './pages/Dashboard'
import { Participants } from './pages/Participants'
import { Teams } from './pages/Teams'
import { Evaluations } from './pages/Evaluations'
import { Communications } from './pages/Communications'
import { Pipeline } from './pages/Pipeline'
import { Approvals } from './pages/Approvals'
import { FormationRules } from './pages/FormationRules'
import { ParticipantPortal } from './pages/ParticipantPortal'
import { Subscribe } from './pages/Subscribe'
import { Subscribers } from './pages/Subscribers'
import { CandidatePortal } from './pages/CandidatePortal'

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Public / Standalone pages (no sidebar) ── */}
          <Route path="/portal/:id"   element={<ParticipantPortal />} />
          <Route path="/subscribe"    element={<Subscribe />} />
          <Route path="/candidate"    element={<CandidatePortal />} />

          {/* ── Admin pages with Sidebar Layout ── */}
          <Route element={<Layout />}>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/participants"    element={<Participants />} />
            <Route path="/teams"           element={<Teams />} />
            <Route path="/evaluations"     element={<Evaluations />} />
            <Route path="/communications"  element={<Communications />} />
            <Route path="/pipeline"        element={<Pipeline />} />
            <Route path="/approvals"       element={<Approvals />} />
            <Route path="/formation-rules" element={<FormationRules />} />
            <Route path="/subscribers"     element={<Subscribers />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App