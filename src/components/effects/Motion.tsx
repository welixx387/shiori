import { animate, motion, useInView, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'

const EASE = [0.22, 1, 0.36, 1] as const

/** Плавное появление блока при прокрутке. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Слова заголовка «выезжают» снизу по очереди. */
export function RevealWords({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.06,
}: {
  text: string
  className?: string
  wordClassName?: string
  delay?: number
  stagger?: number
}) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden pb-[0.12em] align-bottom" aria-hidden>
          <motion.span
            className={cn('inline-block', wordClassName)}
            initial={{ y: '110%', rotate: 4 }}
            animate={{ y: '0%', rotate: 0 }}
            transition={{ duration: 0.8, delay: delay + i * stagger, ease: EASE }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

/** Число, которое «набегает» при появлении на экране. */
export function CountUp({ value, className, format = formatNumber }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration: Math.min(2, 0.8 + Math.log10(value + 1) * 0.3),
      ease: EASE,
      onUpdate: (v) => setShown(v),
    })
    return () => controls.stop()
  }, [inView, value])
  return (
    <span ref={ref} className={className}>
      {format(Math.round(shown))}
    </span>
  )
}

/** Кнопка слегка тянется за курсором. */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 })
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 })
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - rect.left - rect.width / 2) * strength)
    y.set((e.clientY - rect.top - rect.height / 2) * strength)
  }
  const reset = () => {
    x.set(0)
    y.set(0)
  }
  return (
    <motion.div onPointerMove={onMove} onPointerLeave={reset} style={{ x, y }} className={cn('inline-block', className)}>
      {children}
    </motion.div>
  )
}

/** Бегущая строка: содержимое дублируется для бесшовной прокрутки. */
export function Marquee({
  children,
  reverse,
  duration = 40,
  className,
}: {
  children: ReactNode
  reverse?: boolean
  duration?: number
  className?: string
}) {
  return (
    <div className={cn('mask-fade-x group flex overflow-hidden', className)}>
      <div
        className={cn(
          'flex w-max shrink-0 items-center group-hover:[animation-play-state:paused]',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        )}
        style={{ ['--marquee-duration' as string]: `${duration}s` }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}
