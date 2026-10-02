import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Headphones,
  List,
  Maximize2,
  Minimize2,
  Pause,
  PenLine,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Type,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChapterContent } from '../components/reader/ChapterContent'
import { SettingsPanel } from '../components/reader/SettingsPanel'
import { useTts } from '../components/reader/useTts'
import { ChapterList } from '../components/novel/ChapterList'
import { Cover } from '../components/novel/Cover'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState, PageLoader, ProgressBar } from '../components/ui/Feedback'
import { Modal, Sheet } from '../components/ui/Overlay'
import { useTitle } from '../hooks/useTitle'
import { api } from '../lib/api'
import { safeSession } from '../lib/kv'
import { cn } from '../lib/cn'
import { chapterLabel, formatNumber, plural, readingMinutes } from '../lib/format'
import { qk, useBookmarks, useChapter, useChapters, useMarkRead, useNovel, useProgressFor, useReadSet, useSaveProgress } from '../lib/queries'
import { parseContent, plainText } from '../lib/text'
import { useIsAdmin, useUser } from '../store/auth'
import { usePositions } from '../store/guest'
import { READER_FONTS, READER_THEMES, ensureReaderFont, useReaderSettings } from '../store/reader'
import { toast } from '../store/toast'
import type { Chapter, ChapterMeta, Novel } from '../types'

const PAGE_GAP = 56
const TTS_CONTINUE = 'shiori-tts-continue'

function RIcon({ label, onClick, active, children, className }: { label: string; onClick?: () => void; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
        active ? 'bg-reader-accent/15 text-reader-accent' : 'text-reader-fg/70 hover:bg-reader-line/10 hover:text-reader-fg',
        className
      )}
    >
      {children}
    </button>
  )
}

function ChapterHeader({ novel, chapter }: { novel: Novel; chapter: Chapter }) {
  const minutes = readingMinutes(chapter.wordCount)
  return (
    <header className="mb-[2.2em] text-center" style={{ breakInside: 'avoid' }}>
      <p className="text-[0.62em] font-semibold uppercase tracking-[0.28em] text-reader-muted">{novel.title}</p>
      <p className="mt-[0.9em] font-jp text-[1.8em] leading-none text-reader-accent">{novel.coverStyle.kanji}</p>
      <p className="mt-[0.9em] text-[0.72em] font-medium text-reader-muted">{chapterLabel(chapter)}</p>
      {chapter.title && (
        <h1 className="mx-auto mt-[0.35em] max-w-[18em] font-display text-[1.45em] font-bold leading-[1.18] tracking-tight text-balance">
          {chapter.title}
        </h1>
      )}
      <p className="mt-[0.9em] text-[0.66em] text-reader-muted">
        {minutes} мин чтения · {formatNumber(chapter.wordCount)} {plural(chapter.wordCount, ['слово', 'слова', 'слов'])}
      </p>
      <div className="mx-auto mt-[1.4em] h-px w-24 bg-gradient-to-r from-transparent via-reader-accent/60 to-transparent" />
    </header>
  )
}

function ChapterEnd({ novel, next, endRef }: { novel: Novel; next: ChapterMeta | null; endRef: React.RefObject<HTMLDivElement> }) {
  return (
    <footer className="mt-14 text-center text-base leading-normal" style={{ fontSize: 16, breakInside: 'avoid' }}>
      <div ref={endRef} className="r-break" aria-hidden>
        ✦
      </div>
      <p className="-mt-2 text-xs uppercase tracking-[0.3em] text-reader-muted">конец главы</p>
      {next ? (
        <Link
          to={`/read/${novel.slug}/${next.id}`}
          className="group mx-auto mt-8 block max-w-md rounded-[28px] border border-reader-line/10 bg-reader-surface p-6 text-left transition-colors hover:border-reader-accent/40"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-reader-muted">Следующая глава</p>
          <p className="mt-2 font-display text-lg font-semibold leading-snug">{next.title || chapterLabel(next)}</p>
          <p className="mt-1 text-sm text-reader-muted">
            {chapterLabel(next)} · {readingMinutes(next.wordCount)} мин
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform group-hover:translate-x-1">
            Читать дальше <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ) : (
        <div className="mx-auto mt-8 max-w-md rounded-[28px] border border-reader-line/10 bg-reader-surface p-6">
          <p className="font-display text-lg font-semibold">Вы догнали автора!</p>
          <p className="mt-2 text-sm text-reader-muted">
            Это последняя опубликованная глава. Добавьте тайтл в библиотеку и оцените его — так вы не пропустите продолжение.
          </p>
          <Link
            to={`/novel/${novel.slug}`}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glow"
          >
            К странице тайтла
          </Link>
        </div>
      )}
    </footer>
  )
}

