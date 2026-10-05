import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownWideNarrow, LayoutGrid, Rows3, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Highlighted } from '../components/layout/CommandPalette'
import { NovelCardSkeleton, NovelGrid, NovelRow } from '../components/novel/NovelCard'
import { Button } from '../components/ui/Button'
import { Chip, Segmented } from '../components/ui/Controls'
import { EmptyState } from '../components/ui/Feedback'
import { Sheet } from '../components/ui/Overlay'
import { Container } from '../components/ui/Section'
import { AGE_RATINGS, COUNTRIES, GENRES, STATUSES, STATUS_ORDER } from '../lib/constants'
import { cn } from '../lib/cn'
import { plural } from '../lib/format'
import { useNovels } from '../lib/queries'
import { searchNovels, suggestTitle } from '../lib/search'
import { usePrefs } from '../store/prefs'
import type { Novel, NovelStatus } from '../types'

type Sort = 'relevance' | 'popular' | 'rating' | 'updated' | 'new' | 'alpha' | 'chapters'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'relevance', label: 'По релевантности' },
  { value: 'popular', label: 'Популярные' },
  { value: 'rating', label: 'По оценкам' },
  { value: 'updated', label: 'Недавно обновлённые' },
  { value: 'new', label: 'Новые в каталоге' },
  { value: 'alpha', label: 'По алфавиту' },
  { value: 'chapters', label: 'Больше глав' },
]

const EXAMPLES = ['маяк', 'драконы', 'временная петля', 'mayak', 'vfzr', 'ёкаи', 'космос', 'Пак Сорин']

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

function useFilters() {
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') ?? '',
    genres: list(params.get('genres')),
    exclude: list(params.get('exclude')),
    status: list(params.get('status')) as NovelStatus[],
    country: list(params.get('country')),
    age: list(params.get('age')),
    sort: (params.get('sort') as Sort | null) ?? null,
  }
  const update = (patch: Partial<Record<keyof typeof filters, string | string[] | null>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          const value = Array.isArray(v) ? v.join(',') : v
          if (value) next.set(k, value)
          else next.delete(k)
        }
        return next
      },
      { replace: true }
    )
  }
  const reset = () => setParams(filters.q ? { q: filters.q } : {}, { replace: true })
  const activeCount =
    filters.genres.length + filters.exclude.length + filters.status.length + filters.country.length + filters.age.length
  return { filters, update, reset, activeCount }
}

function applyFilters(novels: Novel[], f: ReturnType<typeof useFilters>['filters']) {
  return novels.filter(
    (n) =>
      f.genres.every((g) => n.genres.includes(g)) &&
      !f.exclude.some((g) => n.genres.includes(g)) &&
      (!f.status.length || f.status.includes(n.status)) &&
      (!f.country.length || f.country.includes(n.country)) &&
      (!f.age.length || f.age.includes(n.ageRating))
  )
}

function sortNovels(novels: Novel[], sort: Sort) {
  const arr = [...novels]
  const rating = (n: Novel) => (n.ratingCount ? n.ratingSum / n.ratingCount : 0)
  switch (sort) {
    case 'popular':
      return arr.sort((a, b) => b.views - a.views)
    case 'rating':
      return arr.sort((a, b) => rating(b) - rating(a) || b.ratingCount - a.ratingCount)
    case 'updated':
      return arr.sort((a, b) => (b.lastChapterAt ?? b.createdAt).localeCompare(a.lastChapterAt ?? a.createdAt))
    case 'new':
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'alpha':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    case 'chapters':
      return arr.sort((a, b) => b.chaptersCount - a.chaptersCount)
    default:
      return arr
  }
}

/** Плейсхолдер, который сам «печатает» примеры запросов. */
function TypingHint({ hidden }: { hidden: boolean }) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  useEffect(() => {
    const word = EXAMPLES[index % EXAMPLES.length]
    let i = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (!deleting) {
        i++
        setText(word.slice(0, i))
        if (i === word.length) {
          deleting = true
          timer = setTimeout(tick, 1600)
          return
        }
      } else {
        i--
        setText(word.slice(0, i))
        if (i === 0) {
          setIndex((x) => x + 1)
          return
        }
      }
      timer = setTimeout(tick, deleting ? 40 : 90)
    }
    timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
  }, [index])
  if (hidden) return null
  return (
    <span className="pointer-events-none absolute left-14 top-1/2 -translate-y-1/2 text-base text-faint sm:text-lg">
      Например: «{text}
      <span className="animate-blink text-accent">|</span>»
    </span>
  )
}

