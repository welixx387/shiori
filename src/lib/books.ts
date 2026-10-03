import { strFromU8, unzipSync, type Unzipped } from 'fflate'
import { countWords, parseHeading, type SplitPart } from './text'

/**
 * Чтение книг для импорта глав: EPUB, DOCX и HTML.
 * Результат — либо готовые главы (parts), либо сплошной текст для обычной разбивки.
 */
export interface ParsedBook {
  title: string
  author: string
  /** Главы по структуре файла; пусто — делить текст как обычно */
  parts: SplitPart[]
  /** Весь текст — чтобы при желании разбить его по-своему */
  text: string
}

type Token = { kind: 'heading'; level: number; text: string } | { kind: 'line'; text: string }

const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'main', 'body', 'header', 'footer', 'aside', 'blockquote', 'ul', 'ol', 'li',
  'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'hr', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])
const SKIP = new Set(['script', 'style', 'head', 'nav', 'svg', 'img', 'image', 'figure', 'audio', 'video', 'noscript', 'rt', 'rp'])

const squash = (s: string) => s.replace(/[ \t ]+/g, ' ').trim()

/** Текст абзаца с курсивом и жирным в разметке Shiori; <br> → перевод строки. */
function inline(el: Node): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      out += (node.textContent ?? '').replace(/\s+/g, ' ')
      continue
    }
    if (node.nodeType !== 1) continue
    const child = node as Element
    const tag = child.localName.toLowerCase()
    if (SKIP.has(tag)) continue
    if (tag === 'br') out += '\n'
    else if (tag === 'em' || tag === 'i' || tag === 'cite') {
      const t = inline(child)
      out += t.trim() ? `*${t.trim()}* ` : t
    } else if (tag === 'strong' || tag === 'b') {
      const t = inline(child)
      out += t.trim() ? `**${t.trim()}** ` : t
    } else out += inline(child)
  }
  return out
}

function hasBlockChild(el: Element) {
  return Array.from(el.children).some((c) => BLOCK.has(c.localName.toLowerCase()))
}

function htmlTokens(root: Element, out: Token[] = []): Token[] {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 3) {
      const t = squash(node.textContent ?? '')
      if (t) out.push({ kind: 'line', text: t })
      continue
    }
    if (node.nodeType !== 1) continue
    const el = node as Element
    const tag = el.localName.toLowerCase()
    if (SKIP.has(tag)) continue
    if (/^h[1-6]$/.test(tag)) {
      const t = squash(el.textContent ?? '')
      if (t) out.push({ kind: 'heading', level: Number(tag[1]), text: t })
    } else if (tag === 'hr') {
      out.push({ kind: 'line', text: '***' })
    } else if (tag === 'br') {
      out.push({ kind: 'line', text: '' })
    } else if (tag === 'blockquote') {
      const inner = htmlTokens(el)
      for (const t of inner) if (t.text.trim()) out.push({ kind: 'line', text: `> ${t.text}` })
    } else if (BLOCK.has(tag) && hasBlockChild(el)) {
      htmlTokens(el, out)
    } else if (BLOCK.has(tag)) {
      for (const line of inline(el).split('\n')) {
        const t = squash(line)
        // Пустой абзац — это часто отбивка; сохраняем как пустую строку.
        out.push({ kind: 'line', text: t })
      }
    } else {
      const t = squash(inline(el))
      if (t) out.push({ kind: 'line', text: t })
    }
  }
  return out
}

