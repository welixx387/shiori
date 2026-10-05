import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Headphones,
  List,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  PenLine,
  Play,
  ScrollText,
  SkipBack,
  SkipForward,
  Square,
  Type,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { anchorToPosition, blockEl, excerptAt, flashBlock, positionToAnchor, scrollAnchor, scrollToAnchor, type Anchor } from '../components/reader/anchor'
import { ChapterContent } from '../components/reader/ChapterContent'
import { PagedBook, type PagedHandle, type PagedState } from '../components/reader/PagedBook'
import { SettingsPanel } from '../components/reader/SettingsPanel'
import { useTts } from '../components/reader/useTts'
import { ChapterList } from '../components/novel/ChapterList'
import { Comments } from '../components/social/Comments'
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
import { parseContent } from '../lib/text'
import { useIsAdmin, useUser } from '../store/auth'
import { usePositions } from '../store/guest'
import { usePrefs } from '../store/prefs'
import { READER_FONTS, READER_THEMES, ensureReaderFont, useReaderSettings } from '../store/reader'
import { toast } from '../store/toast'
import type { Chapter, ChapterMeta, Novel } from '../types'

const TTS_CONTINUE = 'shiori-tts-continue'
const noop = () => undefined

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

function ChapterEnd({
  novel,
  next,
  endRef,
  onComments,
}: {
  novel: Novel
  next: ChapterMeta | null
  endRef?: React.RefObject<HTMLDivElement>
  onComments?: () => void
}) {
  return (
    <footer className="mt-14 text-center text-base leading-normal" style={{ fontSize: 16, breakInside: 'avoid' }}>
      <div ref={endRef} className="r-break" aria-hidden>
        ✦
      </div>
      <p className="-mt-2 text-xs uppercase tracking-[0.3em] text-reader-muted">конец главы</p>
      {next ? (
        <Link
          to={`/read/${novel.slug}/${next.id}`}
          className="group mx-auto mt-8 block max-w-md rounded-[28px] border border-reader-line/10 bg-reader-bg/40 p-6 text-left transition-colors hover:border-reader-accent/40"
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
        <div className="mx-auto mt-8 max-w-md rounded-[28px] border border-reader-line/10 bg-reader-bg/40 p-6">
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
      {onComments && (
        <button
          type="button"
          onClick={onComments}
          className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-reader-line/15 px-5 py-2.5 text-sm font-semibold text-reader-fg/80 transition-colors hover:border-reader-accent/50 hover:text-reader-accent"
        >
          <MessageCircle className="h-4 w-4" /> Обсуждение главы
        </button>
      )}
    </footer>
  )
}

export default function Reader() {
  const { slug, chapterId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const user = useUser()
  const isAdmin = useIsAdmin()
  const s = useReaderSettings()
  const reduceMotionPref = usePrefs((st) => st.reduceMotion)
  const reduceMotionOs = useReducedMotion()
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
  const [panel, setPanel] = useState<null | 'chapters' | 'settings' | 'comments'>(null)
  const [progress, setProgress] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [pageInfo, setPageInfo] = useState({ page: 0, pages: 1, perView: 1 })

  const pagedRef = useRef<PagedHandle>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const restored = useRef<string | null>(null)
  const markedRef = useRef<string | null>(null)
  /** Где читатель сейчас: абзац и символ. Общий для обоих режимов — переживает смену режима, шрифта и поворот экрана. */
  const anchorRef = useRef<Anchor | null>(null)
  const pending = useRef<{ chapterId: string; novelId: string; position: number } | null>(null)
  const saveTimer = useRef(0)
  const suppressScroll = useRef(0)
  const pageInfoRef = useRef(pageInfo)
  pageInfoRef.current = pageInfo

  const paged = s.mode === 'paged'
  const turnStyle = reduceMotionPref || reduceMotionOs ? 'none' : s.turn
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.volume - b.volume || a.number - b.number), [chapters])
  const index = ordered.findIndex((c) => c.id === chapterId)
  const prev = index > 0 ? ordered[index - 1] : null
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null
  const blocks = useMemo(() => (chapter ? parseContent(chapter.content) : []), [chapter])
  const theme = READER_THEMES.find((t) => t.id === s.theme) ?? READER_THEMES[4]
  const font = READER_FONTS.find((f) => f.id === s.font) ?? READER_FONTS[0]
  const layoutKey = [s.font, s.fontSize, s.lineHeight, s.paragraphGap, s.width, s.indent, s.justify, s.hyphens].join('|')

  const latest = useRef({ chapter, novel, user, blocks, paged, next, prev })
  latest.current = { chapter, novel, user, blocks, paged, next, prev }

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

  // В режиме страниц страница не «тянется» и не обновляется жестом вниз.
  useEffect(() => {
    if (!paged) return
    const html = document.documentElement
    const before = html.style.overscrollBehavior
    html.style.overscrollBehavior = 'none'
    return () => {
      html.style.overscrollBehavior = before
    }
  }, [paged])

  const goTo = useCallback(
    (c: ChapterMeta | null, opts?: { atEnd?: boolean }) => {
      const n = latest.current.novel
      if (c && n) navigate(`/read/${n.slug}/${c.id}`, opts?.atEnd ? { state: { at: 'end' } } : undefined)
    },
    [navigate]
  )

  /** Корень с текстом главы в текущем режиме. */
  const textRoot = () => (latest.current.paged ? (pagedRef.current?.root() ?? null) : contentRef.current)
  /** Линия чтения в ленте — сразу под верхней панелью. */
  const lineY = () => (headerRef.current?.offsetHeight ?? 56) + 20

  // ── Отметка «прочитано» ──
  const completeChapter = useCallback(() => {
    const { chapter: c, novel: n, user: u } = latest.current
    if (!c || !n || markedRef.current === c.id) return
    markedRef.current = c.id
    if (u && !readSet.has(c.id)) markRead.mutate({ novelId: n.id, chapterId: c.id, words: c.wordCount })
  }, [readSet, markRead])

  // ── Сохранение места чтения ──
  const flush = useCallback(() => {
    clearTimeout(saveTimer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    setPosition(p.chapterId, p.position)
    if (latest.current.user) saveProgress.mutate({ novelId: p.novelId, chapterId: p.chapterId, position: p.position })
    else setGuest(p.novelId, p.chapterId, p.position)
  }, [setPosition, setGuest, saveProgress.mutate])

  const noteAnchor = useCallback(
    (a: Anchor | null) => {
      const { chapter: c, novel: n, blocks: b } = latest.current
      if (!a || !c || !n) return
      anchorRef.current = a
      if (restored.current !== c.id) return
      const position = Math.round(anchorToPosition(textRoot(), a, b.length) * 1e7) / 1e7
      pending.current = { chapterId: c.id, novelId: n.id, position }
      clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, 1200)
    },
    [flush]
  )

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  // Ушли из главы — место сохраняется сразу.
  useEffect(() => () => flush(), [chapter?.id, flush])

  // Подгружаем следующую главу заранее — переход будет мгновенным.
  useEffect(() => {
    if (next) qc.prefetchQuery({ queryKey: qk.chapter(next.id), queryFn: () => api.getChapter(next.id) })
  }, [next, qc])

  /** Открыть место в тексте в текущем режиме. */
  const showAnchor = (a: Anchor, flash = false) => {
    if (latest.current.paged) pagedRef.current?.goToAnchor(a, { flash })
    else {
      const root = contentRef.current
      if (!root) return
      suppressScroll.current = performance.now() + 450
      scrollToAnchor(root, a, lineY())
      if (flash) flashBlock(root, a.block)
    }
    anchorRef.current = a
  }

  /** Место, которое сейчас перед глазами читателя. */
  const currentAnchor = (): Anchor | null => {
    if (latest.current.paged) return pagedRef.current?.getAnchor() ?? anchorRef.current
    const root = contentRef.current
    return (root && scrollAnchor(root, lineY())) ?? anchorRef.current
  }

  // ── Лента: прогресс, место чтения и автоскрытие панелей ──
  useEffect(() => {
    if (paged || !chapter) return
    let last = window.scrollY
    let frame = 0
    let idle = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.round(Math.min(1, y / max) * 1000) / 1000 : 1)
      if (performance.now() >= suppressScroll.current) {
        if (y > last + 8 && y > 140) setUiVisible(false)
        else if (y < last - 8 || y < 80 || y >= max - 4) setUiVisible(true)
      }
      last = y
    }
    const settle = () => {
      if (performance.now() < suppressScroll.current) return
      const root = contentRef.current
      if (root) noteAnchor(scrollAnchor(root, lineY()))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
      clearTimeout(idle)
      idle = window.setTimeout(settle, 180)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(idle)
      window.removeEventListener('scroll', onScroll)
    }
  }, [paged, chapter?.id, noteAnchor])

  useEffect(() => {
    if (paged || !endRef.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && completeChapter(), { threshold: 0.5 })
    io.observe(endRef.current)
    return () => io.disconnect()
  }, [paged, completeChapter, blocks])

  // Лента: сменились шрифт или размер — возвращаемся к тому же месту.
  useLayoutEffect(() => {
    if (paged || !chapter || restored.current !== chapter.id) return
    const a = anchorRef.current
    if (a) showAnchor(a)
  }, [layoutKey])

  // Лента: поворот экрана или догрузка шрифта — тоже держим место.
  useEffect(() => {
    if (paged) return
    const root = contentRef.current
    if (!root) return
    let width = root.clientWidth
    const keep = () => {
      const a = anchorRef.current
      if (a && restored.current === latest.current.chapter?.id) showAnchor(a)
    }
    const ro = new ResizeObserver(() => {
      if (root.clientWidth === width) return
      width = root.clientWidth
      keep()
    })
    ro.observe(root)
    document.fonts?.addEventListener?.('loadingdone', keep)
    return () => {
      ro.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', keep)
    }
  }, [paged, chapter?.id])

  // Переключили режим — открываем то же место.
  const prevPaged = useRef(paged)
  useLayoutEffect(() => {
    if (prevPaged.current === paged) return
    prevPaged.current = paged
    const a = anchorRef.current
    if (a && chapter && restored.current === chapter.id) showAnchor(a)
  }, [paged])

  // ── Страницы ──
  // Панели закрывают нижние строки страницы — прячем их вскоре после открытия главы.
  const panelRef = useRef(panel)
  panelRef.current = panel
  useEffect(() => {
    if (!paged) return
    const t = setTimeout(() => !panelRef.current && setUiVisible(false), 3200)
    return () => clearTimeout(t)
  }, [paged, chapter?.id])

  // Мышью панели открываются, если подвести курсор к верхнему или нижнему краю.
  useEffect(() => {
    if (!paged || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const onMove = (e: MouseEvent) => {
      if (e.clientY < 64 || e.clientY > window.innerHeight - 96) setUiVisible(true)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [paged])

  const onPagedState = useCallback(
    (st: PagedState) => {
      setPageInfo({ page: st.page, pages: st.pages, perView: st.perView })
      const last = Math.max(0, Math.floor((st.pages - 1) / st.perView) * st.perView)
      setProgress(last > 0 ? st.page / last : 1)
      noteAnchor(st.anchor)
      if (st.byUser) setUiVisible(false)
      if (st.page >= last && restored.current === latest.current.chapter?.id) completeChapter()
    },
    [noteAnchor, completeChapter]
  )

  const onEdge = useCallback(
    (dir: 1 | -1) => {
      const { next: n, prev: p } = latest.current
      if (dir === 1) {
        if (n) goTo(n)
        else toast.info('Это последняя глава', 'Продолжение появится здесь, как только его опубликуют')
      } else if (p) goTo(p, { atEnd: true })
    },
    [goTo]
  )

  const toggleUi = useCallback(() => setUiVisible((v) => !v), [])
  const openComments = useCallback(() => setPanel('comments'), [])
  const openImage = useCallback((src: string, alt: string) => setLightbox({ src, alt }), [])

  const restart = () => {
    if (latest.current.paged) pagedRef.current?.goToPage(0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Открытие главы: закладка, «с места», конец главы при листании назад ──
  useEffect(() => {
    if (!chapter || restored.current === chapter.id) return
    let cancelled = false
    const run = async () => {
      await document.fonts?.ready
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      if (cancelled) return
      const local = usePositions.getState().positions[chapter.id]
      const fromServer = serverProgress?.chapterId === chapter.id ? serverProgress.position : undefined
      const saved = local ?? fromServer ?? 0
      const p = params.get('p')
      const atEnd = (location.state as { at?: string } | null)?.at === 'end'
      markedRef.current = readSet.has(chapter.id) ? chapter.id : null
      anchorRef.current = null

      let resumed = false
      if (p !== null && Number.isFinite(Number(p))) {
        showAnchor({ block: Math.max(0, Math.floor(Number(p))), char: Math.max(0, Math.floor(Number(params.get('c')) || 0)) }, true)
      } else if (atEnd && latest.current.paged) {
        pagedRef.current?.goToPage(Infinity)
      } else if (saved > 0.002 && saved < 0.985) {
        showAnchor(positionToAnchor(textRoot(), saved, latest.current.blocks.length))
        resumed = true
      }
      restored.current = chapter.id
      noteAnchor(currentAnchor())

      if (latest.current.paged) {
        const info = pageInfoRef.current
        if (info.page >= Math.max(0, Math.floor((info.pages - 1) / info.perView) * info.perView)) completeChapter()
      }
      if (p !== null || atEnd) {
        // Убираем ?p= из адреса, не сбрасывая прокрутку наверх.
        navigate({ pathname: location.pathname, search: '' }, { replace: true, state: null, preventScrollReset: true })
      } else if (resumed) {
        toast.action(`Продолжаем с ${Math.round(saved * 100)}%`, { label: 'Начать главу сначала', onClick: restart }, 'Место в главе сохранено')
      }
      if (safeSession.get(TTS_CONTINUE)) {
        safeSession.remove(TTS_CONTINUE)
        setTimeout(() => tts.start(0), 400)
      }
    }
    setProgress(0)
    run()
    return () => {
      cancelled = true
    }
  }, [chapter?.id])

  const bookmarkHere = () => {
    if (!user) {
      toast.info('Закладки доступны после входа', 'Войдите, чтобы сохранять цитаты и места в тексте')
      return
    }
    if (!novel || !chapter) return
    const a = currentAnchor() ?? { block: 0, char: 0 }
    const root = textRoot()
    const excerpt = excerptAt(blockEl(root, a.block)?.textContent ?? '', a.char) || chapter.title || chapterLabel(chapter)
    flashBlock(root, a.block)
    addBookmark.mutate(
      { novelId: novel.id, chapterId: chapter.id, paragraph: a.block, charOffset: a.char, excerpt, note: '' },
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
    if (paged) {
      pagedRef.current?.goToBlock(tts.active, { onlyIfHidden: true })
      return
    }
    const el = blockEl(contentRef.current, tts.active)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 90 || r.bottom > window.innerHeight - 120) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [tts.active])

  const toggleTts = () => {
    if (!tts.supported) return toast.error('Озвучка недоступна', 'Ваш браузер не поддерживает синтез речи')
    if (tts.status === 'idle') tts.start(currentAnchor()?.block ?? 0)
    else if (tts.status === 'playing') tts.pause()
    else tts.resume()
  }

  const toggleMode = () => s.set({ mode: paged ? 'scroll' : 'paged' })

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
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
    if (panel && e.key !== 'Escape') return
    if ((e.key === ' ' || e.key === 'Enter') && t.closest('button,a')) return
    const k = e.key.toLowerCase()
    const forward = e.key === 'ArrowRight' || (paged && (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)))
    const backward = e.key === 'ArrowLeft' || (paged && (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)))
    if (forward || backward) {
      e.preventDefault()
      if (paged) pagedRef.current?.turn(forward ? 1 : -1)
      else goTo(forward ? next : prev)
    } else if (paged && e.key === 'Home') pagedRef.current?.goToPage(0)
    else if (paged && e.key === 'End') pagedRef.current?.goToPage(Infinity)
    else if (k === 'c' || k === 'с') setPanel('chapters')
    else if (k === 's' || k === 'ы') setPanel('settings')
    else if (k === 'b' || k === 'и') bookmarkHere()
    else if (k === 't' || k === 'е') toggleTts()
    else if (k === 'f' || k === 'а') toggleFullscreen()
    else if (k === 'm' || k === 'ь') toggleMode()
    else if (e.key === 'Escape') setPanel(null)
  }

  // ── Касание текста в ленте показывает и прячет панели ──
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const start = pointer.current
    pointer.current = null
    if (!start || (e.target as Element).closest('a,button,figure,textarea,input,[data-no-toggle]')) return
    if (window.getSelection()?.toString()) return
    if (Math.abs(e.clientX - start.x) < 8 && Math.abs(e.clientY - start.y) < 8) setUiVisible((v) => !v)
  }

  // Текст главы перерисовывается только при смене главы, режима или озвучиваемого абзаца — не при прокрутке.
  const content = useMemo(
    () =>
      novel && chapter ? (
        <ChapterContent
          blocks={blocks}
          activeIndex={tts.active}
          eager={paged}
          header={<ChapterHeader novel={novel} chapter={chapter} />}
          footer={<ChapterEnd novel={novel} next={next} endRef={endRef} onComments={paged && chapter.published ? openComments : undefined} />}
          onImageClick={openImage}
        />
      ) : null,
    [blocks, tts.active, novel, chapter, next, paged, openComments, openImage]
  )
  // Копия для анимации листания: тот же текст и та же раскладка, но без ссылок на элементы.
  const copyContent = useMemo(
    () =>
      novel && chapter && paged ? (
        <ChapterContent
          blocks={blocks}
          eager
          header={<ChapterHeader novel={novel} chapter={chapter} />}
          footer={<ChapterEnd novel={novel} next={next} onComments={chapter.published ? noop : undefined} />}
        />
      ) : null,
    [blocks, novel, chapter, next, paged]
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
  const lastPage = Math.max(0, Math.floor((pageInfo.pages - 1) / pageInfo.perView) * pageInfo.perView)
  const pageLabel =
    pageInfo.perView === 2 && pageInfo.page + 1 < pageInfo.pages
      ? `${pageInfo.page + 1}–${pageInfo.page + 2} из ${pageInfo.pages}`
      : `${pageInfo.page + 1} из ${pageInfo.pages}`
  const minutesLeft = Math.ceil(readingMinutes(chapter.wordCount) * (1 - progress))

  return (
    <div className={`reader-root reader-theme-${s.theme} min-h-[100dvh]`} style={vars}>
      {/* Полоса прогресса */}
      <div className="fixed inset-x-0 top-0 z-50 h-[3px] bg-reader-line/5">
        <div className="h-full origin-left bg-ember transition-transform duration-300 ease-out" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* Верхняя панель */}
      <motion.header
        ref={headerRef}
        initial={false}
        animate={{ y: uiVisible ? 0 : -80, opacity: uiVisible ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-0 z-40 border-b border-reader-line/10 bg-reader-bg/85 pt-safe backdrop-blur-xl"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-0.5 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:gap-2 sm:px-4">
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
              className="hidden h-10 w-10 items-center justify-center rounded-full text-reader-fg/70 hover:bg-reader-line/10 md:flex"
              title="Редактировать главу"
            >
              <PenLine className="h-[18px] w-[18px]" />
            </Link>
          )}
          <RIcon label="Оглавление (C)" onClick={() => setPanel('chapters')}>
            <List className="h-5 w-5" />
          </RIcon>
          <RIcon label="Закладка на этом месте (B)" onClick={bookmarkHere}>
            <BookmarkPlus className="h-5 w-5" />
          </RIcon>
          <RIcon label="Озвучка (T)" onClick={toggleTts} active={tts.status !== 'idle'}>
            <Headphones className="h-5 w-5" />
          </RIcon>
          <RIcon label={paged ? 'Читать лентой (M)' : 'Читать по страницам (M)'} onClick={toggleMode} className="max-sm:hidden">
            {paged ? <ScrollText className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
          </RIcon>
          <RIcon label="Настройки текста (S)" onClick={() => setPanel('settings')}>
            <Type className="h-5 w-5" />
          </RIcon>
          <RIcon label="Полный экран (F)" onClick={toggleFullscreen} className="max-md:hidden">
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
        <div className="fixed inset-0 overflow-hidden">
          <div className="paged-running-top" style={{ opacity: uiVisible ? 0 : 1 }} aria-hidden>
            <span className="truncate">
              {chapterLabel(chapter)}
              {chapter.title ? ` · ${chapter.title}` : ''}
            </span>
          </div>
          <div className="paged-stage">
            <PagedBook
              ref={pagedRef}
              content={content}
              copyContent={copyContent}
              chapterKey={chapter.id}
              layoutKey={layoutKey}
              maxWidth={s.width}
              turnStyle={turnStyle}
              spreadPref={s.spread}
              onState={onPagedState}
              onTapCenter={toggleUi}
              onEdge={onEdge}
            />
          </div>
          <div className="paged-running-bottom" style={{ opacity: uiVisible ? 0 : 1 }} aria-hidden>
            <span>{pageLabel}</span>
            <span className="opacity-50">·</span>
            <span>{progress >= 1 ? 'конец главы' : `ещё ${Math.max(1, minutesLeft)} мин`}</span>
          </div>
        </div>
      ) : (
        <main className="px-5 pb-40 pt-24 sm:pt-28" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <div ref={contentRef} className="mx-auto" style={{ maxWidth: s.width }}>
            {content}
          </div>
          {chapter.published && (
            <div data-no-toggle className="mx-auto mt-16 rounded-[28px] border border-line/10 bg-surface p-5 text-fg sm:p-7" style={{ maxWidth: Math.max(s.width, 560) }}>
              <Comments novelId={novel.id} chapterId={chapter.id} />
            </div>
          )}
        </main>
      )}

      {/* Нижняя панель */}
      <motion.div
        initial={false}
        animate={{ y: uiVisible ? 0 : 160, opacity: uiVisible ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4"
      >
        <div className={cn('flex w-full max-w-md flex-col items-center gap-2', uiVisible && 'pointer-events-auto')}>
          {paged && lastPage > 0 && (
            <label className="flex w-full items-center gap-3 rounded-full border border-reader-line/10 bg-reader-surface/90 py-1 pl-4 pr-4 shadow-float backdrop-blur-xl">
              <span className="w-7 text-right text-[11px] tabular text-reader-muted">{pageInfo.page + 1}</span>
              <input
                type="range"
                className="paged-scrubber min-w-0 flex-1"
                min={0}
                max={lastPage}
                step={pageInfo.perView}
                value={pageInfo.page}
                onChange={(e) => pagedRef.current?.goToPage(Number(e.target.value))}
                aria-label="Страница главы"
                style={{ ['--fill' as string]: `${lastPage > 0 ? (pageInfo.page / lastPage) * 100 : 100}%` }}
              />
              <span className="w-7 text-[11px] tabular text-reader-muted">{pageInfo.pages}</span>
            </label>
          )}
          <div className="flex items-center gap-1 rounded-full border border-reader-line/10 bg-reader-surface/90 p-1.5 shadow-float backdrop-blur-xl">
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
        </div>
      </motion.div>

      {/* Мини-плеер озвучки */}
      <AnimatePresence>
        {tts.status !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className={cn('fixed inset-x-0 z-40 flex justify-center px-4', paged && uiVisible && lastPage > 0 ? 'bottom-36' : 'bottom-24')}
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

      <Sheet open={panel === 'comments'} onClose={() => setPanel(null)} title="Обсуждение главы">
        <Comments novelId={novel.id} chapterId={chapter.id} />
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
