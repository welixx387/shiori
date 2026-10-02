/**
 * Формат текста глав — обычный текст с лёгкой разметкой:
 *   • каждая непустая строка — абзац;
 *   • строка из «***», «* * *», «---» или «⁂» — разрыв сцены;
 *   • «> текст» — цитата / письмо / записка;
 *   • «# Заголовок» — подзаголовок внутри главы;
 *   • «![подпись](https://…)» — иллюстрация;
 *   • *курсив*, _курсив_ и **жирный** внутри абзаца.
 */

export type Block =
  | { type: 'p'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'h'; text: string }
  | { type: 'break' }
  | { type: 'img'; src: string; alt: string }

const BREAK_RE = /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:~\s*){3,}|(?:=\s*){3,}|⁂|◇+|◆+|#\s*#\s*#|§)$/
const IMG_RE = /^!\[([^\]]*)\]\((\S+?)\)$/
const QUOTE_RE = /^>\s?(.*)$/
const H_RE = /^#{1,3}\s+(.+)$/

export function parseContent(content: string): Block[] {
  const blocks: Block[] = []
  for (const raw of content.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (BREAK_RE.test(line)) {
      if (blocks.length && blocks[blocks.length - 1].type !== 'break') blocks.push({ type: 'break' })
      continue
    }
    const img = line.match(IMG_RE)
    if (img) {
      blocks.push({ type: 'img', alt: img[1], src: img[2] })
      continue
    }
    const quote = line.match(QUOTE_RE)
    if (quote) {
      if (quote[1].trim()) blocks.push({ type: 'quote', text: quote[1].trim() })
      continue
    }
    const h = line.match(H_RE)
    if (h) {
      blocks.push({ type: 'h', text: h[1].trim() })
      continue
    }
    blocks.push({ type: 'p', text: line })
  }
  while (blocks.length && blocks[blocks.length - 1].type === 'break') blocks.pop()
  return blocks
}

export interface InlineSegment {
  text: string
  bold?: boolean
  italic?: boolean
}

const INLINE_RE = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*|_[^_\s][^_\n]*?_)/g

export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = []
  let last = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0
    if (index > last) out.push({ text: text.slice(last, index) })
    const token = m[0]
    if (token.startsWith('**')) out.push({ text: token.slice(2, -2), bold: true })
    else out.push({ text: token.slice(1, -1), italic: true })
    last = index + token.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** Текст без разметки — для цитат-закладок, озвучки и поиска. */
export function plainText(text: string): string {
  return text.replace(/\*\*|__|\*|_/g, '').replace(/^>\s?/, '')
}

const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0
}

// ───────────────────────── Разбивка большого текста на главы ─────────────────────────

export type SplitMode = 'headings' | 'numbered' | 'separator' | 'regex' | 'words'

export interface SplitOptions {
  mode: SplitMode
  pattern?: string
  wordsPerChapter?: number
}

export interface SplitPart {
  title: string
  content: string
  words: number
  /** Номер, найденный в заголовке («Глава 12» → 12), если есть */
  number: number | null
}

// После кириллических слов \\b в JS не работает, поэтому граница слова — через lookahead.
const WORD_END = '(?=$|[\\s.:!?,)—–-])'

export const HEADING_PATTERN =
  '^\\s*(?:(?:глава|часть|chapter|ch\\.|эпизод|арка|episode)\\s*(?:\\d+(?:[.,]\\d+)?|[ivxlcdm]+)' +
  WORD_END +
  '.*|(?:пролог|эпилог|интерлюдия|послесловие|предисловие|экстра|бонус|prologue|epilogue|interlude|afterword|extra)' +
  WORD_END +
  '.*)$'

const NUMBERED_PATTERN = '^\\s*\\d{1,4}\\s*[.)]\\s+\\S.{0,80}$'

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

function romanToInt(s: string): number | null {
  const str = s.toLowerCase()
  if (!/^[ivxlcdm]+$/.test(str)) return null
  let total = 0
  for (let i = 0; i < str.length; i++) {
    const cur = ROMAN[str[i]]
    const next = ROMAN[str[i + 1]] ?? 0
    total += cur < next ? -cur : cur
  }
  return total || null
}

/** «Глава 12. Возвращение» → { number: 12, title: «Возвращение» } */
export function parseHeading(line: string): { number: number | null; title: string } {
  const text = line.trim().replace(/\s+/g, ' ')
  // Римские цифры принимаем только после слова «Глава»/«Chapter», иначе «Mid» стало бы числом.
  const m = text.match(
    /^(?:(?:глава|часть|chapter|ch\.|эпизод|арка|episode)\s*(\d+(?:[.,]\d+)?|[ivxlcdm]+)|(\d+(?:[.,]\d+)?))(?=$|[\s.:!?,)\-—–])\s*[.:)\-—–]*\s*(.*)$/i
  )
  if (m) {
    const raw = m[1] ?? m[2]
    const number = /\d/.test(raw) ? Number(raw.replace(',', '.')) : romanToInt(raw)
    if (number !== null && !Number.isNaN(number)) {
      return { number, title: m[3].trim() }
    }
  }
  return { number: null, title: text }
}

