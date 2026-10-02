import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Clock,
  Compass,
  CornerDownLeft,
  Dices,
  LayoutDashboard,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { GENRES, genreInfo } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { compactNumber, formatRating } from '../../lib/format'
import { useNovels } from '../../lib/queries'
import { highlight, normalize, searchNovels, suggestTitle } from '../../lib/search'
import { useAuth } from '../../store/auth'
import { usePrefs } from '../../store/prefs'
import { useUI } from '../../store/ui'
import { Cover } from '../novel/Cover'
import { Kbd } from '../ui/Feedback'

interface Item {
  id: string
  group: string
  icon?: ReactNode
  render: ReactNode
  onSelect: () => void
}

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-accent/20 px-px text-accent">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const openPalette = useUI((s) => s.openPalette)
  const close = useUI((s) => s.closePalette)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (useUI.getState().paletteOpen) close()
        else openPalette()
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPalette, close])

  return createPortal(<AnimatePresence>{open && <PaletteDialog onClose={close} />}</AnimatePresence>, document.body)
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data: novels = [] } = useNovels()
  const user = useAuth((s) => s.user)
  const recent = usePrefs((s) => s.recentSearches)
  const addRecent = usePrefs((s) => s.addRecentSearch)
  const clearRecent = usePrefs((s) => s.clearRecentSearches)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
    }
  }, [])

  const go = (to: string, remember?: string) => {
    if (remember) addRecent(remember)
    onClose()
    navigate(to)
  }

  const q = query.trim()
  const hits = useMemo(() => (q ? searchNovels(novels, q).slice(0, 7) : []), [novels, q])
  const suggestion = useMemo(() => (q && !hits.length ? suggestTitle(novels, q) : null), [novels, q, hits.length])
  const genreHits = useMemo(() => {
    if (!q) return []
    const nq = normalize(q)
    return GENRES.filter((g) => normalize(g.name).includes(nq)).slice(0, 4)
  }, [q])

  const items: Item[] = useMemo(() => {
    const list: Item[] = []
    if (q) {
      for (const { novel } of hits) {
        list.push({
          id: `n-${novel.id}`,
          group: 'Тайтлы',
          onSelect: () => go(`/novel/${novel.slug}`, q),
          render: (
            <div className="flex min-w-0 items-center gap-3">
              <Cover novel={novel} className="w-9 shrink-0" rounded="rounded-md" showTitle={false} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">
                  <Highlighted text={novel.title} query={q} />
                </p>
                <p className="truncate text-xs text-muted">
                  <Highlighted text={novel.author} query={q} /> · {novel.genres.slice(0, 2).join(', ')}
                </p>
              </div>
              <span className="ml-auto shrink-0 text-xs text-faint tabular">★ {formatRating(novel)}</span>
            </div>
          ),
        })
      }
      for (const g of genreHits) {
        const Icon = g.icon
        list.push({
          id: `g-${g.name}`,
          group: 'Жанры',
          icon: <Icon className="h-4 w-4" style={{ color: `hsl(${g.hue} 80% 62%)` }} />,
          onSelect: () => go(`/catalog?genres=${encodeURIComponent(g.name)}`),
          render: <span className="text-sm">Жанр «{g.name}»</span>,
        })
      }
      if (suggestion) {
        list.push({
          id: 'suggest',
          group: 'Возможно, вы искали',
          icon: <Sparkles className="h-4 w-4 text-accent-2" />,
          onSelect: () => go(`/novel/${suggestion.slug}`, suggestion.title),
          render: <span className="text-sm font-medium">{suggestion.title}</span>,
        })
      }
      list.push({
        id: 'all',
        group: 'Каталог',
        icon: <Search className="h-4 w-4" />,
        onSelect: () => go(`/catalog?q=${encodeURIComponent(q)}`, q),
        render: (
          <span className="text-sm">
            Все результаты по запросу «<span className="font-semibold text-fg">{q}</span>»
          </span>
        ),
      })
    } else {
      for (const r of recent.slice(0, 4)) {
        list.push({
          id: `r-${r}`,
          group: 'Недавние запросы',
          icon: <Clock className="h-4 w-4" />,
          onSelect: () => setQuery(r),
          render: <span className="text-sm">{r}</span>,
        })
      }
      const popular = [...novels].sort((a, b) => b.views - a.views).slice(0, 4)
      for (const n of popular) {
        list.push({
          id: `p-${n.id}`,
          group: 'Популярное',
          onSelect: () => go(`/novel/${n.slug}`),
          render: (
            <div className="flex min-w-0 items-center gap-3">
              <Cover novel={n} className="w-9 shrink-0" rounded="rounded-md" showTitle={false} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="truncate text-xs text-muted">
                  {compactNumber(n.views)} просмотров · {genreInfo(n.genres[0] ?? '').name}
                </p>
              </div>
              <TrendingUp className="ml-auto h-4 w-4 shrink-0 text-ok" />
            </div>
          ),
        })
      }
      list.push(
        {
          id: 'a-catalog',
          group: 'Быстрые действия',
          icon: <Compass className="h-4 w-4" />,
          onSelect: () => go('/catalog'),
          render: <span className="text-sm">Открыть каталог</span>,
        },
        {
          id: 'a-random',
          group: 'Быстрые действия',
          icon: <Dices className="h-4 w-4" />,
          onSelect: () => {
            const pool = novels.filter((n) => n.chaptersCount > 0)
            const pick = pool[Math.floor(Math.random() * pool.length)]
            if (pick) go(`/novel/${pick.slug}`)
          },
          render: <span className="text-sm">Мне повезёт — случайный тайтл</span>,
        },
        {
          id: 'a-profile',
          group: 'Быстрые действия',
          icon: <UserRound className="h-4 w-4" />,
          onSelect: () => go(user ? '/profile' : '/login'),
          render: <span className="text-sm">{user ? 'Личный кабинет' : 'Войти или зарегистрироваться'}</span>,
        }
      )
      if (user?.role === 'admin') {
        list.push({
          id: 'a-admin',
          group: 'Быстрые действия',
          icon: <LayoutDashboard className="h-4 w-4" />,
          onSelect: () => go('/admin/novels/new'),
          render: <span className="text-sm">Админка: добавить тайтл</span>,
        })
      }
    }
    return list
  }, [q, hits, genreHits, suggestion, recent, novels, user])

  useEffect(() => setActive(0), [q])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.onSelect()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  let lastGroup = ''

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]" onKeyDown={onKeyDown}>
      <motion.div
        className="absolute inset-0 bg-[rgb(var(--shadow-rgb)/0.5)] backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label="Поиск"
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong relative w-full max-w-2xl overflow-hidden rounded-[28px] shadow-float"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-ember opacity-60" />
        <div className="flex items-center gap-3 border-b border-line/[0.08] px-5">
          <Search className="h-5 w-5 shrink-0 text-accent" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название, автор, жанр или тег…"
            className="h-16 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-faint"
            aria-label="Поисковый запрос"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-line/[0.07] hover:text-fg"
              aria-label="Очистить"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Kbd>Esc</Kbd>
          )}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <div key={item.id}>
                {header && (
                  <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
                    <span className="kicker">{header}</span>
                    {header === 'Недавние запросы' && (
                      <button onClick={clearRecent} className="text-[11px] text-faint hover:text-accent">
                        очистить
                      </button>
                    )}
                  </div>
                )}
                <button
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={item.onSelect}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-fg-2 transition-colors',
                    index === active && 'bg-line/[0.07] text-fg'
                  )}
                >
                  {index === active && (
                    <motion.span layoutId="palette-active" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-ember" />
                  )}
                  {item.icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-line/[0.06]">{item.icon}</span>}
                  <div className="min-w-0 flex-1">{item.render}</div>
                  {index === active && <ArrowRight className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              </div>
            )
          })}
          {q && hits.length === 0 && (
            <p className="px-4 pb-2 pt-3 text-sm text-muted">
              Ничего не нашлось. Попробуйте другое написание — поиск понимает опечатки, транслит и неверную раскладку.
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line/[0.08] px-5 py-3 text-[11.5px] text-faint max-sm:hidden">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> выбрать
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="h-3 w-3" />
            </Kbd>{' '}
            открыть
          </span>
          <span className="ml-auto">Понимает опечатки, транслит и «не ту» раскладку</span>
        </div>
      </motion.div>
    </div>
  )
}
