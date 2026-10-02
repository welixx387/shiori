import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'
import { usePrefs } from '../../store/prefs'

interface Particle {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  phase: number
  speed: number
  color: string
}

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v.split(/\s+/).join(',')}` : fallback
}

/**
 * Тлеющие угольки / светлячки, которые поднимаются вверх и разлетаются от курсора.
 * Рисуются на canvas и засыпают, когда блок не виден.
 */
export function Embers({ className, density = 1 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = usePrefs((s) => s.reduceMotion)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const still = reduce || media.matches

    let width = 0
    let height = 0
    let raf = 0
    let visible = true
    let particles: Particle[] = []
    const pointer = { x: -9999, y: -9999 }
    const dark = document.documentElement.getAttribute('data-theme') !== 'light'
    const palette = [cssColor('--accent', 'rgb(255,94,82'), cssColor('--accent-2', 'rgb(255,184,77'), cssColor('--accent-3', 'rgb(146,128,255')]

    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      r: 0.6 + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.15 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
      speed: 0.01 + Math.random() * 0.03,
      color: palette[Math.floor(Math.random() * palette.length)],
    })

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(80, Math.max(18, (width * height) / 16000)) * density)
      particles = Array.from({ length: count }, () => spawn(true))
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      for (const p of particles) {
        if (!still) {
          const dx = p.x - pointer.x
          const dy = p.y - pointer.y
          const d2 = dx * dx + dy * dy
          if (d2 < 14000) {
            const f = (1 - d2 / 14000) * 0.9
            const d = Math.sqrt(d2) || 1
            p.x += (dx / d) * f
            p.y += (dy / d) * f
          }
          p.x += p.vx + Math.sin(t * 0.0006 + p.phase) * 0.25
          p.y += p.vy
          if (p.y < -12 || p.x < -20 || p.x > width + 20) Object.assign(p, spawn(false))
        }
        const twinkle = 0.55 + 0.45 * Math.sin(t * p.speed * 0.1 + p.phase)
        const fade = Math.min(1, p.y / (height * 0.25))
        const alpha = Math.max(0, twinkle * fade)
        ctx.fillStyle = `${p.color},${0.12 * alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `${p.color},${0.85 * alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = (t: number) => {
      draw(t)
      if (visible && !still) raf = requestAnimationFrame(loop)
    }

    resize()
    draw(0)
    if (!still) raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
    ro.observe(canvas)

    const io = new IntersectionObserver(([entry]) => {
      const was = visible
      visible = entry.isIntersecting && !document.hidden
      if (visible && !was && !still) raf = requestAnimationFrame(loop)
    })
    io.observe(canvas)

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }
    const host = canvas.parentElement
    host?.addEventListener('pointermove', onMove)
    host?.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      host?.removeEventListener('pointermove', onMove)
      host?.removeEventListener('pointerleave', onLeave)
    }
  }, [reduce, density])

  return <canvas ref={ref} className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} aria-hidden />
}
