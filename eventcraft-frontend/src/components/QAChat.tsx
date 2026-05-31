import React, { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle } from 'lucide-react'

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
}

export const QAChat: React.FC<Props> = ({ eventId, teamId, senderName, senderRole }) => {
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/events/${eventId}/qa/${teamId}`)
      const data = await res.json()
      setMessages(data)
    } catch {}
  }

  useEffect(() => {
    load()
    // poll every 5 seconds for new messages
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [eventId, teamId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    setSending(true)
    try {
      await fetch(`http://localhost:8000/api/events/${eventId}/qa`, {
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

  const roleColor = (role: string) => {
    switch (role) {
      case 'judge': return 'bg-purple-100 text-purple-700'
      case 'committee': return 'bg-orange-100 text-orange-700'
      case 'team': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    })

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-96">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <MessageCircle size={16} className="text-primary" />
        <h3 className="font-semibold text-gray-900 text-sm">Live Q&A</h3>
        <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}