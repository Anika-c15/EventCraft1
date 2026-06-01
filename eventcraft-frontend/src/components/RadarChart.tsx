import React, { useRef, useEffect } from 'react'

interface RadarChartProps {
  scores: { label: string; value: number; max?: number }[]
  size?: number
  color?: string
  label?: string
}

export const RadarChart: React.FC<RadarChartProps> = ({
  scores,
  size = 180,
  color = '#E8450A',
  label,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const n = scores.length
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.36
  const labelRadius = size * 0.48

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // HiDPI
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, size, size)

    const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

    // ── Grid rings ──────────────────────────────────────────────────────────
    const rings = 5
    for (let r = 1; r <= rings; r++) {
      const rr = (radius * r) / rings
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = cx + rr * Math.cos(angle(i))
        const y = cy + rr * Math.sin(angle(i))
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = 'rgba(156,163,175,0.25)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── Spokes ──────────────────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i)))
      ctx.strokeStyle = 'rgba(156,163,175,0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── Data polygon ────────────────────────────────────────────────────────
    ctx.beginPath()
    scores.forEach((s, i) => {
      const max = s.max ?? 10
      const ratio = Math.min(s.value / max, 1)
      const x = cx + radius * ratio * Math.cos(angle(i))
      const y = cy + radius * ratio * Math.sin(angle(i))
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.closePath()

    // Fill
    ctx.fillStyle = color
      .replace(')', ', 0.18)')
      .replace('rgb(', 'rgba(')
      .replace('#', '')
    // Simpler: just use a fixed rgba derived from primary
    ctx.fillStyle = 'rgba(232,69,10,0.15)'
    ctx.fill()

    // Stroke
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()

    // ── Data points ─────────────────────────────────────────────────────────
    scores.forEach((s, i) => {
      const max = s.max ?? 10
      const ratio = Math.min(s.value / max, 1)
      const x = cx + radius * ratio * Math.cos(angle(i))
      const y = cy + radius * ratio * Math.sin(angle(i))
      ctx.beginPath()
      ctx.arc(x, y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    // ── Labels ───────────────────────────────────────────────────────────────
    ctx.font = `bold ${size * 0.065}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    scores.forEach((s, i) => {
      const x = cx + labelRadius * Math.cos(angle(i))
      const y = cy + labelRadius * Math.sin(angle(i))

      // Label text
      ctx.fillStyle = '#6b7280'
      ctx.fillText(s.label, x, y - 6)

      // Score value
      ctx.fillStyle = color
      ctx.font = `bold ${size * 0.075}px Inter, sans-serif`
      ctx.fillText(s.value.toFixed(1), x, y + 7)
      ctx.font = `bold ${size * 0.065}px Inter, sans-serif`
    })
  }, [scores, size, color, n, cx, cy, radius, labelRadius])

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} />
      {label && <p className="text-xs font-semibold text-gray-500 text-center mt-1">{label}</p>}
    </div>
  )
}
