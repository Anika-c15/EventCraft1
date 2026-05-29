import React, { createContext, useContext, useState, useEffect } from 'react'
import { approvals as initialApprovals } from '../data/mockData'
import type { Approval, ApprovalStatus, Subscriber } from '../types'

interface AppContextType {
  appApprovals: Approval[]
  resolveApproval: (id: string, status: ApprovalStatus) => void
  addApproval: (approval: Omit<Approval, 'id' | 'createdAt'>) => void
  subscribers: Subscriber[]
  addSubscriber: (name: string, email: string) => boolean
  removeSubscriber: (id: string) => void
  notifySubscribers: (eventName: string, description: string) => number
}

const AppContext = createContext<AppContextType | null>(null)

const STORAGE_KEY = 'eventcraft_subscribers'

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appApprovals, setAppApprovals] = useState<Approval[]>(initialApprovals)

  // Load subscribers from localStorage so they persist on refresh
  const [subscribers, setSubscribers] = useState<Subscriber[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Save subscribers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscribers))
  }, [subscribers])

  const resolveApproval = (id: string, status: ApprovalStatus) => {
    setAppApprovals((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status, resolvedAt: new Date().toISOString(), resolvedBy: 'Admin' }
          : a
      )
    )
  }

  const addApproval = (approval: Omit<Approval, 'id' | 'createdAt'>) => {
    const newApproval: Approval = {
      ...approval,
      id: `apr_${Date.now()}`,
      createdAt: new Date().toISOString(),
    }
    setAppApprovals((prev) => [newApproval, ...prev])
  }

  // Returns false if email already subscribed
  const addSubscriber = (name: string, email: string): boolean => {
    if (subscribers.some((s) => s.email.toLowerCase() === email.toLowerCase())) {
      return false
    }
    const newSub: Subscriber = {
      id: `sub_${Date.now()}`,
      name,
      email,
      subscribedAt: new Date().toISOString(),
      notified: false,
    }
    setSubscribers((prev) => [...prev, newSub])
    return true
  }

  const removeSubscriber = (id: string) => {
    setSubscribers((prev) => prev.filter((s) => s.id !== id))
  }

  // Simulates notifying all subscribers — returns count notified
  const notifySubscribers = (_eventName: string, _description: string): number => {
    const unnotified = subscribers.filter((s) => !s.notified)
    setSubscribers((prev) =>
      prev.map((s) => ({ ...s, notified: true }))
    )
    return unnotified.length
  }

  return (
    <AppContext.Provider value={{
      appApprovals, resolveApproval, addApproval,
      subscribers, addSubscriber, removeSubscriber, notifySubscribers,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}