function joinLines(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function makePart(title: string, lines: string[]): SplitPart {
  const content = joinLines(lines)
  const h = parseHeading(title)
  return { title: h.title || title, content, words: countWords(content), number: h.number }
}

/** Делит поток токенов по заголовкам верхнего уровня, если их хотя бы два. */
function partsByHeadings(tokens: Token[]): SplitPart[] {
  const levels = tokens.filter((t): t is Extract<Token, { kind: 'heading' }> => t.kind === 'heading').map((t) => t.level)
  const top = [1, 2, 3, 4, 5, 6].find((l) => levels.filter((x) => x === l).length >= 2)
  if (!top) return []
  const parts: SplitPart[] = []
  let title = ''
  let lines: string[] = []
  let started = false
  const flush = () => {
    if (started || joinLines(lines)) parts.push(makePart(title || 'Вступление', lines))
  }
  for (const t of tokens) {
    if (t.kind === 'heading' && t.level <= top) {
      flush()
      title = t.text
      lines = []
      started = true
    } else if (t.kind === 'heading') lines.push(`# ${t.text}`)
    else lines.push(t.text)
  }
  flush()
  return parts.filter((p) => p.words > 0)
}

function tokensToText(tokens: Token[]): string {
  return joinLines(tokens.flatMap((t) => (t.kind === 'heading' ? ['', t.text, ''] : [t.text])))
}

function parseXml(text: string, type: DOMParserSupportedType): Document {
  return new DOMParser().parseFromString(text, type)
}

function readEntry(zip: Unzipped, path: string): string | null {
  const entry = zip[path] ?? zip[Object.keys(zip).find((k) => k.toLowerCase() === path.toLowerCase()) ?? '']
  return entry ? strFromU8(entry) : null
}

function resolvePath(baseDir: string, href: string) {
  const out: string[] = []
  for (const p of (baseDir + decodeURIComponent(href.split('#')[0])).split('/')) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return out.join('/')
}

// ───────────────────────── EPUB ─────────────────────────

export function parseEpub(data: ArrayBuffer): ParsedBook {
  const zip = unzipSync(new Uint8Array(data))
  const container = readEntry(zip, 'META-INF/container.xml')
  if (!container) throw new Error('Это не EPUB: нет META-INF/container.xml')
  const opfPath = parseXml(container, 'application/xml').querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('В EPUB не найдено описание книги (OPF)')
  const opfText = readEntry(zip, opfPath)
  if (!opfText) throw new Error('Не удалось прочитать ' + opfPath)
  const opf = parseXml(opfText, 'application/xml')
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const meta = (name: string) => squash(opf.getElementsByTagName(name)[0]?.textContent ?? '')
  const title = meta('dc:title') || meta('title')
  const author = meta('dc:creator') || meta('creator')

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const item of Array.from(opf.getElementsByTagName('item'))) {
    manifest.set(item.getAttribute('id') ?? '', {
      href: item.getAttribute('href') ?? '',
      type: item.getAttribute('media-type') ?? '',
      props: item.getAttribute('properties') ?? '',
    })
  }
  const spine = Array.from(opf.getElementsByTagName('itemref'))
    .map((ref) => manifest.get(ref.getAttribute('idref') ?? ''))
    .filter((m): m is { href: string; type: string; props: string } => Boolean(m) && /html/i.test(m!.type) && !/\bnav\b/.test(m!.props))

  const parts: SplitPart[] = []
  const allTokens: Token[] = []
  spine.forEach((item, i) => {
    const raw = readEntry(zip, resolvePath(baseDir, item.href))
    if (!raw) return
    let doc = parseXml(raw, 'application/xhtml+xml')
    if (doc.getElementsByTagName('parsererror').length) doc = parseXml(raw, 'text/html')
    const body = doc.getElementsByTagName('body')[0]
    if (!body) return
    // Оглавление: почти весь текст — ссылки.
    const linkWords = countWords(Array.from(body.getElementsByTagName('a')).map((a) => a.textContent ?? '').join(' '))
    const totalWords = countWords(body.textContent ?? '')
    if (totalWords > 0 && linkWords / totalWords > 0.6) return

    const tokens = htmlTokens(body)
    allTokens.push(...tokens)
    const firstHeading = tokens.findIndex((t) => t.kind === 'heading')
    const docTitle = squash(doc.getElementsByTagName('title')[0]?.textContent ?? '')
    const partTitle = firstHeading >= 0 ? tokens[firstHeading].text : docTitle || `Часть ${i + 1}`
    const lines = tokens
      .filter((_, j) => j !== firstHeading)
      .map((t) => (t.kind === 'heading' ? `# ${t.text}` : t.text))
    const part = makePart(partTitle, lines)
    // Обложка, титульный лист и пустые страницы не нужны.
    if (part.words >= 20) parts.push(part)
  })
  if (!parts.length) throw new Error('В EPUB не нашлось текста глав')
  return { title, author, parts, text: tokensToText(allTokens) }
}

// ───────────────────────── DOCX ─────────────────────────

const HEADING_STYLE = /^(heading|заголовок|title|titre|überschrift)\s*(\d)?$/i

export function parseDocx(data: ArrayBuffer): ParsedBook {
  const zip = unzipSync(new Uint8Array(data))
  const xml = readEntry(zip, 'word/document.xml')
  if (!xml) throw new Error('Это не DOCX: нет word/document.xml')
  const doc = parseXml(xml, 'application/xml')
  const styles = readEntry(zip, 'word/styles.xml')
  // id стиля → название («Heading1» может называться «heading 1» или «Заголовок 1»)
  const styleNames = new Map<string, string>()
  if (styles) {
    for (const st of Array.from(parseXml(styles, 'application/xml').getElementsByTagName('w:style'))) {
      const id = st.getAttribute('w:styleId') ?? ''
      const name = st.getElementsByTagName('w:name')[0]?.getAttribute('w:val') ?? id
      styleNames.set(id, name)
    }
  }

  const tokens: Token[] = []
  for (const p of Array.from(doc.getElementsByTagName('w:p'))) {
    let text = ''
    for (const node of Array.from(p.getElementsByTagName('*'))) {
      const tag = node.tagName
      if (tag === 'w:t') text += node.textContent ?? ''
      else if (tag === 'w:tab') text += ' '
      else if (tag === 'w:br' || tag === 'w:cr') text += '\n'
    }
    const styleId = p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') ?? ''
    const styleName = (styleNames.get(styleId) ?? styleId).replace(/\s+/g, ' ').trim()
    const outline = p.getElementsByTagName('w:outlineLvl')[0]?.getAttribute('w:val')
    const m = HEADING_STYLE.exec(styleName.replace(/(\D)(\d)$/, '$1 $2'))
    const level = m ? Number(m[2] ?? 1) : outline !== undefined && outline !== null ? Number(outline) + 1 : 0
    const clean = squash(text.replace(/\n/g, ' '))
    if (level && clean) tokens.push({ kind: 'heading', level, text: clean })
    else for (const line of text.split('\n')) tokens.push({ kind: 'line', text: squash(line) })
  }

  const core = readEntry(zip, 'docProps/core.xml')
  const coreDoc = core ? parseXml(core, 'application/xml') : null
  const title = squash(coreDoc?.getElementsByTagName('dc:title')[0]?.textContent ?? '')
  const author = squash(coreDoc?.getElementsByTagName('dc:creator')[0]?.textContent ?? '')
  const text = tokensToText(tokens)
  if (!text) throw new Error('В документе нет текста')
  return { title, author, parts: partsByHeadings(tokens), text }
}

// ───────────────────────── HTML ─────────────────────────

export function parseHtml(html: string): ParsedBook {
  const doc = parseXml(html, 'text/html')
  const tokens = htmlTokens(doc.body ?? doc.documentElement)
  const text = tokensToText(tokens)
  if (!text) throw new Error('На странице нет текста')
  return { title: squash(doc.title ?? ''), author: '', parts: partsByHeadings(tokens), text }
}