function GenreChip({ name, state, onClick }: { name: string; state: 'on' | 'off' | 'ex'; onClick: () => void }) {
  const g = GENRES.find((x) => x.name === name)
  const Icon = g?.icon
  return (
    <Chip
      active={state !== 'off'}
      tone={state === 'ex' ? 'danger' : 'accent'}
      onClick={onClick}
      className={cn('text-[13px]', state === 'ex' && 'line-through decoration-2')}
      icon={Icon && <Icon className="h-3.5 w-3.5" style={state === 'off' ? { color: `hsl(${g!.hue} 80% 62%)` } : undefined} />}
    >
      {name}
    </Chip>
  )
}

function FiltersPanel({ filters: f, update, reset, activeCount }: ReturnType<typeof useFilters>) {
  const toggle = (key: 'status' | 'country' | 'age', value: string) => {
    const cur = f[key] as string[]
    update({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] })
  }
  const cycleGenre = (name: string) => {
    if (f.genres.includes(name)) {
      update({ genres: f.genres.filter((x) => x !== name), exclude: [...f.exclude, name] })
    } else if (f.exclude.includes(name)) {
      update({ exclude: f.exclude.filter((x) => x !== name) })
    } else {
      update({ genres: [...f.genres, name] })
    }
  }
  return (
    <div className="space-y-7">
      <div>
        <p className="kicker mb-3">Статус</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <Chip key={s} active={f.status.includes(s)} onClick={() => toggle('status', s)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUSES[s].dot)} />
              {STATUSES[s].label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="kicker">Жанры</p>
        <p className="mb-3 mt-1 text-[11.5px] text-faint">Повторный клик исключает жанр</p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <GenreChip
              key={g.name}
              name={g.name}
              state={f.genres.includes(g.name) ? 'on' : f.exclude.includes(g.name) ? 'ex' : 'off'}
              onClick={() => cycleGenre(g.name)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="kicker mb-3">Страна</p>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => (
            <Chip key={c} active={f.country.includes(c)} onClick={() => toggle('country', c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="kicker mb-3">Возрастной рейтинг</p>
        <div className="flex flex-wrap gap-2">
          {AGE_RATINGS.map((a) => (
            <Chip key={a} active={f.age.includes(a)} onClick={() => toggle('age', a)}>
              {a}
            </Chip>
          ))}
        </div>
      </div>
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={reset} icon={<X className="h-4 w-4" />}>
          Сбросить фильтры ({activeCount})
        </Button>
      )}
    </div>
  )
}

export default function Catalog() {
  const state = useFilters()
  const { filters: f, update, reset, activeCount } = state
  const { data: novels, isLoading } = useNovels()
  const view = usePrefs((s) => s.catalogView)
  const setView = usePrefs((s) => s.setCatalogView)
  const addRecent = usePrefs((s) => s.addRecentSearch)
  const [query, setQuery] = useState(f.q)
  const [focused, setFocused] = useState(false)
  const [sheet, setSheet] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Поле ввода обновляет URL с небольшой задержкой — без лишних перерисовок на каждую букву.
  useEffect(() => {
    const t = setTimeout(() => {
      if (query !== f.q) update({ q: query.trim() ? query : null })
    }, 180)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => setQuery(f.q), [f.q])

  const sort: Sort = f.sort ?? (f.q ? 'relevance' : 'popular')

  const results = useMemo(() => {
    if (!novels) return []
    const filtered = applyFilters(novels, f)
    if (f.q && sort === 'relevance') return searchNovels(filtered, f.q).map((h) => h.novel)
    const matched = f.q ? searchNovels(filtered, f.q).map((h) => h.novel) : filtered
    return sortNovels(matched, sort)
  }, [novels, f, sort])

  const suggestion = useMemo(
    () => (novels && f.q && !results.length ? suggestTitle(novels, f.q) : null),
    [novels, f.q, results.length]
  )

  const pills = [
    ...f.genres.map((g) => ({ key: `g-${g}`, label: g, onRemove: () => update({ genres: f.genres.filter((x) => x !== g) }) })),
    ...f.exclude.map((g) => ({ key: `e-${g}`, label: `без «${g}»`, onRemove: () => update({ exclude: f.exclude.filter((x) => x !== g) }) })),
    ...f.status.map((s) => ({ key: `s-${s}`, label: STATUSES[s].label, onRemove: () => update({ status: f.status.filter((x) => x !== s) }) })),
    ...f.country.map((c) => ({ key: `c-${c}`, label: c, onRemove: () => update({ country: f.country.filter((x) => x !== c) }) })),
    ...f.age.map((a) => ({ key: `a-${a}`, label: a, onRemove: () => update({ age: f.age.filter((x) => x !== a) }) })),
  ]

  return (
    <Container className="pt-28 sm:pt-32">
      <div className="relative">
        <p className="kicker">
          <span className="font-jp text-sm normal-case tracking-normal text-accent">探</span>
          Каталог
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">
          Найдите историю <span className="text-ember-animated">по душе</span>
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            addRecent(query)
            inputRef.current?.blur()
          }}
          className={cn(
            'group relative mt-7 flex items-center rounded-[28px] border bg-surface/70 transition-all duration-300',
            focused ? 'border-accent/50 shadow-glow' : 'border-line/10 hover:border-line/20'
          )}
        >
          <Search className={cn('absolute left-5 h-5 w-5 transition-colors', focused ? 'text-accent' : 'text-faint')} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              addRecent(query)
            }}
            type="search"
            aria-label="Поиск по каталогу"
            className="h-16 w-full rounded-[28px] bg-transparent pl-14 pr-14 text-base text-fg outline-none sm:h-[72px] sm:text-lg"
          />
          <TypingHint hidden={Boolean(query) || focused} />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full text-faint hover:bg-line/[0.07] hover:text-fg"
              aria-label="Очистить поиск"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
        <p className="mt-3 px-2 text-[12.5px] text-faint">
          Ищет по названию, альтернативным названиям, автору, жанрам и тегам. Прощает опечатки, понимает транслит и неверную раскладку.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-[28px] border border-line/[0.08] bg-surface/40 p-6">
            <FiltersPanel {...state} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-muted">
              {isLoading ? (
                'Загружаем каталог…'
              ) : (
                <>
                  <motion.span key={results.length} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="inline-block font-semibold text-fg tabular">
                    {results.length}
                  </motion.span>{' '}
                  {plural(results.length, ['тайтл', 'тайтла', 'тайтлов'])}
                  {f.q && (
                    <>
                      {' '}
                      по запросу «<span className="text-fg">{f.q}</span>»
                    </>
                  )}
                </>
              )}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="lg:hidden"
              icon={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() => setSheet(true)}
            >
              Фильтры{activeCount ? ` · ${activeCount}` : ''}
            </Button>
            <label className="relative">
              <ArrowDownWideNarrow className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <select
                value={sort}
                onChange={(e) => update({ sort: e.target.value === (f.q ? 'relevance' : 'popular') ? null : e.target.value })}
                className="h-9 cursor-pointer appearance-none rounded-full border border-line/10 bg-surface-2 pl-10 pr-4 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line/20"
                aria-label="Сортировка"
              >
                {SORTS.filter((s) => s.value !== 'relevance' || f.q).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: <span className="sr-only">Сетка</span>, icon: <LayoutGrid className="h-4 w-4" /> },
                { value: 'list', label: <span className="sr-only">Список</span>, icon: <Rows3 className="h-4 w-4" /> },
              ]}
            />
          </div>

          <AnimatePresence>
            {pills.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pt-4">
                  {pills.map((p) => (
                    <motion.button
                      key={p.key}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={p.onRemove}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
                      style={{ background: 'rgb(var(--accent) / 0.12)' }}
                    >
                      {p.label}
                      <X className="h-3.5 w-3.5" />
                    </motion.button>
                  ))}
                  <button onClick={reset} className="px-2 text-[13px] text-muted hover:text-fg">
                    Сбросить всё
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-7">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => (
                  <NovelCardSkeleton key={i} />
                ))}
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                kanji="空"
                title="Ничего не нашлось"
                description={
                  suggestion ? (
                    <>
                      Возможно, вы искали{' '}
                      <button className="font-semibold text-accent hover:underline" onClick={() => setQuery(suggestion.title)}>
                        «{suggestion.title}»
                      </button>
                      ?
                    </>
                  ) : (
                    'Попробуйте убрать часть фильтров или изменить запрос.'
                  )
                }
                action={
                  <Button
                    variant="secondary"
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={() => {
                      setQuery('')
                      reset()
                      update({ q: null })
                    }}
                  >
                    Показать весь каталог
                  </Button>
                }
              />
            ) : view === 'grid' ? (
              <NovelGrid novels={results} className="sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" />
            ) : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {results.map((n, i) => (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, delay: Math.min(i, 10) * 0.03 }}
                    >
                      <NovelRow novel={n} highlightTitle={f.q ? <Highlighted text={n.title} query={f.q} /> : undefined} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Фильтры" side="right">
        <FiltersPanel {...state} />
        <Button variant="primary" className="mt-8 w-full" onClick={() => setSheet(false)}>
          Показать {results.length} {plural(results.length, ['тайтл', 'тайтла', 'тайтлов'])}
        </Button>
      </Sheet>
    </Container>
  )
}
