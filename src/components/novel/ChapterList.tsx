import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownUp, CircleCheck, ChevronDown, Lock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatDate, isFresh, readingMinutes } from '../../lib/format'
import type { ChapterMeta, Novel } from '../../types'

interface ChapterListProps {
  novel: Pick<Novel, 'slug'>
  chapters: ChapterMeta[]
  readSet: Set<string>
  currentId?: string
  compact?: boolean
  onNavigate?: () => void
}

export function ChapterList({ novel, chapters, readSet, currentId, compact, onNavigate }: ChapterListProps) {
  const [query, setQuery] = useState('')
  const [desc, setDesc] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const volumes = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/ё/g, 'е')
    const filtered = chapters.filter((c) => {
      if (!q) return true
      const title = c.title.toLowerCase().replace(/ё/g, 'е')
      return title.includes(q) || String(c.number) === q || String(c.number).startsWith(q)
    })
    const map = new Map<number, ChapterMeta[]>()
    for (const c of filtered) {
      if (!map.has(c.volume)) map.set(c.volume, [])
      map.get(c.volume)!.push(c)
    }
    const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
    for (const [, list] of entries) list.sort((a, b) => a.number - b.number)
    if (desc) {
      entries.reverse()
      for (const [, list] of entries) list.reverse()
    }
    return entries
  }, [chapters, query, desc])

  const toggleVolume = (v: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  return (
    <div>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Номер или название главы"
            className="field h-10 rounded-full py-0 pl-10 text-sm"
          />
        </label>
        <button
          onClick={() => setDesc((d) => !d)}
          className="flex h-10 items-center gap-2 rounded-full border border-line/10 px-4 text-[13px] font-medium text-fg-2 transition-colors hover:border-line/20 hover:text-fg"
          title="Порядок глав"
        >
          <ArrowDownUp className="h-4 w-4" />
          <span className="max-sm:hidden">{desc ? 'Сначала новые' : 'По порядку'}</span>
        </button>
      </div>

      {volumes.length === 0 && <p className="py-10 text-center text-sm text-muted">Глав по такому запросу нет</p>}

      <div className="mt-4 space-y-4">
        {volumes.map(([volume, list]) => {
          const isCollapsed = collapsed.has(volume)
          const readInVolume = list.filter((c) => readSet.has(c.id)).length
          return (
            <div key={volume}>
              {(volumes.length > 1 || !compact) && (
                <button
                  onClick={() => toggleVolume(volume)}
                  className="sticky top-0 z-10 mb-1 flex w-full items-center gap-3 rounded-xl bg-bg/80 px-2 py-2 text-left backdrop-blur"
                >
                  <span className="font-display text-sm font-semibold">Том {volume}</span>
                  <span className="text-xs text-faint">
                    {list.length} гл.{readInVolume ? ` · прочитано ${readInVolume}` : ''}
                  </span>
                  <ChevronDown className={cn('ml-auto h-4 w-4 text-muted transition-transform', isCollapsed && '-rotate-90')} />
                </button>
              )}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    {list.map((c) => {
                      const read = readSet.has(c.id)
                      const current = c.id === currentId
                      return (
                        <li key={c.id}>
                          <Link
                            to={`/read/${novel.slug}/${c.id}`}
                            onClick={onNavigate}
                            className={cn(
                              'group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors',
                              current ? 'bg-accent/10' : 'hover:bg-line/[0.05]'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-1.5 font-display text-xs font-semibold tabular transition-colors',
                                current
                                  ? 'bg-ember text-white'
                                  : read
                                    ? 'bg-ok/10 text-ok'
                                    : 'bg-line/[0.06] text-fg-2 group-hover:bg-line/10'
                              )}
                            >
                              {String(c.number).replace('.', ',')}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  'block truncate text-sm font-medium transition-colors',
                                  read && !current ? 'text-muted' : 'text-fg',
                                  'group-hover:text-accent'
                                )}
                              >
                                {c.title || `Глава ${c.number}`}
                              </span>
                              {!compact && (
                                <span className="mt-0.5 block text-xs text-faint">
                                  {formatDate(c.createdAt)} · {readingMinutes(c.wordCount)} мин
                                </span>
                              )}
                            </span>
                            {!c.published && (
                              <span className="flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn">
                                <Lock className="h-3 w-3" /> черновик
                              </span>
                            )}
                            {current && <span className="text-[11px] font-semibold text-accent">вы здесь</span>}
                            {!current && isFresh(c.createdAt, 3) && (
                              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">new</span>
                            )}
                            {read && !current && <CircleCheck className="h-4 w-4 shrink-0 text-ok" />}
                          </Link>
                        </li>
                      )
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
