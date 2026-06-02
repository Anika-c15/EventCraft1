import React, { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle, X, Bell, Trash2 } from 'lucide-react'
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
interface QAMessage {
  id: string
  sender_name: string
  sender_role: string
  message: string
  parent_id: string | null
  created_at: string
}

interface Props {
  eventId: string
  teamId: string
  senderName: string
  senderRole: 'judge' | 'team' | 'committee'
  onNewMessage?: (msg: QAMessage) => void
  disabled?: boolean
}

export const QAChat: React.FC<Props> = ({ eventId, teamId, senderName, senderRole, onNewMessage, disabled }) => {
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)
  
  const load = async () => {
    try {
     const res = await fetch(`${BASE_URL}/api/events/${eventId}/qa/${teamId}`)
      const data = await res.json()

      if (data.length > prevCountRef.current) {
        const newMsgs = data.slice(prevCountRef.current)
        newMsgs.forEach((msg: QAMessage) => {
          if (msg.sender_role !== senderRole && onNewMessage) {
            onNewMessage(msg)
          }
        })
      }
      prevCountRef.current = data.length
      setMessages(data)
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [eventId, teamId])

  useEffect(() => {
    // Only scroll within the chat container itself — never the page
    const container = scrollContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    setSending(true)
    try {
     await fetch(`${BASE_URL}/api/events/${eventId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          sender_name: senderName,
          sender_role: senderRole,
          message: input.trim(),
        })
      })
      setInput('')
      await load()
    } catch {}
    setSending(false)
  }

 const handleClear = async () => {
  setClearing(true)
  try {
    await fetch(`${BASE_URL}/api/events/${eventId}/qa/${teamId}/clear`, 
      { method: 'DELETE' }
    )
    setMessages([])
    prevCountRef.current = 0
    setShowConfirm(false)
  } catch {}
  setClearing(false)
}

  const roleColor = (role: string) => {
    switch (role) {
      case 'judge': return 'bg-purple-100 text-purple-700'
      case 'committee': return 'bg-orange-100 text-orange-700'
      case 'team': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const formatTime = (iso: string) => {
  const date = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })
}

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-96 relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <MessageCircle size={16} className="text-primary" />
        <h3 className="font-semibold text-gray-900 text-sm">Live Q&A</h3>
        <span className="text-xs text-gray-400 ml-1">({messages.length} messages)</span>
        <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />

        {/* Clear button */}
        {messages.length > 0 && !disabled && (
          <button
            onClick={() => setShowConfirm(true)}
            className="ml-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
            title="Clear chat"
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Confirm Clear Popup */}
      {showConfirm && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-xl z-10 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Clear all messages?</p>
            <p className="text-xs text-gray-500 mb-4">This cannot be undone.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="px-4 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-60"
              >
                {clearing ? 'Clearing...' : 'Clear Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8">
            No messages yet. Start the conversation!
          </p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender_role === senderRole ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(msg.sender_role)}`}>
                  {msg.sender_role}
                </span>
                <span className="text-xs font-medium text-gray-700">{msg.sender_name}</span>
                <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
              </div>
              <div className={`max-w-xs px-3 py-2 rounded-xl text-sm ${
                msg.sender_role === senderRole
                  ? 'bg-primary text-white rounded-tr-none'
                  : 'bg-gray-100 text-gray-800 rounded-tl-none'
              }`}>
                {msg.message}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && handleSend()}
          placeholder={disabled ? "Chat is locked until project is submitted..." : "Type a message..."}
          disabled={disabled}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={disabled || sending || !input.trim()}
          className="bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}


// ── Notification Popup Component ───────────────────────────────────────────────

interface NotificationProps {
  message: QAMessage | null
  onClose: () => void
}

export const QANotificationPopup: React.FC<NotificationProps> = ({ message, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 6000)
      return () => clearTimeout(timer)
    }
  }, [message])

  if (!message) return null

  const roleColor = (role: string) => {
    switch (role) {
      case 'judge': return 'bg-purple-600'
      case 'committee': return 'bg-orange-500'
      default: return 'bg-gray-700'
    }
  }

  const roleLabel = (role: string) => {
    switch (role) {
      case 'judge': return '⚖️ Judge'
      case 'committee': return '🛡️ Committee'
      default: return role
    }
  }

  return (
    <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 max-w-sm w-full">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-primary animate-bounce" />
            <span className="text-xs font-bold text-gray-900">New Message</span>
            <span className={`text-xs text-white px-2 py-0.5 rounded-full font-semibold ${roleColor(message.sender_role)}`}>
              {roleLabel(message.sender_role)}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>

        <p className="text-xs font-semibold text-gray-700 mb-1">{message.sender_name}</p>

        <div className="bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-800 border border-gray-100">
          {message.message}
        </div>

        <p className="text-[10px] text-gray-400 mt-2 text-right">
          Scroll down to reply in Live Q&A
        </p>
      </div>
    </div>
  )
}