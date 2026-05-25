import React, { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, RefreshCw, CheckCircle, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { agentApi } from '../api/client'
import { useAppContext } from '../context/AppContext'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export const Agent: React.FC = () => {
  const { eventId } = useAppContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pipelineConfigured, setPipelineConfigured] = useState(false)
  const [pipelineConfig, setPipelineConfig] = useState<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (eventId) loadHistory()
  }, [eventId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = async () => {
    if (!eventId) return
    try {
      const history = await agentApi.history(eventId)
      setMessages(history)
    } catch {
      setMessages([])
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !eventId || loading) return
    const content = input.trim()
    setInput('')
    setLoading(true)

    // Optimistic user message
    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', content, created_at: new Date().toISOString() },
    ])

    try {
      const res = await agentApi.chat(eventId, content)
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { id: `u-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() },
        res.message,
      ])
      if (res.pipeline_configured) {
        setPipelineConfigured(true)
        setPipelineConfig(res.pipeline_config)
      }
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${e.message}`,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = async () => {
    if (!eventId) return
    await agentApi.clearHistory(eventId)
    setMessages([])
    setPipelineConfigured(false)
    setPipelineConfig(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const starterPrompts = [
    'I want to run a 2-day hackathon with 60 participants, teams of 4, judged on innovation and execution.',
    'Set up a case competition with 3 rounds: submission, presentation, and final pitch.',
    'Configure a coding contest with individual participants, automated scoring, and 3 elimination rounds.',
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Configuration Agent</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Describe your event in natural language — the AI will configure the pipeline for you
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pipelineConfigured && (
            <Badge variant="success" className="flex items-center gap-1">
              <CheckCircle size={12} />
              Pipeline Configured
            </Badge>
          )}
          <Button variant="secondary" size="sm" onClick={clearHistory}>
            <RefreshCw size={14} />
            Clear Chat
          </Button>
        </div>
      </div>

      {/* Pipeline Config Summary */}
      {pipelineConfigured && pipelineConfig && (
        <Card className="mb-4 border-green-200 bg-green-50">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800 mb-1">
                ✅ Pipeline configured! The following were auto-generated:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {/* Stages */}
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Pipeline Stages</p>
                  <div className="space-y-1">
                    {pipelineConfig.stages?.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 text-[10px] flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                        <span className="text-xs text-gray-700">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Formation Rules */}
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Team Formation</p>
                  <div className="space-y-1 text-xs text-gray-700">
                    <p>Team size: <strong>{pipelineConfig.formation_rules?.team_size ?? 3}</strong></p>
                    <p>Max teams: <strong>{pipelineConfig.formation_rules?.max_teams ?? 10}</strong></p>
                    <p>Skill balance: <strong>{pipelineConfig.formation_rules?.skill_balance ? 'Yes' : 'No'}</strong></p>
                    <p>Grouping: <strong>{pipelineConfig.formation_rules?.experience_level_grouping ?? 'mixed'}</strong></p>
                  </div>
                </div>
                {/* Criteria + Comms */}
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Evaluation Criteria</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {pipelineConfig.evaluation_criteria?.map((c: string) => (
                      <span key={c} className="text-[10px] bg-green-50 border border-green-200 text-green-700 px-1.5 py-0.5 rounded">{c}</span>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Draft Emails</p>
                  <p className="text-xs text-gray-600">Auto-generated for {pipelineConfig.communication_stages?.length ?? 0} stages</p>
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">
                Check <strong>Pipeline</strong>, <strong>Formation Rules</strong>, and <strong>Communications</strong> pages to review. Go to <strong>Approvals</strong> to activate.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Chat Area */}
      <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                <Sparkles size={24} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">
                Describe your event
              </h3>
              <p className="text-sm text-gray-500 max-w-md mb-6">
                Tell the agent about your event format, team structure, evaluation model, and any
                special requirements. It will configure the entire pipeline for you.
              </p>
              <div className="space-y-2 w-full max-w-lg">
                {starterPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="w-full text-left text-sm text-gray-600 bg-gray-50 hover:bg-orange-50 hover:text-primary border border-gray-100 hover:border-orange-200 rounded-lg px-4 py-2.5 transition-all"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-primary' : 'bg-gray-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <User size={14} className="text-white" />
                ) : (
                  <Bot size={14} className="text-gray-600" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-tr-sm'
                    : 'bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Bot size={14} className="text-gray-600" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your event format... (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
            <Button
              variant="primary"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="self-end px-4 py-2.5"
            >
              <Send size={16} />
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Powered by Gemini 2.0 Flash · Enter to send
          </p>
        </div>
      </div>
    </div>
  )
}
