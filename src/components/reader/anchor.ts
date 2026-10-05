/**
 * Точное место в тексте главы: номер блока (абзаца) и смещение в символах.
 * Не зависит от шрифта, ширины экрана и режима чтения — поэтому закладки
 * и «продолжить с места» открывают ровно то место, где читатель остановился.
 */
export interface Anchor {
  block: number
  char: number
}

const blockSelector = (i: number) => `[data-block="${i}"]`

export function blockEl(root: ParentNode | null | undefined, i: number) {
  return root?.querySelector<HTMLElement>(blockSelector(i)) ?? null
}

function textLength(el: HTMLElement) {
  return el.textContent?.length ?? 0
}

/** Позиция в главе от 0 до 1 — так она хранится в прогрессе чтения. */
export function anchorToPosition(root: ParentNode | null, a: Anchor, totalBlocks: number) {
  if (totalBlocks <= 0) return 0
  const el = blockEl(root, a.block)
  const len = el ? textLength(el) : 0
  const within = len > 0 ? Math.min(1, a.char / len) : 0
  return Math.min(1, (a.block + within) / totalBlocks)
}

export function positionToAnchor(root: ParentNode | null, position: number, totalBlocks: number): Anchor {
  if (totalBlocks <= 0 || !(position > 0)) return { block: 0, char: 0 }
  // Небольшой запас вперёд: из-за округления позиция может оказаться на волосок раньше начала страницы.
  const exact = Math.min(totalBlocks - 1e-6, position * totalBlocks + 1e-7)
  const block = Math.floor(exact)
  const el = blockEl(root, block)
  const char = el ? Math.round((exact - block) * textLength(el)) : 0
  return { block, char }
}

/** Диапазон в один символ на заданном смещении внутри блока. */
export function rangeAt(el: HTMLElement, char: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let left = Math.max(0, char)
  let node = walker.nextNode() as Text | null
  let last: Text | null = null
  while (node) {
    const len = node.data.length
    if (left < len) {
      const range = document.createRange()
      range.setStart(node, left)
      range.setEnd(node, Math.min(len, left + 1))
      return range
    }
    left -= len
    last = node
    node = walker.nextNode() as Text | null
  }
  if (!last) return null
  const range = document.createRange()
  range.setStart(last, Math.max(0, last.data.length - 1))
  range.setEnd(last, last.data.length)
  return range
}

/** Прямоугольник символа на экране (с учётом сдвига страниц). */
export function rectAt(root: ParentNode | null, a: Anchor): DOMRect | null {
  const el = blockEl(root, a.block)
  if (!el) return null
  if (a.char > 0) {
    const r = rangeAt(el, a.char)
    const rect = r?.getClientRects()[0]
    if (rect && (rect.width || rect.height)) return rect
  }
  return el.getClientRects()[0] ?? el.getBoundingClientRect()
}

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as CaretDoc
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    return p ? { node: p.offsetNode, offset: p.offset } : null
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y)
    return r ? { node: r.startContainer, offset: r.startOffset } : null
  }
  return null
}

/** Якорь по точке на экране: какой символ находится в (x, y). */
export function anchorFromPoint(root: HTMLElement, x: number, y: number): Anchor | null {
  const caret = caretFromPoint(x, y)
  if (!caret || !root.contains(caret.node)) return null
  const host = (caret.node.nodeType === 1 ? (caret.node as Element) : caret.node.parentElement)?.closest<HTMLElement>('[data-block]')
  if (!host || !root.contains(host)) return null
  const block = Number(host.dataset.block)
  if (Number.isNaN(block)) return null
  const pre = document.createRange()
  pre.setStart(host, 0)
  try {
    pre.setEnd(caret.node, caret.offset)
  } catch {
    return { block, char: 0 }
  }
  return { block, char: pre.toString().length }
}

/**
 * Якорь в режиме ленты: что сейчас на «линии чтения» (чуть ниже верхней панели).
 * Если линия попала между абзацами — берём следующий абзац с начала.
 */
export function scrollAnchor(root: HTMLElement, lineY: number): Anchor | null {
  const box = root.getBoundingClientRect()
  const byCaret = anchorFromPoint(root, box.left + 2, lineY)
  if (byCaret) return byCaret
  const nodes = root.querySelectorAll<HTMLElement>('[data-block]')
  for (const n of nodes) {
    const r = n.getBoundingClientRect()
    if (r.bottom > lineY) return { block: Number(n.dataset.block), char: 0 }
  }
  return nodes.length ? { block: Number(nodes[nodes.length - 1].dataset.block), char: 0 } : null
}

/** Прокрутить ленту так, чтобы якорь оказался на линии чтения. */
export function scrollToAnchor(root: HTMLElement, a: Anchor, lineY: number) {
  const rect = rectAt(root, a)
  if (!rect) return false
  // Мгновенно, даже если на сайте включена плавная прокрутка: место сразу должно быть на экране.
  window.scrollTo({ top: Math.max(0, Math.round(window.scrollY + rect.top - lineY)), behavior: 'instant' as ScrollBehavior })
  return true
}

/** Коротко подсветить абзац, к которому перешли. */
export function flashBlock(root: ParentNode | null, i: number) {
  const el = blockEl(root, i)
  if (!el) return
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
}

/** Отрывок текста с начала предложения, в котором стоит якорь, — для списка закладок. */
export function excerptAt(text: string, char: number, max = 220) {
  const clean = text.replace(/\s+/g, ' ')
  const at = Math.max(0, Math.min(char, clean.length))
  const from = Math.max(0, at - 160)
  const before = clean.slice(from, at)
  const sentence = before.match(/.*[.!?…»"]\s/s)
  let start = from
  if (sentence) start = from + sentence[0].length
  else if (from > 0) start = from + (before.match(/^\S*\s/)?.[0].length ?? 0)
  const out = clean.slice(start, start + max).trim()
  return start + max < clean.length ? `${out}…` : out
}
