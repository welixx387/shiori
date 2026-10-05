import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, BookOpen, Play, Star } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { COVER_PALETTES } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { compactNumber, formatRating, plural } from '../../lib/format'
import { useChapters, useProgressFor } from '../../lib/queries'
import type { Novel } from '../../types'
import { Embers } from '../effects/Embers'
import { Magnetic, RevealWords } from '../effects/Motion'
import { Tilt } from '../effects/Tilt'
import { FavoriteButton } from '../novel/Actions'
import { StatusPill } from '../novel/Bits'
import { Cover } from '../novel/Cover'
import { ButtonLink } from '../ui/Button'

const SLIDE_MS = 8000
const EASE = [0.22, 1, 0.36, 1] as const

function ReadButton({ novel }: { novel: Novel }) {
  const progress = useProgressFor(novel.id)
  const { data: chapters } = useChapters(novel.id)
  const first = chapters?.[0]
  const to = progress ? `/read/${novel.slug}/${progress.chapterId}` : first ? `/read/${novel.slug}/${first.id}` : `/novel/${novel.slug}`
  return (
    <Magnetic>
      <ButtonLink to={to} variant="primary" size="lg" icon={<Play className="h-4 w-4 fill-white" />}>
        {progress ? 'Продолжить' : first ? 'Читать' : 'Подробнее'}
      </ButtonLink>
    </Magnetic>
  )
}