function makePart(title: string, lines: string[], number: number | null): SplitPart {
  const content = lines.join('\n').replace(/^\s+|\s+$/g, '')
  return { title, content, words: countWords(content), number }
}

export function splitIntoChapters(text: string, options: SplitOptions): SplitPart[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  if (options.mode === 'words') {
    const limit = Math.max(300, options.wordsPerChapter ?? 3000)
    const parts: SplitPart[] = []
    let buf: string[] = []
    let words = 0
    for (const line of lines) {
      buf.push(line)
      words += countWords(line)
      if (words >= limit && line.trim() === '') {
        parts.push(makePart(`Часть ${parts.length + 1}`, buf, null))
        buf = []
        words = 0
      } else if (words >= limit * 1.25) {
        parts.push(makePart(`Часть ${parts.length + 1}`, buf, null))
        buf = []
        words = 0
      }
    }
    if (buf.join('').trim()) parts.push(makePart(`Часть ${parts.length + 1}`, buf, null))
    return parts.filter((p) => p.words > 0)
  }

  let re: RegExp
  try {
    const source =
      options.mode === 'headings'
        ? HEADING_PATTERN
        : options.mode === 'numbered'
          ? NUMBERED_PATTERN
          : options.mode === 'separator'
            ? '^\\s*(?:(?:\\*\\s*){3,}|(?:-\\s*){3,}|(?:=\\s*){3,}|⁂)\\s*$'
            : options.pattern || HEADING_PATTERN
    re = new RegExp(source, 'iu')
  } catch {
    return []
  }

  const parts: SplitPart[] = []
  let currentTitle: string | null = null
  let currentNumber: number | null = null
  let buf: string[] = []

  const flush = () => {
    const part = makePart(currentTitle ?? 'Вступление', buf, currentNumber)
    if (part.words > 0 || currentTitle) parts.push(part)
    buf = []
  }

  for (const line of lines) {
    if (line.trim() && line.trim().length <= 120 && re.test(line)) {
      flush()
      if (options.mode === 'separator') {
        currentTitle = `Часть ${parts.length + 1}`
        currentNumber = null
      } else {
        const h = parseHeading(line)
        currentNumber = h.number
        currentTitle = h.title || line.trim()
      }
      continue
    }
    buf.push(line)
  }
  flush()

  if (options.mode === 'separator' && parts.length) {
    parts.forEach((p, i) => (p.title = `Часть ${i + 1}`))
  }
  return parts.filter((p) => p.words > 0 || p.title)
}

// ───────────────────────── Импорт файлов ─────────────────────────

/** Читает .txt в UTF-8, а если не выходит — в Windows-1251 (частый случай для русских текстов). */
export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1251').decode(buffer)
  }
}

/** Разбирает FB2: каждая «листовая» секция становится главой. */
export function parseFb2(xml: string): { title: string; author: string; parts: SplitPart[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

  const titleInfo = doc.querySelector('description > title-info')
  const bookTitle = textOf(titleInfo?.querySelector('book-title'))
  const authorEl = titleInfo?.querySelector('author')
  const author = authorEl
    ? [
        textOf(authorEl.querySelector('first-name')),
        textOf(authorEl.querySelector('last-name')),
      ]
        .filter(Boolean)
        .join(' ') || textOf(authorEl.querySelector('nickname'))
    : ''

  const body = doc.querySelector('body:not([name="notes"])') ?? doc.querySelector('body')
  const sections = body ? Array.from(body.querySelectorAll('section')) : []
  const leaves = sections.filter((s) => !s.querySelector('section'))

  const blockToLines = (el: Element, out: string[]) => {
    for (const child of Array.from(el.children)) {
      const tag = child.localName
      if (tag === 'title') continue
      if (tag === 'p') out.push(textOf(child))
      else if (tag === 'empty-line') out.push('')
      else if (tag === 'subtitle') out.push(`# ${textOf(child)}`)
      else if (tag === 'epigraph' || tag === 'cite') {
        for (const p of Array.from(child.querySelectorAll('p, v'))) out.push(`> ${textOf(p)}`)
      } else if (tag === 'poem') {
        for (const v of Array.from(child.querySelectorAll('v'))) out.push(`> ${textOf(v)}`)
      } else if (tag !== 'image' && tag !== 'section') blockToLines(child, out)
    }
  }

  const parts: SplitPart[] = leaves.map((section, i) => {
    const titleEl = Array.from(section.children).find((c) => c.localName === 'title')
    const rawTitle = textOf(titleEl) || `Часть ${i + 1}`
    const h = parseHeading(rawTitle)
    const lines: string[] = []
    blockToLines(section, lines)
    return makePart(h.title || rawTitle, lines, h.number)
  })

  return { title: bookTitle, author, parts: parts.filter((p) => p.words > 0) }
}
