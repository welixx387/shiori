import { motion } from 'framer-motion'
import { ArrowRight, Bookmark, Flame, Library, Sparkles, Trophy, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { GENRES } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { chapterLabel, compactNumber, formatRating, isFresh, timeAgo } from '../../lib/format'
import { useAllProgress, useLatestChapters, useNovelMap, useUserData } from '../../lib/queries'
import { useSpotlight } from '../../hooks/useSpotlight'
import type { Novel } from '../../types'
import { Embers } from '../effects/Embers'
import { CountUp, Magnetic, Marquee, Reveal } from '../effects/Motion'
import { Cover } from '../novel/Cover'
import { ButtonLink } from '../ui/Button'
import { ProgressBar, Skeleton } from '../ui/Feedback'
import { Container, SectionHeader } from '../ui/Section'

const EASE = [0.22, 1, 0.36, 1] as const

export function TickerBand() {
  const words = ['Читай', '読む', 'Мечтай', '夢', 'Погружайся', '物語', 'Не спи', '夜']
  return (
    // Повёрнутая лента шире экрана — края обрезаем, чтобы страница не прокручивалась вбок.
    <div className="overflow-x-clip">
      <section className="relative -rotate-[1.5deg] py-6">
        <Marquee duration={36}>
          {words.map((w, i) => (
            <span key={i} className="flex items-center">
              <span
                className={cn(
                  'px-6 font-display text-5xl font-black uppercase leading-none tracking-tight sm:text-7xl',
                  i % 2 ? 'font-jp text-ember' : 'text-outline'
                )}
              >
                {w}
              </span>
              <Sparkles className="h-6 w-6 text-accent-2 sm:h-8 sm:w-8" />
            </span>
          ))}
        </Marquee>
        <Marquee duration={50} reverse className="mt-5">
          {GENRES.map((g) => {
            const Icon = g.icon
            return (
              <Link
                key={g.name}
                to={`/catalog?genres=${encodeURIComponent(g.name)}`}
                className="mx-1.5 inline-flex items-center gap-2 rounded-full border border-line/10 bg-surface/50 px-4 py-2 text-sm text-fg-2 transition-colors hover:border-accent/40 hover:text-fg"
              >
                <Icon className="h-4 w-4" style={{ color: `hsl(${g.hue} 80% 62%)` }} />
                {g.name}
              </Link>
            )
          })}
        </Marquee>
      </section>
    </div>
  )
}

export function ContinueReading() {
  const { data, isGuest } = useUserData()
  const progress = useAllProgress()
  const novels = useNovelMap()
  const items = useMemo(
    () =>
      [...progress]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({ p, novel: novels.get(p.novelId) }))
        .filter((x): x is { p: typeof x.p; novel: Novel } => Boolean(x.novel))
        .slice(0, 8),
    [progress, novels]
  )
  if (!items.length) return null
  const readCount = (novelId: string) => data.reads.filter((r) => r.novelId === novelId).length

  return (
    <Container className="mt-10">
      <SectionHeader kanji="続" kicker="Продолжить чтение" title="С того места, где вы остановились" link={{ to: '/profile/library', label: 'Вся полка' }} />
      <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {items.map(({ p, novel }, i) => {
          const done = novel.chaptersCount ? Math.min(1, readCount(novel.id) / novel.chaptersCount) : 0
          return (
            <motion.div
              key={novel.id}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
              className="snap-start"
            >
              <Link
                to={`/read/${novel.slug}/${p.chapterId}`}
                className="group flex w-[300px] gap-4 rounded-3xl border border-line/[0.08] bg-surface/60 p-3 transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:bg-surface sm:w-[340px]"
              >
                <Cover novel={novel} className="w-20 shrink-0 shadow-cover" rounded="rounded-xl" showTitle={false} />
                <div className="flex min-w-0 flex-1 flex-col py-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-accent">{novel.title}</p>
                  <p className="mt-1 text-xs text-muted">{timeAgo(p.updatedAt)}</p>
                  <div className="mt-auto">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                      <span>{isGuest ? `Глава прочитана на ${Math.round(p.position * 100)}%` : `Прочитано ${Math.round(done * 100)}%`}</span>
                      <span className="font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">Читать →</span>
                    </div>
                    <ProgressBar value={isGuest ? p.position : done} />
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </Container>
  )
}

export function FreshChapters({ novels }: { novels: Novel[] }) {
  const { data: latest, isLoading } = useLatestChapters(14)
  const map = useMemo(() => new Map(novels.map((n) => [n.id, n])), [novels])
  const items = (latest ?? []).filter((c) => map.has(c.novelId)).slice(0, 8)
  const trending = useMemo(() => [...novels].sort((a, b) => b.views - a.views).slice(0, 5), [novels])

  return (
    <Container className="mt-24">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <SectionHeader kanji="新" kicker="Только что вышло" title="Свежие главы" link={{ to: '/catalog?sort=updated', label: 'Все обновления' }} />
          <div className="space-y-2">
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-2xl" />)}
            {items.map((c, i) => {
              const novel = map.get(c.novelId)!
              const fresh = isFresh(c.createdAt, 1)
              return (
                <Reveal key={c.id} delay={i * 0.04} y={14}>
                  <Link
                    to={`/read/${novel.slug}/${c.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-transparent p-2.5 transition-all duration-300 hover:border-line/[0.08] hover:bg-surface/70"
                  >
                    <Cover novel={novel} className="w-12 shrink-0" rounded="rounded-lg" showTitle={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold transition-colors group-hover:text-accent">{novel.title}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted">
                        <span className="text-fg-2">{chapterLabel(c)}</span>
                        {c.title && <> — {c.title}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {fresh && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                          new
                        </span>
                      )}
                      <span className="text-[11.5px] text-faint">{timeAgo(c.createdAt)}</span>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>

        <div className="min-w-0">
          <SectionHeader kanji="熱" kicker="Сейчас читают" title="В тренде" />
          <div className="space-y-3">
            {trending.map((n, i) => (
              <Reveal key={n.id} delay={i * 0.06} y={14}>
                <Link
                  to={`/novel/${n.slug}`}
                  className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-line/[0.08] bg-surface/50 p-3 pl-2 transition-all duration-300 hover:border-accent/30 hover:bg-surface/80"
                >
                  <span
                    className={cn(
                      'w-14 shrink-0 text-center font-display text-5xl font-black leading-none tabular',
                      i === 0 ? 'text-ember' : 'text-outline group-hover:[-webkit-text-stroke-color:rgb(var(--accent)/0.6)]'
                    )}
                  >
                    {i + 1}
                  </span>
                  <Cover novel={n} className="w-12 shrink-0" rounded="rounded-lg" showTitle={false} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{n.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <Flame className="h-3.5 w-3.5 text-accent" />
                      {compactNumber(n.views)}
                      <span className="text-faint">·</span>★ {formatRating(n)}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </Container>
  )
}

export function TopRated({ novels }: { novels: Novel[] }) {
  const top = useMemo(
    () =>
      [...novels]
        .filter((n) => n.ratingCount > 0)
        .sort((a, b) => b.ratingSum / b.ratingCount - a.ratingSum / a.ratingCount)
        .slice(0, 6),
    [novels]
  )
  if (!top.length) return null
  return (
    <Container className="mt-24">
      <SectionHeader kanji="頂" kicker="Лучшее по мнению читателей" title={<>Топ <span className="text-ember">по оценкам</span></>} link={{ to: '/catalog?sort=rating', label: 'Весь рейтинг' }} />
      <div className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible">
        {top.map((n, i) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.07, ease: EASE }}
            className="w-[168px] shrink-0 snap-start lg:w-auto"
          >
            <Link to={`/novel/${n.slug}`} className="group relative block pl-11">
              <span
                className={cn(
                  'absolute -left-2 bottom-12 z-10 font-display text-[6.5rem] font-black leading-none tracking-tighter transition-transform duration-500 group-hover:-translate-y-2',
                  i === 0 ? 'text-ember' : 'text-outline'
                )}
                style={i === 0 ? undefined : { WebkitTextStroke: '2px rgb(var(--fg) / 0.28)' }}
              >
                {i + 1}
              </span>
              <div className="transition-transform duration-500 group-hover:-translate-y-1.5 group-hover:rotate-1">
                <Cover novel={n} className="shadow-cover" showTitle={false} />
              </div>
              <p className="mt-3 line-clamp-1 text-sm font-semibold transition-colors group-hover:text-accent">{n.title}</p>
              <p className="text-xs text-muted">★ {formatRating(n)} · {compactNumber(n.ratingCount)} оценок</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </Container>
  )
}

function GenreTile({ name, count, index }: { name: string; count: number; index: number }) {
  const g = GENRES.find((x) => x.name === name)!
  const Icon = g.icon
  const onMove = useSpotlight<HTMLAnchorElement>()
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: (index % 8) * 0.04, ease: EASE }}
    >
      <Link
        to={`/catalog?genres=${encodeURIComponent(name)}`}
        onPointerMove={onMove}
        className="spotlight group relative flex h-28 flex-col justify-between overflow-hidden rounded-3xl border border-line/[0.08] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-line/20"
        style={{
          background: `linear-gradient(135deg, hsl(${g.hue} 70% 55% / 0.16), hsl(${g.hue + 40} 70% 50% / 0.04) 70%)`,
        }}
      >
        <Icon
          className="h-7 w-7 transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-125"
          style={{ color: `hsl(${g.hue} 85% 64%)` }}
        />
        <Icon
          className="absolute -bottom-4 -right-3 h-24 w-24 opacity-[0.07] transition-all duration-700 group-hover:rotate-12 group-hover:opacity-[0.14]"
          style={{ color: `hsl(${g.hue} 85% 64%)` }}
        />
        <div>
          <p className="font-semibold leading-tight">{name}</p>
          <p className="text-xs text-muted">{count ? `${count} тайтл${count === 1 ? '' : count < 5 ? 'а' : 'ов'}` : 'скоро'}</p>
        </div>
      </Link>
    </motion.div>
  )
}

export function GenreGrid({ novels }: { novels: Novel[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of novels) for (const g of n.genres) m.set(g, (m.get(g) ?? 0) + 1)
    return m
  }, [novels])
  const genres = [...GENRES].sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0)).slice(0, 12)
  return (
    <Container className="mt-24">
      <SectionHeader kanji="類" kicker="Найдите своё" title="Жанры на любое настроение" link={{ to: '/catalog', label: 'Расширенный поиск' }} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {genres.map((g, i) => (
          <GenreTile key={g.name} name={g.name} count={counts.get(g.name) ?? 0} index={i} />
        ))}
      </div>
    </Container>
  )
}

export function StatsBand({ novels }: { novels: Novel[] }) {
  const chapters = novels.reduce((s, n) => s + n.chaptersCount, 0)
  const views = novels.reduce((s, n) => s + n.views, 0)
  const readers = novels.reduce((s, n) => s + n.libraryCount, 0)
  const stats = [
    { value: novels.length, label: 'тайтлов в каталоге', icon: Library },
    { value: chapters, label: 'глав уже можно читать', icon: Bookmark },
    { value: views, label: 'просмотров', icon: Zap },
    { value: readers, label: 'добавлений в библиотеки', icon: Trophy },
  ]
  return (
    <Container className="mt-24">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[32px] border border-line/[0.08] bg-line/[0.08] lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-bg/80 p-6 backdrop-blur sm:p-8">
              <Icon className="h-5 w-5 text-accent" />
              <p className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                <CountUp value={s.value} />
              </p>
              <p className="mt-1 text-sm text-muted">{s.label}</p>
            </div>
          )
        })}
      </div>
    </Container>
  )
}

export function JoinCta({ novels }: { novels: Novel[] }) {
  const picks = novels.slice(0, 3)
  return (
    <Container className="mt-24">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-[36px] border border-line/10 px-6 py-14 sm:px-12 lg:py-20">
          <div className="bg-ember-animated absolute inset-0 -z-20 opacity-90" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(80%_120%_at_100%_0%,transparent,rgba(9,9,15,0.55))]" />
          <Embers className="-z-10" density={0.6} />
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80">Бесплатно и без рекламы</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
                Соберите свою полку историй
              </h2>
              <ul className="mt-6 grid grid-cols-1 gap-2.5 text-[15px] text-white/90 sm:grid-cols-2">
                {['Прогресс на всех устройствах', 'Полки: читаю, в планах, прочитано', 'Закладки и цитаты', 'Статистика и достижения'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Magnetic>
                  <ButtonLink to="/register" size="lg" variant="light" iconRight={<ArrowRight className="h-4 w-4" />}>
                    Создать аккаунт
                  </ButtonLink>
                </Magnetic>
                <ButtonLink to="/login" size="lg" variant="ghost" className="text-white hover:bg-white/15 hover:text-white">
                  У меня уже есть
                </ButtonLink>
              </div>
            </div>
            <div className="relative mx-auto hidden h-72 w-72 lg:block">
              {picks.map((n, i) => (
                <div
                  key={n.id}
                  className="absolute top-0 w-40 animate-float"
                  style={{
                    left: `${i * 56}px`,
                    top: `${i % 2 ? 40 : 0}px`,
                    ['--r' as string]: `${(i - 1) * 9}deg`,
                    animationDelay: `${i * 0.8}s`,
                    zIndex: i === 1 ? 2 : 1,
                  }}
                >
                  <Cover novel={n} className="shadow-cover" rounded="rounded-2xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </Container>
  )
}
