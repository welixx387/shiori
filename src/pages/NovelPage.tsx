import { motion } from 'framer-motion'
import { BookOpen, ChevronRight, Eye, Heart, PenLine, Play, Star } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Embers } from '../components/effects/Embers'
import { Magnetic, Reveal, RevealWords } from '../components/effects/Motion'
import { Tilt } from '../components/effects/Tilt'
import { NotFound } from '../components/layout/Layout'
import { FavoriteButton, RatingPicker, ShareButton, ShelfButton } from '../components/novel/Actions'
import { GenreTag, StatusPill } from '../components/novel/Bits'
import { ChapterList } from '../components/novel/ChapterList'
import { Cover } from '../components/novel/Cover'
import { NovelCard } from '../components/novel/NovelCard'
import { ButtonLink } from '../components/ui/Button'
import { Comments } from '../components/social/Comments'
import { Tabs } from '../components/ui/Controls'
import { EmptyState, PageLoader, ProgressRing } from '../components/ui/Feedback'
import { Container } from '../components/ui/Section'
import { useTitle } from '../hooks/useTitle'
import { api } from '../lib/api'
import { COVER_PALETTES, STATUSES } from '../lib/constants'
import { chapterLabel, compactNumber, formatDate, formatDuration, formatRating, plural, readingMinutes, timeAgo } from '../lib/format'
import { useChapters, useNovel, useNovels, useProgressFor, useReadSet } from '../lib/queries'
import { useIsAdmin } from '../store/auth'
import type { ChapterMeta, Novel } from '../types'

