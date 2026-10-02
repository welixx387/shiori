import { WORDS_PER_MINUTE } from './constants'

/** Русское склонение: plural(5, ['глава', 'главы', 'глав']) → 'глав' */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function pluralize(n: number, forms: [string, string, string]): string {
  return `${formatNumber(n)} ${plural(n, forms)}`
}

const numberFormat = new Intl.NumberFormat('ru-RU')

export function formatNumber(n: number): string {
  return numberFormat.format(n)
}

/** 1 234 → «1,2 тыс.», 2 500 000 → «2,5 млн» */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const v = n / 1000
    return `${v < 10 ? v.toFixed(1).replace('.0', '') : Math.round(v)}`.replace('.', ',') + ' тыс.'
  }
  const v = n / 1_000_000
  return `${v < 10 ? v.toFixed(1).replace('.0', '') : Math.round(v)}`.replace('.', ',') + ' млн'
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return pluralize(minutes, ['минута', 'минуты', 'минут'])
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const dateYearFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return (sameYear ? dateFormat : dateYearFormat).format(d)
}

/** «только что», «5 минут назад», «вчера», «12 сентября» */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - then)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${pluralize(min, ['минуту', 'минуты', 'минут'])} назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${pluralize(h, ['час', 'часа', 'часов'])} назад`
  const d = Math.floor(h / 24)
  if (d === 1) return 'вчера'
  if (d < 7) return `${pluralize(d, ['день', 'дня', 'дней'])} назад`
  return formatDate(iso)
}

export function isFresh(iso: string | null | undefined, days = 3): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < days * 86400000
}

/** Ключ дня в локальном времени: 2026-10-02 */
export function dayKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function chapterLabel(c: { volume: number; number: number }, withVolume = true): string {
  const num = Number.isInteger(c.number) ? String(c.number) : String(c.number).replace('.', ',')
  return withVolume ? `Том ${c.volume} · Глава ${num}` : `Глава ${num}`
}

export function chapterShort(c: { volume: number; number: number }): string {
  const num = Number.isInteger(c.number) ? String(c.number) : String(c.number).replace('.', ',')
  return `Т${c.volume} Гл. ${num}`
}

export function ratingValue(n: { ratingSum: number; ratingCount: number }): number {
  return n.ratingCount ? n.ratingSum / n.ratingCount : 0
}

export function formatRating(n: { ratingSum: number; ratingCount: number }): string {
  const v = ratingValue(n)
  return v ? v.toFixed(1).replace('.', ',') : '—'
}
