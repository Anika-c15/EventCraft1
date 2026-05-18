/**
 * WebSocket hook — connects to the backend real-time channel for an event.
 * Automatically reconnects on disconnect with exponential backoff.
 *
 * Usage:
 *   const { lastMessage, connected } = useWebSocket(eventId)
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .replace('http://', 'ws://')
  .replace('https://', 'wss://')

interface WsMessage {
  type: string
  [key: string]: any
}

interface UseWebSocketReturn {
  lastMessage: WsMessage | null
  connected: boolean
  send: (data: object) => void
}

export function useWebSocket(
  eventId: string | null,
  onMessage?: (msg: WsMessage) => void,
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)
  const mountedRef = useRef(true)

  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null)

  const connect = useCallback(() => {
    if (!eventId || !mountedRef.current) return

    const token = localStorage.getItem('ec_token') || ''
    const url = `${WS_BASE}/ws/${eventId}?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      reconnectDelay.current = 1000 // reset backoff
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg: WsMessage = JSON.parse(event.data)
        if (msg.type === 'pong') return
        setLastMessage(msg)
        onMessage?.(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = (e) => {
      if (!mountedRef.current) return
      setConnected(false)
      wsRef.current = null

      // Don't reconnect on auth failure
      if (e.code === 4001 || e.code === 4004) return

      // Exponential backoff reconnect (max 30s)
      const delay = Math.min(reconnectDelay.current, 30000)
      reconnectDelay.current = delay * 2
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [eventId, onMessage])

  // Ping every 25s to keep connection alive
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25000)
    return () => clearInterval(interval)
  }, [connected])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { lastMessage, connected, send }
}
