import {
  Award,
  BookOpen,
  Bookmark,
  Crown,
  Flame,
  Gem,
  Library,
  Moon,
  Star,
  Sunrise,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Novel, UserData } from '../types'
import { WORDS_PER_MINUTE } from './constants'
import { dayKey } from './format'

export interface ReaderStats {
  chapters: number
  words: number
  minutes: number
  streak: number
  bestStreak: number
  activeDays: number
  byDay: Map<string, number>
  maxPerDay: number
  genres: { name: string; count: number }[]
  nightReads: number
  morningReads: number
  library: number
  completed: number
  favorites: number
  ratings: number
  bookmarks: number
  xp: number
  level: number
  levelTitle: string
  levelFrom: number
  levelTo: number
}

const LEVEL_TITLES: [number, string][] = [
  [1, 'Новичок'],
  [2, 'Любопытный читатель'],
  [3, 'Книжный странник'],
  [5, 'Хранитель закладок'],
  [7, 'Ночной библиофил'],
  [10, 'Мастер томов'],
  [14, 'Легенда библиотеки'],
]

/** Порог уровня n: 0, 100, 300, 600, 1000… */
export const levelThreshold = (n: number) => 50 * n * (n - 1)

export function levelFor(xp: number) {
  let level = 1
  while (levelThreshold(level + 1) <= xp) level++
  const title = [...LEVEL_TITLES].reverse().find(([l]) => level >= l)?.[1] ?? LEVEL_TITLES[0][1]
  return { level, title, from: levelThreshold(level), to: levelThreshold(level + 1) }
}

function streaks(days: Set<string>) {
  const today = new Date()
  const cursor = new Date(today)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let current = 0
  while (days.has(dayKey(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }
  const sorted = [...days].sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const k of sorted) {
    const d = new Date(`${k}T12:00:00`)
    run = prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current, best: Math.max(best, current) }
}

export function computeStats(data: UserData, novels: Map<string, Novel>): ReaderStats {
  const byDay = new Map<string, number>()
  const genreCount = new Map<string, number>()
  let words = 0
  let nightReads = 0
  let morningReads = 0
  for (const r of data.reads) {
    const d = new Date(r.readAt)
    const key = dayKey(d)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
    words += r.words
    const h = d.getHours()
    if (h < 5) nightReads++
    else if (h >= 5 && h < 8) morningReads++
    for (const g of novels.get(r.novelId)?.genres ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
  }
  // Пока ничего не прочитано — любимые жанры считаем по библиотеке.
  if (!data.reads.length) {
    for (const l of data.library) for (const g of novels.get(l.novelId)?.genres ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
  }
  const { current, best } = streaks(new Set(byDay.keys()))
  const completed = data.library.filter((l) => l.shelf === 'completed').length
  const xp =
    data.reads.length * 10 + completed * 40 + data.ratings.length * 5 + data.bookmarks.length * 3 + byDay.size * 5
  const lvl = levelFor(xp)
  return {
    chapters: data.reads.length,
    words,
    minutes: Math.round(words / WORDS_PER_MINUTE),
    streak: current,
    bestStreak: best,
    activeDays: byDay.size,
    byDay,
    maxPerDay: Math.max(0, ...byDay.values()),
    genres: [...genreCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    nightReads,
    morningReads,
    library: data.library.filter((l) => l.shelf).length,
    completed,
    favorites: data.library.filter((l) => l.favorite).length,
    ratings: data.ratings.length,
    bookmarks: data.bookmarks.length,
    xp,
    level: lvl.level,
    levelTitle: lvl.title,
    levelFrom: lvl.from,
    levelTo: lvl.to,
  }
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: LucideIcon
  hue: number
  value: number
  target: number
  unlocked: boolean
}

export function computeAchievements(s: ReaderStats): Achievement[] {
  const list: Omit<Achievement, 'unlocked'>[] = [
    { id: 'first', title: 'Первые строки', description: 'Дочитать первую главу', icon: BookOpen, hue: 14, value: s.chapters, target: 1 },
    { id: 'worm', title: 'Книжный червь', description: 'Прочитать 25 глав', icon: Zap, hue: 42, value: s.chapters, target: 25 },
    { id: 'hundred', title: 'Сотня', description: 'Прочитать 100 глав', icon: Trophy, hue: 48, value: s.chapters, target: 100 },
    { id: 'owl', title: 'Ночная сова', description: 'Читать между полуночью и пятью утра', icon: Moon, hue: 252, value: s.nightReads, target: 1 },
    { id: 'lark', title: 'Ранняя пташка', description: 'Дочитать главу до восьми утра', icon: Sunrise, hue: 28, value: s.morningReads, target: 1 },
    { id: 'marathon', title: 'Марафонец', description: '10 глав за один день', icon: Flame, hue: 4, value: s.maxPerDay, target: 10 },
    { id: 'week', title: 'Неделя у страниц', description: 'Читать 7 дней подряд', icon: Award, hue: 330, value: s.bestStreak, target: 7 },
    { id: 'collector', title: 'Коллекционер', description: 'Собрать 10 тайтлов на полках', icon: Library, hue: 190, value: s.library, target: 10 },
    { id: 'finisher', title: 'До последней строки', description: 'Отметить тайтл прочитанным', icon: Crown, hue: 280, value: s.completed, target: 1 },
    { id: 'critic', title: 'Критик', description: 'Оценить 5 тайтлов', icon: Star, hue: 46, value: s.ratings, target: 5 },
    { id: 'quotes', title: 'Цитатник', description: 'Сохранить 5 закладок', icon: Bookmark, hue: 160, value: s.bookmarks, target: 5 },
    { id: 'words', title: 'Сто тысяч слов', description: 'Прочитать 100 000 слов', icon: Gem, hue: 300, value: s.words, target: 100_000 },
  ]
  return list.map((a) => ({ ...a, unlocked: a.value >= a.target }))
}
