import { motion } from 'framer-motion'
import { Lock, Table2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { dayKey, formatDate, plural } from '../../lib/format'
import type { Achievement } from '../../lib/stats'

/* Цвета графиков — одна шкала оттенка акцента (последовательная, светлее → насыщеннее).
   На тёмном фоне доля акцента растёт с величиной, поэтому больше = ярче. */
const HEAT_STEPS = [
  'rgb(var(--line) / 0.07)',
  'rgb(var(--accent) / 0.28)',
  'rgb(var(--accent) / 0.5)',
  'rgb(var(--accent) / 0.75)',
  'rgb(var(--accent) / 1)',
]
const HEAT_LABELS = ['нет', '1', '2–3', '4–6', '7+']

function heatLevel(n: number) {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n <= 3) return 2
  if (n <= 6) return 3
  return 4
}

const WEEKDAYS = ['Пн', '', 'Ср', '', 'Пт', '', '']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })

/** Календарь активности за последние недели: одна клетка — один день. */
export function ActivityHeatmap({ byDay }: { byDay: Map<string, number> }) {
  const [weeks] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 52 : 26))
  const [hover, setHover] = useState<{ x: number; y: number; date: Date; value: number } | null>(null)
  const [table, setTable] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(() => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const end = new Date(today)
    const shift = (end.getDay() + 6) % 7 // понедельник = 0
    end.setDate(end.getDate() + (6 - shift))
    const start = new Date(end)
    start.setDate(start.getDate() - weeks * 7 + 1)
    const cols: { date: Date; value: number; future: boolean }[][] = []
    const cursor = new Date(start)
    for (let w = 0; w < weeks; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        col.push({ date: new Date(cursor), value: byDay.get(dayKey(cursor)) ?? 0, future: cursor > today })
        cursor.setDate(cursor.getDate() + 1)
      }
      cols.push(col)
    }
    return cols
  }, [byDay, weeks])

  const active = useMemo(
    () =>
      [...byDay.entries()]
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 30),
    [byDay]
  )

  const total = [...byDay.values()].reduce((a, b) => a + b, 0)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{total}</span> {plural(total, ['глава', 'главы', 'глав'])} за последние {weeks} недель
        </p>
        <button
          onClick={() => setTable((t) => !t)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line/10 px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-line/25 hover:text-fg"
          aria-pressed={table}
        >
          <Table2 className="h-3.5 w-3.5" />
          {table ? 'Календарь' : 'Таблицей'}
        </button>
      </div>

      {table ? (
        active.length ? (
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-line/[0.08]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">День</th>
                  <th className="px-4 py-2 text-right font-medium">Глав прочитано</th>
                </tr>
              </thead>
              <tbody>
                {active.map(([k, v]) => (
                  <tr key={k} className="border-t border-line/[0.06]">
                    <td className="px-4 py-2 text-fg-2">{formatDate(`${k}T12:00:00`)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-muted">Пока нет прочитанных глав</p>
        )
      ) : (
        <div ref={wrapRef} className="relative">
          <div className="scrollbar-none overflow-x-auto pb-1">
            <div className="grid min-w-[22rem] gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <span />
              <div className="grid h-5 gap-[3px] text-[10px] text-faint" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
                {columns.map((col, i) => (
                  <span key={i} className="relative">
                    {col[0].date.getDate() <= 7 && <span className="absolute left-0 whitespace-nowrap">{MONTHS[col[0].date.getMonth()]}</span>}
                  </span>
                ))}
              </div>
              <div className="grid gap-[3px] text-[10px] text-faint" style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}>
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="flex items-center leading-none">
                    {d}
                  </span>
                ))}
              </div>
              <div
                className="grid grid-flow-col gap-[3px]"
                style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)' }}
                role="img"
                aria-label="Календарь чтения по дням"
              >
                {columns.flat().map((cell) => {
                  const lvl = heatLevel(cell.value)
                  return (
                    <span
                      key={cell.date.toISOString()}
                      onPointerEnter={(e) => {
                        if (cell.future) return
                        const r = (e.target as HTMLElement).getBoundingClientRect()
                        const box = wrapRef.current!.getBoundingClientRect()
                        setHover({ x: r.left - box.left + r.width / 2, y: r.top - box.top, date: cell.date, value: cell.value })
                      }}
                      onPointerLeave={() => setHover(null)}
                      className={cn(
                        'aspect-square max-h-[18px] w-full rounded-[3px] transition-transform duration-150',
                        !cell.future && 'hover:scale-125 hover:ring-2 hover:ring-fg/40',
                        cell.future && 'opacity-0'
                      )}
                      style={{ background: HEAT_STEPS[lvl] }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-line/10 bg-surface-3 px-3 py-2 text-xs shadow-float"
              style={{ left: hover.x, top: hover.y - 8 }}
            >
              <p className="font-semibold text-fg">
                {hover.value ? `${hover.value} ${plural(hover.value, ['глава', 'главы', 'глав'])}` : 'Без чтения'}
              </p>
              <p className="text-muted">
                {formatDate(hover.date.toISOString())}, {weekdayFormat.format(hover.date)}
              </p>
            </div>
          )}
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted">
            <span>Меньше</span>
            {HEAT_STEPS.map((c, i) => (
              <span key={i} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: c }} title={`${HEAT_LABELS[i]} глав`} />
            ))}
            <span>Больше · глав в день</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Горизонтальные полосы: сколько глав прочитано в каждом жанре. Одна серия — один цвет. */
export function GenreBars({ genres, unit }: { genres: { name: string; count: number }[]; unit: 'chapters' | 'titles' }) {
  const top = genres.slice(0, 6)
  const max = Math.max(1, ...top.map((g) => g.count))
  const forms: [string, string, string] = unit === 'chapters' ? ['глава', 'главы', 'глав'] : ['тайтл', 'тайтла', 'тайтлов']
  if (!top.length) {
    return <p className="rounded-2xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-muted">Начните читать — и здесь появятся ваши любимые жанры</p>
  }
  return (
    <ul className="space-y-3.5">
      {top.map((g, i) => (
        <li key={g.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
          <span className="truncate text-fg-2">{g.name}</span>
          <span className="flex items-center gap-2.5">
            <motion.span
              className="h-3 rounded-r-[4px] bg-accent"
              initial={{ width: 0 }}
              whileInView={{ width: `${(g.count / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxWidth: 'calc(100% - 4.5rem)' }}
              title={`${g.name}: ${g.count}`}
            />
            <span className="shrink-0 text-xs font-semibold text-fg tabular">
              {g.count} <span className="font-normal text-muted">{plural(g.count, forms)}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StatTile({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line/[0.08] bg-surface/60 p-5">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  )
}

/** Шкала опыта: заливка акцентом, дорожка — тот же оттенок, только прозрачнее. */
export function LevelMeter({ xp, from, to, className }: { xp: number; from: number; to: number; className?: string }) {
  const fraction = Math.min(1, (xp - from) / Math.max(1, to - from))
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-white/20', className)}>
      <motion.div
        className="h-full rounded-full bg-white"
        initial={{ width: 0 }}
        animate={{ width: `${fraction * 100}%` }}
        transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function AchievementBadge({ a, index = 0 }: { a: Achievement; index?: number }) {
  const Icon = a.icon
  const fraction = Math.min(1, a.value / a.target)
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative overflow-hidden rounded-3xl border p-5 transition-transform duration-300 hover:-translate-y-1',
        a.unlocked ? 'border-line/10 bg-surface/70' : 'border-line/[0.06] bg-surface/30'
      )}
    >
      {a.unlocked && (
        <span
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-40 blur-2xl"
          style={{ background: `hsl(${a.hue} 90% 60%)` }}
        />
      )}
      <span
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-2xl',
          a.unlocked ? 'text-white shadow-lg' : 'bg-line/[0.06] text-faint'
        )}
        style={
          a.unlocked
            ? { background: `linear-gradient(135deg, hsl(${a.hue} 85% 62%), hsl(${a.hue + 40} 80% 50%))` }
            : undefined
        }
      >
        {a.unlocked ? <Icon className="h-7 w-7" /> : <Lock className="h-6 w-6" />}
        {a.unlocked && <span className="btn-shine absolute inset-0 rounded-2xl" />}
      </span>
      <p className={cn('relative mt-4 font-semibold', !a.unlocked && 'text-fg-2')}>{a.title}</p>
      <p className="relative mt-1 text-[13px] leading-snug text-muted">{a.description}</p>
      {!a.unlocked && (
        <div className="relative mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-faint">
            <span>прогресс</span>
            <span className="tabular">
              {Math.min(a.value, a.target).toLocaleString('ru-RU')} / {a.target.toLocaleString('ru-RU')}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line/10">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${fraction * 100}%` }} />
          </div>
        </div>
      )}
    </motion.div>
  )
}
