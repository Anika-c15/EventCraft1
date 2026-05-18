import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { Button } from '../components/ui/Button'

export const Login: React.FC = () => {
  const { login, isAuthenticated, loading, error } = useAppContext()
  const [email, setEmail] = useState('admin@eventcraft.com')
  const [password, setPassword] = useState('admin123')
  const [localError, setLocalError] = useState('')

  if (isAuthenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')
    try {
      await login(email, password)
    } catch (err: any) {
      setLocalError(err.message || 'Login failed')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">EC</span>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">EventCraft</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-widest">
              Orchestration System
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Committee Login</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to manage your event</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="admin@eventcraft.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="••••••••"
                required
              />
            </div>

            {(error || localError) && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-600">
                {error || localError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center py-2.5"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 font-medium mb-1">Default credentials:</p>
            <p className="text-xs text-gray-600">Email: admin@eventcraft.com</p>
            <p className="text-xs text-gray-600">Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  )
}
