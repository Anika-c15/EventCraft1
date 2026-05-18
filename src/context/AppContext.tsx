import React, { createContext, useContext, useState } from 'react'
import { approvals as initialApprovals } from '../data/mockData'
import type { Approval, ApprovalStatus } from '../types'

interface AppContextType {
  appApprovals: Approval[]
  resolveApproval: (id: string, status: ApprovalStatus) => void
}

const AppContext = createContext<AppContextType | null>(null)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appApprovals, setAppApprovals] = useState<Approval[]>(initialApprovals)

  const resolveApproval = (id: string, status: ApprovalStatus) => {
    setAppApprovals((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              resolvedAt: new Date().toISOString(),
              resolvedBy: 'Admin',
            }
          : a
      )
    )
  }

  return (
    <AppContext.Provider value={{ appApprovals, resolveApproval }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