export default function Reader() {
  const { slug, chapterId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const user = useUser()
  const isAdmin = useIsAdmin()
  const s = useReaderSettings()
  const { data: novel, isLoading: novelLoading } = useNovel(slug)
  const { data: chapters = [] } = useChapters(novel?.id, { drafts: isAdmin })
  const { data: chapter, isLoading: chapterLoading } = useChapter(chapterId)
  const readSet = useReadSet(novel?.id)
  const serverProgress = useProgressFor(novel?.id)
  const markRead = useMarkRead()
  const saveProgress = useSaveProgress()
  const { add: addBookmark } = useBookmarks()
  const setPosition = usePositions((st) => st.setPosition)
  const setGuest = usePositions((st) => st.setGuest)

  const [uiVisible, setUiVisible] = useState(true)
  const [panel, setPanel] = useState<null | 'chapters' | 'settings'>(null)
  const [progress, setProgress] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [pageWidth, setPageWidth] = useState(0)

  const contentRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const restored = useRef<string | null>(null)
  const markedRef = useRef<string | null>(null)
  const progressRef = useRef(0)
  progressRef.current = progress

  const paged = s.mode === 'paged'
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.volume - b.volume || a.number - b.number), [chapters])
  const index = ordered.findIndex((c) => c.id === chapterId)
  const prev = index > 0 ? ordered[index - 1] : null
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null
  const blocks = useMemo(() => (chapter ? parseContent(chapter.content) : []), [chapter])
  const theme = READER_THEMES.find((t) => t.id === s.theme) ?? READER_THEMES[4]
  const font = READER_FONTS.find((f) => f.id === s.font) ?? READER_FONTS[0]

  useTitle(chapter && novel ? `${chapter.title || chapterLabel(chapter)} — ${novel.title}` : novel?.title)
  useEffect(() => ensureReaderFont(s.font), [s.font])

  // Цвет системной панели браузера — под тему страницы.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const before = meta?.getAttribute('content')
    meta?.setAttribute('content', theme.bg)
    return () => {
      if (before) meta?.setAttribute('content', before)
    }
  }, [theme.bg])

  const goTo = useCallback((c: ChapterMeta | null) => c && novel && navigate(`/read/${novel.slug}/${c.id}`), [navigate, novel])

  // ── Отметка «прочитано» ──
  const completeChapter = useCallback(() => {
    if (!chapter || !novel || markedRef.current === chapter.id) return
    markedRef.current = chapter.id
    if (user && !readSet.has(chapter.id)) {
      markRead.mutate({ novelId: novel.id, chapterId: chapter.id, words: chapter.wordCount })
    }
  }, [chapter, novel, user, readSet, markRead])

  // ── Сохранение позиции ──
  const persist = useCallback(
    (fraction: number) => {
      if (!chapter || !novel) return
      setPosition(chapter.id, fraction)
      if (user) saveProgress.mutate({ novelId: novel.id, chapterId: chapter.id, position: fraction })
      else setGuest(novel.id, chapter.id, fraction)
    },
    [chapter?.id, novel?.id, user?.id]
  )

  useEffect(() => {
    if (!chapter || restored.current !== chapter.id) return
    const t = setTimeout(() => persist(progress), 1500)
    return () => clearTimeout(t)
  }, [progress, chapter, persist])

  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && persist(progressRef.current)
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [persist])

  // Подгружаем следующую главу заранее — переход будет мгновенным.
  useEffect(() => {
    if (next) qc.prefetchQuery({ queryKey: qk.chapter(next.id), queryFn: () => api.getChapter(next.id) })
  }, [next, qc])

  // ── Лента: прогресс и автоскрытие панелей ──
  useEffect(() => {
    if (paged) return
    let last = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.round(Math.min(1, y / max) * 1000) / 1000 : 1)
      if (y > last + 8 && y > 140) setUiVisible(false)
      else if (y < last - 8 || y < 80 || y >= max - 4) setUiVisible(true)
      last = y
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [paged, chapter?.id])

  useEffect(() => {
    if (paged || !endRef.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && completeChapter(), { threshold: 0.5 })
    io.observe(endRef.current)
    return () => io.disconnect()
  }, [paged, completeChapter, blocks])

  // ── Страницы: раскладка в колонки ──
  const measure = useCallback(() => {
    const vp = viewportRef.current
    const flow = flowRef.current
    if (!vp || !flow) return
    const width = vp.clientWidth
    flow.style.columnWidth = `${width}px`
    flow.style.columnGap = `${PAGE_GAP}px`
    flow.style.width = `${width}px`
    const total = Math.max(1, Math.round((flow.scrollWidth + PAGE_GAP) / (width + PAGE_GAP)))
    setPageWidth(width)
    setPages(total)
    return total
  }, [])

  useLayoutEffect(() => {
    if (!paged || !chapter) return
    const fraction = progressRef.current
    const total = measure()
    if (total && restored.current === chapter.id) setPage(Math.round(fraction * (total - 1)))
  }, [paged, chapter?.id, s.fontSize, s.lineHeight, s.paragraphGap, s.font, s.width, s.indent, s.justify, s.hyphens, measure])

  useEffect(() => {
    if (!paged) return
    const vp = viewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => {
      const fraction = progressRef.current
      const total = measure()
      if (total) setPage(Math.round(fraction * (total - 1)))
    })
    ro.observe(vp)
    document.fonts?.ready.then(() => measure())
    return () => ro.disconnect()
  }, [paged, measure, chapter?.id])

  useEffect(() => {
    if (!paged) return
    const p = pages > 1 ? page / (pages - 1) : 1
    setProgress(p)
    if (page >= pages - 1 && restored.current === chapter?.id) completeChapter()
  }, [page, pages, paged, completeChapter, chapter?.id])

  const turn = useCallback(
    (delta: number) => {
      if (delta > 0) {
        if (page < pages - 1) setPage(page + 1)
        else if (next) goTo(next)
      } else {
        if (page > 0) setPage(page - 1)
        else if (prev) goTo(prev)
      }
    },
    [page, pages, next, prev, goTo]
  )

  // ── Восстановление позиции при открытии главы ──
  useEffect(() => {
    if (!chapter || restored.current === chapter.id) return
    const run = async () => {
      await document.fonts?.ready
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const local = usePositions.getState().positions[chapter.id]
      const fromServer = serverProgress?.chapterId === chapter.id ? serverProgress.position : undefined
      const saved = local ?? fromServer ?? 0
      const target = Number(params.get('p'))
      markedRef.current = readSet.has(chapter.id) ? chapter.id : null
      if (paged) {
        const total = measure() ?? 1
        setPage(saved > 0.02 && saved < 0.98 ? Math.round(saved * (total - 1)) : 0)
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight
        window.scrollTo({ top: saved > 0.02 && saved < 0.98 ? saved * max : 0, behavior: 'instant' as ScrollBehavior })
      }
      restored.current = chapter.id
      if (params.has('p') && !Number.isNaN(target)) {
        jumpToBlock(target)
        setParams((p) => {
          p.delete('p')
          return p
        }, { replace: true })
      } else if (saved > 0.02 && saved < 0.98) {
        toast.action(
          `Продолжаем с ${Math.round(saved * 100)}%`,
          { label: 'Начать главу сначала', onClick: () => (paged ? setPage(0) : window.scrollTo({ top: 0, behavior: 'smooth' })) },
          'Позиция в главе сохранена'
        )
      }
      if (safeSession.get(TTS_CONTINUE)) {
        safeSession.remove(TTS_CONTINUE)
        setTimeout(() => tts.start(0), 400)
      }
    }
    setProgress(0)
    setPage(0)
    run()
  }, [chapter?.id])

  const blockElement = (i: number) => contentRef.current?.querySelector<HTMLElement>(`[data-block="${i}"]`) ?? null

  function jumpToBlock(i: number) {
    const el = blockElement(i)
    if (!el) return
    if (paged) {
      const flow = flowRef.current
      if (flow) {
        const left = el.offsetLeft
        setPage(Math.floor(left / ((pageWidth || flow.clientWidth) + PAGE_GAP)))
      }
    } else {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }

  /** Первый абзац, который сейчас виден, — для закладки и старта озвучки. */
  const firstVisibleBlock = () => {
    const nodes = contentRef.current?.querySelectorAll<HTMLElement>('[data-block]')
    if (!nodes) return 0
    if (paged) {
      const vp = viewportRef.current?.getBoundingClientRect()
      for (const n of nodes) {
        const r = n.getBoundingClientRect()
        if (vp && r.left >= vp.left - 4 && r.left < vp.right && r.bottom > vp.top) return Number(n.dataset.block)
      }
      return 0
    }
    for (const n of nodes) {
      if (n.getBoundingClientRect().bottom > 96) return Number(n.dataset.block)
    }
    return 0
  }

  const bookmarkHere = () => {
    if (!user) {
      toast.info('Закладки доступны после входа', 'Войдите, чтобы сохранять цитаты и места в тексте')
      return
    }
    if (!novel || !chapter) return
    const i = firstVisibleBlock()
    const b = blocks[i]
    const excerpt = b && 'text' in b ? plainText(b.text).slice(0, 220) : chapter.title
    addBookmark.mutate(
      { novelId: novel.id, chapterId: chapter.id, paragraph: i, excerpt, note: '' },
      {
        onSuccess: () =>
          toast.action('Закладка сохранена', { label: 'Все закладки', onClick: () => navigate('/profile/bookmarks') }, `«${excerpt.slice(0, 70)}…»`),
      }
    )
  }

  // ── Озвучка ──
  const tts = useTts({
    blocks,
    rate: s.ttsRate,
    voiceURI: s.ttsVoice,
    onFinished: () => {
      completeChapter()
      if (s.autoNext && next) {
        safeSession.set(TTS_CONTINUE, '1')
        goTo(next)
      }
    },
  })

  useEffect(() => {
    if (tts.active === null) return
    const el = blockElement(tts.active)
    if (!el) return
    if (paged) {
      const p = Math.floor(el.offsetLeft / ((pageWidth || 1) + PAGE_GAP))
      if (p !== page) setPage(p)
    } else {
      const r = el.getBoundingClientRect()
      if (r.top < 90 || r.bottom > window.innerHeight - 120) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [tts.active])

  const toggleTts = () => {
    if (!tts.supported) return toast.error('Озвучка недоступна', 'Ваш браузер не поддерживает синтез речи')
    if (tts.status === 'idle') tts.start(firstVisibleBlock())
    else if (tts.status === 'playing') tts.pause()
    else tts.resume()
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.().catch(() => undefined)
  }
  useEffect(() => {
    const on = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  // ── Клавиатура ──
  const keyHandler = useRef<(e: KeyboardEvent) => void>()
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current?.(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
  {
    keyHandler.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (panel && e.key !== 'Escape') return
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowRight' || (paged && (e.key === 'PageDown' || e.key === ' '))) {
        e.preventDefault()
        if (paged) turn(1)
        else goTo(next)
      } else if (e.key === 'ArrowLeft' || (paged && e.key === 'PageUp')) {
        e.preventDefault()
        if (paged) turn(-1)
        else goTo(prev)
      } else if (k === 'c' || k === 'с') setPanel('chapters')
      else if (k === 's' || k === 'ы') setPanel('settings')
      else if (k === 'b' || k === 'и') bookmarkHere()
      else if (k === 't' || k === 'е') toggleTts()
      else if (k === 'f' || k === 'а') toggleFullscreen()
      else if (e.key === 'Escape') setPanel(null)
    }
  }

  // ── Касания и свайпы в постраничном режиме ──
  const pointer = useRef<{ x: number; y: number; t: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const start = pointer.current
    pointer.current = null
    if (!start) return
    if ((e.target as Element).closest('a,button,figure')) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (window.getSelection()?.toString()) return
    if (paged && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      turn(dx < 0 ? 1 : -1)
      return
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const zone = e.clientX / window.innerWidth
      if (paged && zone < 0.28) turn(-1)
      else if (paged && zone > 0.72) turn(1)
      else setUiVisible((v) => !v)
    }
  }
  const wheelLock = useRef(0)
  const onWheel = (e: React.WheelEvent) => {
    if (!paged || Math.abs(e.deltaY) < 20 || Date.now() < wheelLock.current) return
    wheelLock.current = Date.now() + 450
    turn(e.deltaY > 0 ? 1 : -1)
  }

  // Текст главы перерисовывается только при смене главы или озвучиваемого абзаца — не при прокрутке.
  const content = useMemo(
    () =>
      novel && chapter ? (
        <ChapterContent
          blocks={blocks}
          activeIndex={tts.active}
          header={<ChapterHeader novel={novel} chapter={chapter} />}
          footer={<ChapterEnd novel={novel} next={next} endRef={endRef} />}
          onImageClick={(src, alt) => setLightbox({ src, alt })}
        />
      ) : null,
    [blocks, tts.active, novel, chapter, next]
  )

  // ── Состояния загрузки ──
  if (novelLoading || chapterLoading) {
    return (
      <div className={`reader-root reader-theme-${s.theme} min-h-screen`}>
        <PageLoader />
      </div>
    )
  }
  if (!novel || !chapter || chapter.novelId !== novel.id) {
    return (
      <div className={`reader-root reader-theme-${s.theme} flex min-h-screen items-center justify-center`}>
        <EmptyState
          kanji="迷"
          title="Глава не найдена"
          description="Возможно, её сняли с публикации или ссылка устарела."
          action={
            <ButtonLink to={novel ? `/novel/${novel.slug}` : '/catalog'} variant="primary">
              {novel ? 'К оглавлению' : 'В каталог'}
            </ButtonLink>
          }
        />
      </div>
    )
  }

  const vars = {
    '--r-font': font.family,
    '--r-size': `${s.fontSize}px`,
    '--r-lh': s.lineHeight,
    '--r-gap': `${s.paragraphGap}em`,
    '--r-indent': s.indent ? '1.6em' : '0',
    '--r-align': s.justify ? 'justify' : 'left',
    '--r-hyphens': s.hyphens ? 'auto' : 'manual',
  } as CSSProperties

  const readCount = ordered.filter((c) => readSet.has(c.id)).length

  return (
    <div className={`reader-root reader-theme-${s.theme} min-h-[100dvh]`} style={vars}>
      {/* Полоса прогресса */}
      <div className="fixed inset-x-0 top-0 z-50 h-[3px] bg-reader-line/5">
        <div className="h-full origin-left bg-ember transition-transform duration-300 ease-out" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* Верхняя панель */}
      <motion.header
        initial={false}
        animate={{ y: uiVisible ? 0 : -80, opacity: uiVisible ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-0 z-40 border-b border-reader-line/10 bg-reader-bg/85 pt-safe backdrop-blur-xl"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-2 sm:gap-2 sm:px-4">
          <Link
            to={`/novel/${novel.slug}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-reader-fg/70 transition-colors hover:bg-reader-line/10 hover:text-reader-fg"
            aria-label="К странице тайтла"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button onClick={() => setPanel('chapters')} className="min-w-0 flex-1 px-1 text-left">
            <p className="truncate text-[11px] font-medium uppercase tracking-wider text-reader-muted">{novel.title}</p>
            <p className="truncate text-sm font-semibold">
              {chapterLabel(chapter, false)}
              {chapter.title && <span className="font-normal text-reader-fg/80"> · {chapter.title}</span>}
            </p>
          </button>
          {isAdmin && (
            <Link
              to={`/admin/novels/${novel.id}/chapters/${chapter.id}`}
              className="hidden h-10 w-10 items-center justify-center rounded-full text-reader-fg/70 hover:bg-reader-line/10 sm:flex"
              title="Редактировать главу"
            >
              <PenLine className="h-[18px] w-[18px]" />
            </Link>
          )}
          <RIcon label="Оглавление (C)" onClick={() => setPanel('chapters')}>
            <List className="h-5 w-5" />
          </RIcon>
          <RIcon label="Закладка (B)" onClick={bookmarkHere}>
            <BookmarkPlus className="h-5 w-5" />
          </RIcon>
          <RIcon label="Озвучка (T)" onClick={toggleTts} active={tts.status !== 'idle'}>
            <Headphones className="h-5 w-5" />
          </RIcon>
          <RIcon label="Настройки текста (S)" onClick={() => setPanel('settings')}>
            <Type className="h-5 w-5" />
          </RIcon>
          <RIcon label="Полный экран (F)" onClick={toggleFullscreen} className="max-sm:hidden">
            {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </RIcon>
        </div>
      </motion.header>

      {!chapter.published && (
        <div className="fixed inset-x-0 top-16 z-30 mx-auto w-fit rounded-full bg-warn/15 px-4 py-1.5 text-xs font-semibold text-warn backdrop-blur">
          Черновик — читатели эту главу пока не видят
        </div>
      )}

      {/* Текст */}
      {paged ? (
        <div
          className="fixed inset-0 select-text"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          <div
            ref={viewportRef}
            className="paged-viewport absolute bottom-16 left-1/2 top-16 w-[calc(100%-2.5rem)] -translate-x-1/2 sm:bottom-20 sm:top-20"
            style={{ maxWidth: s.width }}
          >
            <div
              ref={(el) => {
                flowRef.current = el
                contentRef.current = el
              }}
              className="paged-flow"
              style={{ transform: `translateX(-${page * (pageWidth + PAGE_GAP)}px)` }}
            >
              {content}
            </div>
          </div>
          <div className="pointer-events-none fixed bottom-5 inset-x-0 text-center text-xs tabular text-reader-muted sm:bottom-7">
            {page + 1} / {pages}
          </div>
        </div>
      ) : (
        <main className="px-5 pb-40 pt-24 sm:pt-28" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <div ref={contentRef} className="mx-auto" style={{ maxWidth: s.width }}>
            {content}
          </div>
        </main>
      )}

      {/* Нижняя панель */}
      <motion.div
        initial={false}
        animate={{ y: uiVisible ? 0 : 120, opacity: uiVisible ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-reader-line/10 bg-reader-surface/90 p-1.5 shadow-float backdrop-blur-xl">
          <button
            onClick={() => goTo(prev)}
            disabled={!prev}
            className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-reader-fg/80 transition-colors hover:bg-reader-line/10 disabled:opacity-30 sm:px-4"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="max-sm:hidden">Назад</span>
          </button>
          <button onClick={() => setPanel('chapters')} className="min-w-[8.5rem] rounded-full px-3 py-1 text-center transition-colors hover:bg-reader-line/10">
            <span className="block text-[11px] text-reader-muted">
              Глава {index + 1} из {ordered.length}
            </span>
            <span className="block text-sm font-semibold tabular">{Math.round(progress * 100)}%</span>
          </button>
          <button
            onClick={() => goTo(next)}
            disabled={!next}
            className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-reader-fg/80 transition-colors hover:bg-reader-line/10 disabled:opacity-30 sm:px-4"
          >
            <span className="max-sm:hidden">Далее</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      {/* Мини-плеер озвучки */}
      <AnimatePresence>
        {tts.status !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
          >
            <div className="flex items-center gap-1 rounded-full border border-reader-line/10 bg-reader-surface/95 p-1.5 pl-4 shadow-float backdrop-blur-xl">
              <span className="mr-2 flex items-end gap-[3px]" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    className="w-[3px] rounded-full bg-reader-accent"
                    animate={tts.status === 'playing' ? { height: [6, 16, 8, 14, 6] } : { height: 6 }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </span>
              <span className="mr-1 text-xs font-medium text-reader-muted max-sm:hidden">Озвучка</span>
              <RIcon label="Предыдущий абзац" onClick={() => tts.skip(-1)}>
                <SkipBack className="h-4 w-4" />
              </RIcon>
              <RIcon label={tts.status === 'playing' ? 'Пауза' : 'Продолжить'} onClick={toggleTts} active>
                {tts.status === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </RIcon>
              <RIcon label="Следующий абзац" onClick={() => tts.skip(1)}>
                <SkipForward className="h-4 w-4" />
              </RIcon>
              <RIcon label="Остановить" onClick={tts.stop}>
                <Square className="h-4 w-4" />
              </RIcon>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Затемнение */}
      {s.dim > 0 && <div className="pointer-events-none fixed inset-0 z-[45] bg-black" style={{ opacity: s.dim }} />}

      <Sheet open={panel === 'chapters'} onClose={() => setPanel(null)} side="left" title="Оглавление">
        <div className="mb-5 flex items-center gap-4">
          <Cover novel={novel} className="w-16 shrink-0 shadow-cover" rounded="rounded-xl" showTitle={false} />
          <div className="min-w-0">
            <Link to={`/novel/${novel.slug}`} className="line-clamp-2 font-semibold leading-snug hover:text-accent">
              {novel.title}
            </Link>
            <p className="mt-1 text-xs text-muted">
              Прочитано {readCount} из {ordered.length}
            </p>
            <ProgressBar value={ordered.length ? readCount / ordered.length : 0} className="mt-2 w-40" />
          </div>
        </div>
        <ChapterList novel={novel} chapters={ordered} readSet={readSet} currentId={chapter.id} compact onNavigate={() => setPanel(null)} />
      </Sheet>

      <Sheet open={panel === 'settings'} onClose={() => setPanel(null)} title="Настройки чтения" plain>
        <SettingsPanel />
      </Sheet>

      <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} size="xl" className="p-3 sm:p-3">
        {lightbox && (
          <figure>
            <img src={lightbox.src} alt={lightbox.alt} className="max-h-[78vh] w-full rounded-2xl object-contain" />
            {lightbox.alt && <figcaption className="mt-3 text-center text-sm text-muted">{lightbox.alt}</figcaption>}
          </figure>
        )}
      </Modal>
    </div>
  )
}