function useRecordView(novel: Novel | null | undefined) {
  useEffect(() => {
    if (!novel) return
    const key = `shiori-viewed:${novel.id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* без sessionStorage просто считаем каждый заход */
    }
    api.recordView(novel.id).catch(() => undefined)
  }, [novel])
}

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-line/[0.06] text-accent">{icon}</span>
      <div>
        <p className="font-display text-lg font-bold leading-none tracking-tight tabular">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}

function ReadCta({ novel, chapters }: { novel: Novel; chapters: ChapterMeta[] }) {
  const progress = useProgressFor(novel.id)
  const published = chapters.filter((c) => c.published)
  const current = progress ? published.find((c) => c.id === progress.chapterId) : null
  const first = published[0]
  if (!first) {
    return (
      <span className="inline-flex h-[3.25rem] items-center rounded-full border border-line/10 px-6 text-sm text-muted">
        Главы скоро появятся
      </span>
    )
  }
  const target = current ?? first
  return (
    <Magnetic>
      <ButtonLink
        to={`/read/${novel.slug}/${target.id}`}
        variant="primary"
        size="lg"
        icon={<Play className="h-4 w-4 fill-white" />}
      >
        {current ? `Продолжить · гл. ${String(current.number).replace('.', ',')}` : 'Начать читать'}
      </ButtonLink>
    </Magnetic>
  )
}

function SimilarNovels({ novel }: { novel: Novel }) {
  const { data: all = [] } = useNovels()
  const similar = useMemo(() => {
    return all
      .filter((n) => n.id !== novel.id)
      .map((n) => ({
        n,
        score:
          n.genres.filter((g) => novel.genres.includes(g)).length * 2 +
          n.tags.filter((t) => novel.tags.includes(t)).length +
          (n.country === novel.country ? 0.5 : 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.n.views - a.n.views)
      .slice(0, 5)
      .map((x) => x.n)
  }, [all, novel])
  if (!similar.length) return null
  return (
    <section className="mt-20">
      <p className="kicker">
        <span className="font-jp text-sm normal-case tracking-normal text-accent">似</span>
        Если понравилось
      </p>
      <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Похожие истории</h2>
      <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {similar.map((n) => (
          <NovelCard key={n.id} novel={n} />
        ))}
      </div>
    </section>
  )
}

export default function NovelPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab = rawTab === 'chapters' || rawTab === 'discussion' ? rawTab : 'about'
  const isAdmin = useIsAdmin()
  const { data: novel, isLoading } = useNovel(slug)
  const { data: chapters = [] } = useChapters(novel?.id, { drafts: isAdmin })
  const readSet = useReadSet(novel?.id)
  const progress = useProgressFor(novel?.id)
  const [expanded, setExpanded] = useState(false)
  useTitle(novel?.title)
  useRecordView(novel)

  if (isLoading) return <PageLoader />
  if (!novel) return <NotFound />

  const [dark, mid, light] = COVER_PALETTES[novel.coverStyle.palette % COVER_PALETTES.length].colors
  const published = chapters.filter((c) => c.published)
  const readCount = published.filter((c) => readSet.has(c.id)).length
  const totalWords = published.reduce((s, c) => s + c.wordCount, 0)
  const lastRead = progress ? published.find((c) => c.id === progress.chapterId) : null
  const paragraphs = novel.description.split(/\n+/).filter(Boolean)

  return (
    <div>
      {/* Шапка тайтла */}
      <section className="relative isolate overflow-hidden pb-12 pt-28 sm:pt-32">
        <div
          className="absolute inset-0 -z-20"
          style={{
            background: `radial-gradient(70% 80% at 20% 30%, ${mid}66, transparent 70%), radial-gradient(50% 60% at 90% 10%, ${light}26, transparent 70%), linear-gradient(180deg, ${dark}88, transparent)`,
          }}
        />
        <Embers className="-z-10 opacity-60" density={0.6} />
        <span
          aria-hidden
          className="text-outline pointer-events-none absolute -right-[2vw] -top-[4vw] -z-10 select-none font-brush text-[42vw] leading-none sm:text-[30vw]"
          style={{ WebkitTextStroke: `1.5px ${light}38` }}
        >
          {novel.coverStyle.kanji}
        </span>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-b from-transparent to-bg" />

        <Container>
          <nav className="mb-8 flex items-center gap-1.5 text-[13px] text-muted">
            <Link to="/catalog" className="hover:text-fg">
              Каталог
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="truncate text-fg-2">{novel.title}</span>
          </nav>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
            <motion.div
              initial={{ opacity: 0, y: 30, rotate: -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-56 sm:w-64 md:mx-0 md:w-full"
            >
              <Tilt className="rounded-[22px]">
                <div className="absolute -inset-5 -z-10 rounded-[40px] opacity-60 blur-3xl" style={{ background: mid }} />
                <Cover novel={novel} rounded="rounded-[22px]" className="shadow-cover" showAuthor priority />
              </Tilt>
            </motion.div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={novel.status} />
                <span className="rounded-full border border-line/10 bg-surface/60 px-2.5 py-1 text-[11px] font-semibold text-fg-2">
                  {novel.ageRating}
                </span>
                {!novel.published && (
                  <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-warn">Черновик — виден только админам</span>
                )}
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl">
                <RevealWords text={novel.title} stagger={0.04} />
              </h1>
              {novel.altTitles.length > 0 && <p className="mt-3 text-sm text-muted">{novel.altTitles.join(' · ')}</p>}
              <p className="mt-3 text-sm text-fg-2">
                {novel.author && (
                  <>
                    Автор: <Link to={`/catalog?q=${encodeURIComponent(novel.author)}`} className="font-semibold text-fg hover:text-accent">{novel.author}</Link>
                  </>
                )}
                {novel.illustrator && <span className="text-muted"> · Иллюстрации: {novel.illustrator}</span>}
              </p>

              <div className="mt-7 grid grid-cols-2 gap-5 sm:flex sm:flex-wrap sm:gap-8">
                <Stat
                  icon={<Star className="h-[18px] w-[18px] fill-accent-2 text-accent-2" />}
                  value={formatRating(novel)}
                  label={novel.ratingCount ? `${compactNumber(novel.ratingCount)} ${plural(novel.ratingCount, ['оценка', 'оценки', 'оценок'])}` : 'нет оценок'}
                />
                <Stat icon={<BookOpen className="h-[18px] w-[18px]" />} value={published.length} label={plural(published.length, ['глава', 'главы', 'глав'])} />
                <Stat icon={<Eye className="h-[18px] w-[18px]" />} value={compactNumber(novel.views)} label="просмотров" />
                <Stat icon={<Heart className="h-[18px] w-[18px]" />} value={compactNumber(novel.libraryCount)} label="в библиотеках" />
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {novel.genres.map((g) => (
                  <GenreTag key={g} name={g} />
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ReadCta novel={novel} chapters={chapters} />
                <ShelfButton novel={novel} />
                <FavoriteButton novel={novel} />
                <ShareButton novel={novel} />
                {isAdmin && (
                  <ButtonLink to={`/admin/novels/${novel.id}`} variant="ghost" size="lg" icon={<PenLine className="h-4 w-4" />}>
                    Редактировать
                  </ButtonLink>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <Tabs
              value={tab}
              onChange={(v) => setParams(v === 'about' ? {} : { tab: v }, { replace: true })}
              tabs={[
                { value: 'about', label: 'О тайтле' },
                { value: 'chapters', label: 'Главы', count: published.length },
                { value: 'discussion', label: 'Обсуждение' },
              ]}
            />
            <div className="mt-6">
              {tab === 'discussion' ? (
                <Comments novelId={novel.id} />
              ) : tab === 'about' ? (
                <Reveal>
                  <div className="relative">
                    <div className={expanded || paragraphs.join('').length < 600 ? '' : 'mask-fade-b max-h-60 overflow-hidden'}>
                      {paragraphs.map((p, i) => (
                        <p key={i} className="mb-4 font-serif text-[17px] leading-[1.75] text-fg-2">
                          {p}
                        </p>
                      ))}
                    </div>
                    {!expanded && paragraphs.join('').length >= 600 && (
                      <button onClick={() => setExpanded(true)} className="text-sm font-semibold text-accent hover:underline">
                        Читать описание полностью
                      </button>
                    )}
                  </div>
                  {novel.tags.length > 0 && (
                    <div className="mt-8">
                      <p className="kicker mb-3">Теги</p>
                      <div className="flex flex-wrap gap-2">
                        {novel.tags.map((t) => (
                          <Link
                            key={t}
                            to={`/catalog?q=${encodeURIComponent(t)}`}
                            className="rounded-full bg-line/[0.05] px-3 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-accent/10 hover:text-accent"
                          >
                            #{t}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {published.length > 0 && (
                    <div className="mt-10 rounded-[28px] border border-line/[0.08] bg-surface/50 p-5 sm:p-6">
                      <div className="flex items-center justify-between">
                        <p className="font-display text-base font-semibold">Первые главы</p>
                        <button onClick={() => setParams({ tab: 'chapters' })} className="text-sm font-medium text-accent hover:underline">
                          Все главы →
                        </button>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {published.slice(0, 4).map((c) => (
                          <Link
                            key={c.id}
                            to={`/read/${novel.slug}/${c.id}`}
                            className="group rounded-2xl border border-line/[0.06] bg-bg/40 p-4 transition-colors hover:border-accent/30"
                          >
                            <p className="text-xs text-muted">{chapterLabel(c)}</p>
                            <p className="mt-1 truncate font-semibold transition-colors group-hover:text-accent">{c.title || 'Без названия'}</p>
                            <p className="mt-1 text-xs text-faint">{readingMinutes(c.wordCount)} мин чтения</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </Reveal>
              ) : chapters.length ? (
                <ChapterList novel={novel} chapters={chapters} readSet={readSet} currentId={progress?.chapterId} />
              ) : (
                <EmptyState kanji="待" title="Главы пока не опубликованы" description="Добавьте тайтл в «В планах» — и вы не пропустите начало." />
              )}
            </div>
          </div>

          <aside className="space-y-4">
            {published.length > 0 && (
              <div className="rounded-[28px] border border-line/[0.08] bg-surface/60 p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing value={published.length ? readCount / published.length : 0} size={64} stroke={5}>
                    <span className="font-display text-sm font-bold">{published.length ? Math.round((readCount / published.length) * 100) : 0}%</span>
                  </ProgressRing>
                  <div className="min-w-0">
                    <p className="font-semibold">Ваш прогресс</p>
                    <p className="text-sm text-muted">
                      {readCount} из {published.length} {plural(published.length, ['главы', 'глав', 'глав'])}
                    </p>
                    {lastRead && progress && (
                      <p className="mt-0.5 truncate text-xs text-faint">
                        Остановились на гл. {String(lastRead.number).replace('.', ',')} · {timeAgo(progress.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-[28px] border border-line/[0.08] bg-surface/60 p-5">
              <RatingPicker novel={novel} />
            </div>
            <div className="rounded-[28px] border border-line/[0.08] bg-surface/60 p-5">
              <p className="font-display text-sm font-semibold">Информация</p>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Статус', STATUSES[novel.status].label],
                  ['Страна', novel.country || '—'],
                  ['Год', novel.year ?? '—'],
                  ['Возраст', novel.ageRating],
                  ['Объём', totalWords ? `≈ ${compactNumber(totalWords)} слов · ${formatDuration(readingMinutes(totalWords))}` : '—'],
                  ['Обновлён', novel.lastChapterAt ? timeAgo(novel.lastChapterAt) : formatDate(novel.updatedAt)],
                  ['В каталоге с', formatDate(novel.createdAt)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>

        <SimilarNovels novel={novel} />
      </Container>
    </div>
  )
}
