import type { Novel } from '../types'
import { switchLayout, transliterate } from './translit'

/**
 * Нечёткий поиск по каталогу, полностью на клиенте:
 *   • регистр и «ё/е» не важны;
 *   • находит по началу слова и по подстроке;
 *   • прощает опечатки (1–2 ошибки в зависимости от длины слова);
 *   • латиница ↔ кириллица («mayak» найдёт «маяк», «сайго» — «Saigo»);
 *   • исправляет неверную раскладку клавиатуры («vfzr» → «маяк»).
 */

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(input: string): string[] {
  return normalize(input).split(' ').filter(Boolean)
}

/** Расстояние Дамерау–Левенштейна (OSA) с ранним выходом. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2 = new Array(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    prev = cur
  }
  return prev[b.length]
}

function tokenScore(q: string, t: string): number {
  if (!q || !t) return 0
  if (t === q) return 1
  if (t.startsWith(q)) return 0.92 - Math.min(0.15, (t.length - q.length) * 0.01)
  if (q.length >= 3 && t.includes(q)) return 0.68
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1
    const d = Math.min(distance(q, t, max), distance(q, t.slice(0, q.length), max))
    if (d <= max) return 0.58 - d * 0.1
  }
  return 0
}

interface IndexedField {
  weight: number
  tokens: string[]
  latin: string[]
}

interface IndexedNovel {
  novel: Novel
  fields: IndexedField[]
  title: string
  titles: string[]
}

function field(text: string, weight: number): IndexedField {
  const tokens = tokenize(text)
  return { weight, tokens, latin: tokens.map(transliterate) }
}

const cache = new WeakMap<Novel[], IndexedNovel[]>()

function buildIndex(novels: Novel[]): IndexedNovel[] {
  const hit = cache.get(novels)
  if (hit) return hit
  const index = novels.map((novel) => ({
    novel,
    title: normalize(novel.title),
    titles: [novel.title, ...novel.altTitles].map(normalize),
    fields: [
      field(novel.title, 3),
      field(novel.altTitles.join(' '), 2.4),
      field(novel.author + ' ' + novel.illustrator, 1.6),
      field(novel.genres.join(' ') + ' ' + novel.tags.join(' '), 1.1),
      field(novel.description, 0.35),
    ],
  }))
  cache.set(novels, index)
  return index
}

function scoreTokens(entry: IndexedNovel, queryTokens: string[]): number {
  let total = 0
  for (const q of queryTokens) {
    const qLatin = transliterate(q)
    let best = 0
    for (const f of entry.fields) {
      for (let i = 0; i < f.tokens.length; i++) {
        const s = Math.max(tokenScore(q, f.tokens[i]), tokenScore(qLatin, f.latin[i]) * 0.95)
        const weighted = s * f.weight
        if (weighted > best) best = weighted
        if (best >= 3) break
      }
    }
    if (best === 0) return 0
    total += best
  }
  return total
}

export interface SearchHit {
  novel: Novel
  score: number
}

export function searchNovels(novels: Novel[], query: string): SearchHit[] {
  const q = normalize(query)
  if (!q) return novels.map((novel) => ({ novel, score: 0 }))
  const index = buildIndex(novels)

  const run = (text: string, factor: number) => {
    const tokens = tokenize(text)
    const hits: SearchHit[] = []
    for (const entry of index) {
      let score = scoreTokens(entry, tokens)
      if (!score) continue
      if (entry.titles.some((t) => t.startsWith(text))) score += 3
      else if (entry.titles.some((t) => t.includes(text))) score += 1.5
      hits.push({ novel: entry.novel, score: score * factor })
    }
    return hits
  }

  let hits = run(q, 1)
  const switched = switchLayout(query)
  if (switched) {
    const alt = run(normalize(switched), 0.9)
    const byId = new Map(hits.map((h) => [h.novel.id, h]))
    for (const h of alt) {
      const existing = byId.get(h.novel.id)
      if (!existing || existing.score < h.score) byId.set(h.novel.id, h)
    }
    hits = [...byId.values()]
  }
  return hits.sort((a, b) => b.score - a.score)
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

/** «Возможно, вы искали…» — ближайшее название по триграммам. */
export function suggestTitle(novels: Novel[], query: string): Novel | null {
  const q = normalize(query)
  if (q.length < 3) return null
  const qg = trigrams(q)
  let best: Novel | null = null
  let bestScore = 0
  for (const n of novels) {
    for (const t of [n.title, ...n.altTitles]) {
      const tg = trigrams(normalize(t))
      let inter = 0
      for (const g of qg) if (tg.has(g)) inter++
      const score = inter / (qg.size + tg.size - inter)
      if (score > bestScore) {
        bestScore = score
        best = n
      }
    }
  }
  return bestScore > 0.12 ? best : null
}

export interface HighlightPart {
  text: string
  match: boolean
}

/** Подсветка совпадений начала слов запроса в строке (с учётом ё/е). */
export function highlight(text: string, query: string): HighlightPart[] {
  const tokens = tokenize(query).filter((t) => t.length >= 1)
  if (!tokens.length) return [{ text, match: false }]
  const lower = text.toLowerCase().replace(/ё/g, 'е')
  const marks = new Array(text.length).fill(false)
  for (const t of tokens) {
    let from = 0
    while (from < lower.length) {
      const i = lower.indexOf(t, from)
      if (i === -1) break
      const boundary = i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1])
      if (boundary || t.length >= 3) for (let k = i; k < i + t.length; k++) marks[k] = true
      from = i + t.length
    }
  }
  const parts: HighlightPart[] = []
  for (let i = 0; i < text.length; i++) {
    const m = marks[i]
    const last = parts[parts.length - 1]
    if (last && last.match === m) last.text += text[i]
    else parts.push({ text: text[i], match: m })
  }
  return parts
}
