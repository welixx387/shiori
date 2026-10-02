import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion'
import type { PointerEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface TiltProps {
  children: ReactNode
  className?: string
  max?: number
  glare?: boolean
  scale?: number
}

/** 3D-наклон за курсором с голографическим бликом — для обложек. */
export function Tilt({ children, className, max = 12, glare = true, scale = 1.02 }: TiltProps) {
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const spring = { stiffness: 220, damping: 18, mass: 0.6 }
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), spring)
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), spring)
  const s = useSpring(1, spring)
  const gx = useTransform(px, (v) => `${v * 100}%`)
  const gy = useTransform(py, (v) => `${v * 100}%`)
  const hx = useTransform(px, (v) => `${20 + v * 60}%`)
  const hy = useTransform(py, (v) => `${20 + v * 60}%`)
  const glareOpacity = useSpring(0, spring)
  const transform = useMotionTemplate`perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width)
    py.set((e.clientY - rect.top) / rect.height)
    s.set(scale)
    glareOpacity.set(1)
  }
  const onLeave = () => {
    px.set(0.5)
    py.set(0.5)
    s.set(1)
    glareOpacity.set(0)
  }

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ transform, transformStyle: 'preserve-3d' }}
      className={cn('relative will-change-transform', className)}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="holo pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            opacity: glareOpacity,
            ['--gx' as string]: gx,
            ['--gy' as string]: gy,
            ['--hx' as string]: hx,
            ['--hy' as string]: hy,
          }}
        />
      )}
    </motion.div>
  )
}
