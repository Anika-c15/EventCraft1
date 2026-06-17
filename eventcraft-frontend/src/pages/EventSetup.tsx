import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building, ArrowRight, Sun, Moon } from 'lucide-react'
import { useAppContext } from '../context/AppContext'

const EventSetup: React.FC = () => {
  const navigate = useNavigate()
  
  // Pulling theme and createEvent directly from your Context
  const { theme, toggleTheme, createEvent } = useAppContext()
  
  const [eventName, setEventName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventName.trim()) return
    
    setError('')
    setLoading(true)
    
    try {
    
      await createEvent(eventName, `Official workspace for ${eventName}`)
      
    
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 relative transition-colors duration-300 ${theme === 'light' ? 'bg-slate-50' : 'bg-slate-950'}`}>
      
      {/* Floating Theme Toggle */}
      <button
        onClick={toggleTheme}
        className={`absolute top-6 right-6 p-3 rounded-full shadow-sm border transition-all ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-500 hover:text-orange-500' 
            : 'bg-slate-900 border-slate-800 text-yellow-500'
        }`}
        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      >
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      <div className="max-w-md w-full">
        <div className={`p-8 rounded-3xl border shadow-xl ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div className="space-y-6">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-2xl flex items-center justify-center shadow-inner">
              <Building size={24} />
            </div>
            
            <div>
              <h1 className="text-2xl font-black mb-2 dark:text-white">Let's set up your Event</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Give your hackathon or competition a name to initialize your dashboard and AI pipelines.
              </p>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Event Name
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Global Tech Hackathon 2026"
                  className={`w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500 ${
                    theme === 'light' 
                      ? 'bg-white border-slate-200 text-slate-900' 
                      : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                  required
                />
              </div>
              
              {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}
              
              <button 
                disabled={loading || !eventName.trim()} 
                type="submit" 
                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {loading ? 'Initializing...' : 'Initialize Event'} 
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EventSetup