export function Hero({ novels }: { novels: Novel[] }) {
  const slides = useMemo(() => {
    const featured = novels.filter((n) => n.featured)
    const rest = [...novels].filter((n) => !n.featured).sort((a, b) => b.views - a.views)
    return [...featured, ...rest].slice(0, 5)
  }, [novels])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const dragged = useRef(false)
  const current = slides[index % slides.length]
  if (!current) return null

  const [dark, mid, light] = COVER_PALETTES[current.coverStyle.palette % COVER_PALETTES.length].colors
  const stack = slides.map((_, i) => slides[(index + i) % slides.length])
  const next = () => setIndex((i) => (i + 1) % slides.length)
  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length)

  return (
    <section
      className="relative isolate overflow-hidden pb-14 pt-28 sm:pt-32 lg:min-h-[86vh] lg:pb-20"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* Цветовая атмосфера текущего слайда */}
      <AnimatePresence>
        <motion.div
          key={current.id}
          className="absolute inset-0 -z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          style={{
            background: `radial-gradient(60% 70% at 78% 40%, ${mid}55, transparent 70%), radial-gradient(40% 50% at 15% 85%, ${light}22, transparent 70%), radial-gradient(50% 60% at 60% 0%, ${dark}aa, transparent 80%)`,
          }}
        />
      </AnimatePresence>
      <Embers className="-z-10 opacity-80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-bg" />

      {/* Огромный вертикальный иероглиф */}
      <AnimatePresence mode="wait">
        <motion.span
          key={current.id}
          aria-hidden
          initial={{ opacity: 0, y: 60, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -40, filter: 'blur(12px)' }}
          transition={{ duration: 0.9, ease: EASE }}
          className="text-outline pointer-events-none absolute -right-[4vw] top-[8%] -z-10 select-none font-brush text-[46vw] leading-none sm:text-[34vw] lg:right-[2vw] lg:text-[30vw]"
          style={{ WebkitTextStroke: `1.5px ${light}40` }}
        >
          {current.coverStyle.kanji}
        </motion.span>
      </AnimatePresence>

      <div className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-6">
        {/* Текст */}
        <div className="order-2 lg:order-1">
          <div className="flex items-center gap-3">
            <span className="kicker">
              <span className="font-jp text-sm normal-case tracking-normal text-accent">推薦</span>
              Выбор редакции
            </span>
            <span className="h-px w-10 bg-line/20" />
            <span className="tabular text-[11px] font-semibold tracking-[0.2em] text-faint">
              {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={current.id} exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }} transition={{ duration: 0.35 }}>
              <h1 className="mt-5 font-display text-[2.15rem] font-bold leading-[1.04] tracking-tight text-balance sm:text-5xl lg:text-[3.7rem]">
                <RevealWords text={current.title} stagger={0.05} />
              </h1>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.25, ease: EASE }}
                className="mt-6 flex flex-wrap items-center gap-2.5 text-sm text-fg-2"
              >
                <StatusPill status={current.status} />
                {current.ratingCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-accent-2 text-accent-2" />
                    {formatRating(current)}
                    <span className="font-normal text-muted">({compactNumber(current.ratingCount)})</span>
                  </span>
                )}
                <span className="text-faint">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-muted" />
                  {current.chaptersCount} {plural(current.chaptersCount, ['глава', 'главы', 'глав'])}
                </span>
                <span className="text-faint">•</span>
                <span className="text-muted">{current.genres.slice(0, 3).join(', ')}</span>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.35, ease: EASE }}
                className="mt-5 line-clamp-3 max-w-xl text-[15px] leading-relaxed text-fg-2 sm:text-base"
              >
                {current.description.split('\n')[0]}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: EASE }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <ReadButton novel={current} />
                <ButtonLink
                  to={`/novel/${current.slug}`}
                  variant="glass"
                  size="lg"
                  iconRight={<ArrowRight className="h-4 w-4" />}
                >
                  О тайтле
                </ButtonLink>
                <FavoriteButton novel={current} />
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* Индикаторы слайдов */}
          <div className="mt-12 flex max-w-md gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                className="group relative h-8 flex-1"
                aria-label={`Слайд ${i + 1}: ${s.title}`}
              >
                <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-line/15 transition-colors group-hover:bg-line/25">
                  {i < index && <span className="absolute inset-0 bg-fg/50" />}
                  {i === index && (
                    <span
                      key={`${s.id}-${index}`}
                      className="absolute inset-0 origin-left bg-ember"
                      style={{
                        animation: `hero-progress ${SLIDE_MS}ms linear forwards`,
                        animationPlayState: paused ? 'paused' : 'running',
                      }}
                      onAnimationEnd={next}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Веер обложек */}
        <div className="order-1 flex justify-center lg:order-2 lg:justify-end lg:pr-10">
          <motion.div
            className="relative h-[330px] w-[220px] sm:h-[420px] sm:w-[280px] lg:h-[480px] lg:w-[320px]"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragStart={() => {
              dragged.current = true
            }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) next()
              else if (info.offset.x > 60) prev()
              setTimeout(() => (dragged.current = false), 60)
            }}
          >
            {stack
              .slice(0, 4)
              .reverse()
              .map((n) => {
                const pos = stack.indexOf(n)
                return (
                  <motion.div
                    key={n.id}
                    className={cn('absolute inset-0', pos === 0 ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
                    initial={false}
                    animate={{
                      x: pos * 44,
                      y: pos * 10,
                      rotate: pos * 6,
                      scale: 1 - pos * 0.07,
                      opacity: pos > 2 ? 0 : 1,
                      filter: pos === 0 ? 'brightness(1) saturate(1)' : `brightness(${0.75 - pos * 0.12}) saturate(0.8)`,
                    }}
                    transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                    style={{ zIndex: 10 - pos }}
                    onClick={() => pos > 0 && setIndex(slides.indexOf(n))}
                  >
                    {pos === 0 ? (
                      <Link
                        to={`/novel/${n.slug}`}
                        draggable={false}
                        onClick={(e) => dragged.current && e.preventDefault()}
                      >
                        <Tilt className="rounded-[22px]" max={10}>
                          <div className="absolute -inset-6 -z-10 rounded-[40px] opacity-70 blur-3xl" style={{ background: mid }} />
                          <Cover novel={n} rounded="rounded-[22px]" className="shadow-cover" showAuthor priority />
                        </Tilt>
                      </Link>
                    ) : (
                      <Cover novel={n} rounded="rounded-[22px]" className="shadow-cover" showAuthor />
                    )}
                  </motion.div>
                )
              })}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
