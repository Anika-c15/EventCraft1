import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export const Layout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-background dark:bg-slate-950 transition-colors duration-200">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
