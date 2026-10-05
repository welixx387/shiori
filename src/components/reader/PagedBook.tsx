import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { anchorFromPoint, blockEl, flashBlock, rectAt, type Anchor } from './anchor'

/**
 * Постраничная читалка в виде книги.
 *
 * Текст раскладывается CSS-колонками: одна колонка — одна страница. На узком экране
 * видна одна страница, на широком в альбомной ориентации — разворот из двух.
 * Листание: перелистывание листа в 3D («flip»), сдвиг («slide») или без анимации.
 * На сенсорных экранах лист следует за пальцем: отпустили — долистывается или возвращается.
 *
 * Для анимации над лентой страниц лежат три копии текста (переворачиваемый лист с двух
 * сторон и неподвижная страница разворота). Они раскладываются один раз и при листании
 * только сдвигаются на нужную страницу, поэтому анимация не пересчитывает раскладку.
 */

export type TurnStyle = 'flip' | 'slide' | 'none'

export interface PagedState {
  /** Первая видимая страница (колонка) */
  page: number
  pages: number
  perView: 1 | 2
  /** Место чтения: начало страницы или место, куда перешли по закладке */
  anchor: Anchor | null
  /** Страницу перевернул читатель (а не переход по ссылке или пересчёт раскладки) */
  byUser: boolean
}

export interface PagedHandle {
  turn(dir: 1 | -1): void
  goToPage(page: number): void
  getAnchor(): Anchor | null
  goToAnchor(a: Anchor, opts?: { flash?: boolean }): void
  goToBlock(i: number, opts?: { flash?: boolean; onlyIfHidden?: boolean }): void
  root(): HTMLElement | null
}

interface Props {
  /** Текст главы для основной ленты */
  content: ReactNode
  /** Тот же текст без ссылок на элементы — для копий страниц */
  copyContent: ReactNode
  /** Меняется при смене главы — позиция сбрасывается */
  chapterKey: string
  /** Меняется при смене шрифта, размера, интервалов — раскладка пересчитывается с сохранением места */
  layoutKey: string
  maxWidth: number
  turnStyle: TurnStyle
  spreadPref: 'auto' | 'single'
  onState: (s: PagedState) => void
  onReady?: () => void
  onTapCenter: () => void
  onEdge: (dir: 1 | -1) => void
}

interface Geo {
  stageW: number
  stageH: number
  perView: 1 | 2
  sheetW: number
  sheetH: number
  colW: number
  colH: number
  mx: number
  my: number
  gap: number
  bookLeft: number
  bookTop: number
}

interface Turn {
  kind: 'flip' | 'slide'
  dir: 1 | -1
  from: number
  to: number
}

const EASE_FLIP = [0.3, 0.1, 0.22, 1] as const
const EASE_SLIDE = [0.22, 1, 0.36, 1] as const

function computeGeo(stageW: number, stageH: number, maxWidth: number, spreadPref: 'auto' | 'single'): Geo {
  const phone = stageW < 640
  const short = stageH < 520
  const outerX = phone ? 6 : stageW < 1024 ? 18 : 28
  const outerY = short ? 2 : phone ? 4 : 10
  const mx = phone ? 18 : stageW < 1024 ? 28 : 44
  const my = short ? 14 : phone ? 22 : 36
  const availW = Math.max(220, stageW - outerX * 2)
  const landscape = stageW > stageH * 1.15
  const spread = spreadPref === 'auto' && landscape && stageW >= 700 && availW / 2 - mx * 2 >= 320
  const perView = spread ? 2 : 1
  const sheetW = Math.floor(Math.min(maxWidth + mx * 2, availW / perView))
  const sheetH = Math.floor(Math.max(180, stageH - outerY * 2))
  return {
    stageW,
    stageH,
    perView,
    sheetW,
    sheetH,
    colW: sheetW - mx * 2,
    colH: sheetH - my * 2,
    mx,
    my,
    gap: mx * 2,
    bookLeft: Math.round((stageW - sheetW * perView) / 2),
    bookTop: Math.round((stageH - sheetH) / 2),
  }
}

const sameGeo = (a: Geo | null, b: Geo) =>
  Boolean(a) &&
  a!.stageW === b.stageW &&
  a!.stageH === b.stageH &&
  a!.sheetW === b.sheetW &&
  a!.colH === b.colH &&
  a!.perView === b.perView

const lastPageOf = (pages: number, perView: number) => Math.max(0, Math.floor((pages - 1) / perView) * perView)

/** Копия страницы `col` на листе бумаги. `ghost` — оборот листа: текст едва просвечивает. */
const SheetCopy = memo(function SheetCopy({
  geo,
  col,
  pages,
  content,
  ghost,
}: {
  geo: Geo
  col: number
  pages: number
  content: ReactNode
  ghost?: boolean
}) {
  const flowW = geo.colW * geo.perView + geo.gap * (geo.perView - 1)
  const visible = col >= 0 && col < pages
  return (
    <div className="paged-sheet absolute inset-0">
      <div
        className="absolute overflow-hidden"
        style={{
          left: geo.mx,
          top: geo.my,
          width: geo.colW,
          height: geo.colH,
          opacity: ghost ? 0.08 : undefined,
        }}
      >
        <div
          className="paged-flow"
          style={{
            columnWidth: geo.colW,
            columnGap: geo.gap,
            width: flowW,
            height: geo.colH,
            transform: `translateX(${-Math.max(0, col) * geo.sheetW}px)`,
            visibility: visible ? undefined : 'hidden',
            ['--page-h' as string]: `${geo.colH}px`,
          }}
        >
          {content}
        </div>
      </div>
    </div>
  )
})

export const PagedBook = forwardRef<PagedHandle, Props>(function PagedBook(
  { content, copyContent, chapterKey, layoutKey, maxWidth, turnStyle, spreadPref, onState, onReady, onTapCenter, onEdge },
  ref
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(0)
  const [turn, setTurn] = useState<Turn | null>(null)

  const geoRef = useRef<Geo | null>(null)
  const pagesRef = useRef(1)
  const pageRef = useRef(0)
  const turnRef = useRef<Turn | null>(null)
  geoRef.current = geo
  pagesRef.current = pages
  turnRef.current = turn

  /** Место чтения «прилипает»: после пересчёта раскладки открывается страница с ним. */
  const anchorRef = useRef<Anchor | null>(null)
  const refreshAnchor = useRef(false)
  const byUserRef = useRef(false)
  /** Открыли «с конца» (листали назад из следующей главы) — после догрузки картинок остаёмся на последней странице. */
  const atEndRef = useRef(false)
  const readyRef = useRef(false)

  const animRef = useRef<AnimationPlaybackControls | null>(null)
  const stripAnim = useRef<AnimationPlaybackControls | null>(null)
  const stripX = useMotionValue(0)
  const progress = useMotionValue(0)
  const signRef = useRef(-1)

  const stripRef = useRef<HTMLDivElement>(null)
  const setStrip = useCallback(
    (x: number) => {
      stripAnim.current?.stop()
      stripAnim.current = null
      stripX.set(x)
      // framer-motion применит сдвиг только в следующем кадре, а место на странице читается сразу.
      if (stripRef.current) stripRef.current.style.transform = `translateX(${x}px)`
    },
    [stripX]
  )

  // ── Геометрия ──
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const update = () => {
      const next = computeGeo(stage.clientWidth, stage.clientHeight, maxWidth, spreadPref)
      if (!sameGeo(geoRef.current, next)) setGeo(next)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [maxWidth, spreadPref])

  const alignPage = useCallback((col: number) => {
    const pv = geoRef.current?.perView ?? 1
    return Math.min(lastPageOf(pagesRef.current, pv), Math.max(0, col - (col % pv)))
  }, [])

  /** Номер страницы, на которой лежит прямоугольник (в координатах экрана). */
  const columnOf = useCallback((rect: DOMRect) => {
    const flow = flowRef.current
    const g = geoRef.current
    if (!flow || !g) return 0
    const rel = rect.left + Math.min(rect.width, 4) / 2 - flow.getBoundingClientRect().left
    return Math.max(0, Math.floor(rel / g.sheetW))
  }, [])

  const pageOfAnchor = useCallback(
    (a: Anchor) => {
      const rect = rectAt(flowRef.current, a)
      return rect ? alignPage(columnOf(rect)) : null
    },
    [alignPage, columnOf]
  )

  /** Что напечатано в начале открытой страницы. */
  const readAnchor = useCallback((): Anchor | null => {
    const flow = flowRef.current
    const clip = clipRef.current
    const g = geoRef.current
    if (!flow || !clip || !g) return null
    const box = clip.getBoundingClientRect()
    const left = box.left + g.mx
    const top = box.top + g.my
    const line = parseFloat(getComputedStyle(flow).lineHeight) || 28
    for (const [dx, dy] of [
      [2, 2],
      [2, line / 2],
      [14, line * 1.5],
    ]) {
      const a = anchorFromPoint(flow, left + dx, top + dy)
      if (a) {
        const r = rectAt(flow, a)
        if (!r || (r.left >= left - 4 && r.left < left + g.colW + 4)) return a
      }
    }
    // Страница начинается с картинки или заголовка — берём первый блок на ней.
    for (const n of flow.querySelectorAll<HTMLElement>('[data-block]')) {
      for (const r of n.getClientRects()) {
        if (r.right > left + 1 && r.left < left + g.colW && r.bottom > top) return { block: Number(n.dataset.block), char: 0 }
      }
    }
    return null
  }, [])

  // ── Подсчёт страниц после раскладки ──
  const measure = useCallback(() => {
    const flow = flowRef.current
    const g = geoRef.current
    if (!flow || !g) return
    const total = Math.max(1, Math.round((flow.scrollWidth + g.gap) / g.sheetW))
    pagesRef.current = total
    setPages(total)
    let target = pageRef.current
    if (atEndRef.current) target = total
    else if (anchorRef.current) target = pageOfAnchor(anchorRef.current) ?? target
    target = alignPage(target)
    pageRef.current = target
    setPage(target)
    setStrip(-target * g.sheetW)
  }, [alignPage, pageOfAnchor, setStrip])

  // ── Листание ──
  const finish = useCallback((commit: boolean) => {
    const t = turnRef.current
    animRef.current = null
    if (!t) return
    const target = commit ? t.to : t.from
    if (commit) {
      refreshAnchor.current = true
      byUserRef.current = true
    }
    pageRef.current = target
    turnRef.current = null
    setTurn(null)
    setPage(target)
  }, [])

  /** Мгновенно доиграть текущее листание (быстрые повторные нажатия). */
  const settle = useCallback(() => {
    if (!turnRef.current) return
    animRef.current?.stop()
    finish(true)
  }, [finish])

  // Новая глава — с первой страницы.
  useLayoutEffect(() => {
    animRef.current?.stop()
    animRef.current = null
    turnRef.current = null
    setTurn(null)
    anchorRef.current = null
    refreshAnchor.current = false
    byUserRef.current = false
    atEndRef.current = false
    readyRef.current = false
    pageRef.current = 0
    setPage(0)
    setStrip(0)
  }, [chapterKey, setStrip])

  useLayoutEffect(() => {
    if (!geo) return
    settle()
    measure()
    if (!readyRef.current) {
      readyRef.current = true
      onReady?.()
    }
  }, [geo, layoutKey, chapterKey, measure])

  // Шрифты и картинки догружаются позже — пересчитываем, сохраняя место.
  const hasGeo = Boolean(geo)
  useEffect(() => {
    const flow = flowRef.current
    if (!flow) return
    let t = 0
    const later = () => {
      clearTimeout(t)
      t = window.setTimeout(() => {
        if (!turnRef.current) measure()
      }, 80)
    }
    document.fonts?.ready.then(later)
    document.fonts?.addEventListener?.('loadingdone', later)
    flow.addEventListener('load', later, true)
    return () => {
      clearTimeout(t)
      document.fonts?.removeEventListener?.('loadingdone', later)
      flow.removeEventListener('load', later, true)
    }
  }, [chapterKey, layoutKey, measure, hasGeo])

  // Лента стоит на открытой странице, а во время перелистывания — на той, что откроется под листом.
  useLayoutEffect(() => {
    if (!geo) return
    if (!turn) setStrip(-page * geo.sheetW)
    else if (turn.kind === 'flip') setStrip(-(geo.perView === 1 && turn.dir === -1 ? turn.from : turn.to) * geo.sheetW)
  }, [turn, page, geo, setStrip])

  // Сообщаем читалке о смене страницы.
  useEffect(() => {
    if (!geo || turn) return
    if (refreshAnchor.current || !anchorRef.current) {
      const a = readAnchor()
      if (a) anchorRef.current = a
    }
    const byUser = byUserRef.current
    refreshAnchor.current = false
    byUserRef.current = false
    onState({ page, pages, perView: geo.perView, anchor: anchorRef.current, byUser })
  }, [page, pages, geo, turn])

  const flipEnds = (t: Turn, perView: number) => {
    const singleBack = perView === 1 && t.dir === -1
    return { start: singleBack ? 1 : 0, end: singleBack ? 0 : 1 }
  }

  const canTurn = (dir: 1 | -1) => {
    const g = geoRef.current
    if (!g) return false
    const to = pageRef.current + dir * g.perView
    return to >= 0 && to <= lastPageOf(pagesRef.current, g.perView)
  }

  const begin = useCallback(
    (dir: 1 | -1, kind: 'flip' | 'slide'): Turn | null => {
      settle()
      atEndRef.current = false
      const g = geoRef.current
      if (!g || !canTurn(dir)) return null
      const from = pageRef.current
      const t: Turn = { kind, dir, from, to: from + dir * g.perView }
      turnRef.current = t
      if (kind === 'flip') {
        signRef.current = g.perView === 2 && dir === -1 ? 1 : -1
        progress.set(flipEnds(t, g.perView).start)
      }
      setTurn(t)
      return t
    },
    [settle, progress]
  )

  const play = useCallback(
    (t: Turn, commit: boolean, velocity = 0) => {
      const g = geoRef.current
      if (!g) return
      const boost = 1 + Math.min(1.6, Math.abs(velocity))
      if (t.kind === 'flip') {
        const { start, end } = flipEnds(t, g.perView)
        const target = commit ? end : start
        const left = Math.abs(target - progress.get())
        animRef.current = animate(progress, target, {
          duration: Math.max(0.2, 0.68 * left) / boost,
          ease: EASE_FLIP,
          onComplete: () => finish(commit),
        })
      } else {
        animRef.current = animate(stripX, -(commit ? t.to : t.from) * g.sheetW, {
          duration: 0.44 / boost,
          ease: EASE_SLIDE,
          onComplete: () => finish(commit),
        })
      }
    },
    [finish, progress, stripX]
  )

  /** Перейти на страницу без анимации. */
  const jump = useCallback(
    (target: number, byUser: boolean) => {
      settle()
      atEndRef.current = !Number.isFinite(target)
      const p = alignPage(Number.isFinite(target) ? target : pagesRef.current)
      refreshAnchor.current = true
      byUserRef.current = byUser
      pageRef.current = p
      setPage(p)
      setStrip(-p * (geoRef.current?.sheetW ?? 0))
    },
    [settle, alignPage, setStrip]
  )

  const turnPage = useCallback(
    (dir: 1 | -1) => {
      const g = geoRef.current
      if (!g) return
      settle()
      if (!canTurn(dir)) return onEdge(dir)
      if (turnStyle === 'none') return jump(pageRef.current + dir * g.perView, true)
      const t = begin(dir, turnStyle)
      if (t) requestAnimationFrame(() => play(t, true))
    },
    [settle, begin, play, jump, turnStyle, onEdge]
  )

  // ── Жесты: лист под пальцем, касания краёв, колесо мыши ──
  const gesture = useRef<{
    id: number
    x: number
    y: number
    t: number
    mouse: boolean
    dragging: boolean
    turn: Turn | null
    edge: 0 | 1 | -1
    samples: { x: number; t: number }[]
  } | null>(null)

  /** Сколько нужно провести пальцем, чтобы перевернуть лист целиком. На одной странице край листа идёт за пальцем. */
  const dragSpan = () => {
    const g = geoRef.current
    if (!g) return 360
    return g.perView === 1 ? g.sheetW * 2 : Math.max(220, g.sheetW * 2 * 0.85)
  }

  const dragTo = (dx: number) => {
    const g = geoRef.current
    const st = gesture.current
    if (!g || !st) return
    if (!st.turn) {
      // Дальше листать некуда — страница слегка пружинит.
      setStrip(-pageRef.current * g.sheetW + Math.sign(dx) * Math.min(56, Math.abs(dx) * 0.2))
      return
    }
    const t = st.turn
    if (t.kind === 'slide') {
      const lo = -Math.max(t.from, t.to) * g.sheetW
      const hi = -Math.min(t.from, t.to) * g.sheetW
      stripX.set(Math.min(hi, Math.max(lo, -t.from * g.sheetW + dx)))
      return
    }
    const along = Math.min(1, Math.max(0, (t.dir === 1 ? -dx : dx) / dragSpan()))
    progress.set(flipEnds(t, g.perView).start === 0 ? along : 1 - along)
  }

  const springBack = () => {
    const g = geoRef.current
    if (!g) return
    stripAnim.current?.stop()
    stripAnim.current = animate(stripX, -pageRef.current * g.sheetW, { duration: 0.32, ease: EASE_SLIDE })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return
    if ((e.target as Element).closest('a,button,input,textarea,select,[data-no-turn]')) return
    const now = Date.now()
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: now,
      mouse: e.pointerType === 'mouse',
      dragging: false,
      turn: null,
      edge: 0,
      samples: [{ x: e.clientX, t: now }],
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const st = gesture.current
    if (!st || e.pointerId !== st.id) return
    const dx = e.clientX - st.x
    const dy = e.clientY - st.y
    st.samples.push({ x: e.clientX, t: Date.now() })
    if (st.samples.length > 6) st.samples.shift()
    if (!st.dragging) {
      // Мышью текст выделяют, а не листают; вертикальное движение — тоже не листание.
      if (st.mouse || Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return
      if (window.getSelection()?.toString()) return
      st.dragging = true
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      const dir: 1 | -1 = dx < 0 ? 1 : -1
      st.turn = turnStyle === 'none' ? null : begin(dir, turnStyle)
      st.edge = canTurn(dir) ? 0 : dir
    }
    dragTo(dx)
  }

  const onTap = (e: React.PointerEvent, mouse: boolean) => {
    const g = geoRef.current
    const box = stageRef.current?.getBoundingClientRect()
    if (!g || !box) return
    if (mouse) {
      // Мышью листают щелчком по полям страницы, а щелчок по тексту оставлен для выделения.
      const textLeft = box.left + g.bookLeft + g.mx
      const textRight = box.left + g.bookLeft + g.sheetW * g.perView - g.mx
      if (e.clientX < textLeft) turnPage(-1)
      else if (e.clientX > textRight) turnPage(1)
      else onTapCenter()
      return
    }
    const zone = (e.clientX - box.left) / box.width
    if (zone < 0.3) turnPage(-1)
    else if (zone > 0.7) turnPage(1)
    else onTapCenter()
  }

  const endGesture = (e: React.PointerEvent, cancelled = false) => {
    const st = gesture.current
    if (!st || e.pointerId !== st.id) return
    gesture.current = null
    const dx = e.clientX - st.x
    const dy = e.clientY - st.y
    if (!st.dragging) {
      if (cancelled || Math.abs(dx) > 8 || Math.abs(dy) > 8 || Date.now() - st.t > 650) return
      if (window.getSelection()?.toString()) return
      if ((e.target as Element).closest('a,button,figure,[data-no-turn]')) return
      onTap(e, st.mouse)
      return
    }
    const first = st.samples[0]
    const last = st.samples[st.samples.length - 1]
    const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
    if (!st.turn) {
      springBack()
      if (cancelled) return
      if (turnStyle === 'none' && !st.edge && Math.abs(dx) > 50) turnPage(dx < 0 ? 1 : -1)
      else if (st.edge && Math.abs(dx) > 80) onEdge(st.edge)
      return
    }
    const t = st.turn
    const speed = t.dir === 1 ? -velocity : velocity
    const toward = t.dir === 1 ? -dx : dx
    const bookW = (geoRef.current?.sheetW ?? 360) * (geoRef.current?.perView ?? 1)
    play(t, !cancelled && speed > -0.4 && (speed > 0.4 || toward > Math.min(140, bookW * 0.22)), velocity)
  }

  // Колесо и тачпад: один жест — одна страница.
  const wheel = useRef({ last: 0, acc: 0, turned: false, at: 0 })
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) return
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    const w = wheel.current
    const now = performance.now()
    if (now - w.last > 220) {
      w.acc = 0
      w.turned = false
    }
    w.last = now
    if (w.turned && now - w.at > 700 && Math.abs(d) >= 40) {
      w.turned = false
      w.acc = 0
    }
    if (w.turned) return
    w.acc += d
    if (Math.abs(w.acc) >= 30) {
      w.turned = true
      w.at = now
      turnPage(w.acc > 0 ? 1 : -1)
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      turn: turnPage,
      goToPage: (p) => jump(p, false),
      getAnchor: () => (turnRef.current ? anchorRef.current : (anchorRef.current ?? readAnchor())),
      goToAnchor: (a, opts) => {
        settle()
        atEndRef.current = false
        anchorRef.current = a
        refreshAnchor.current = false
        const p = pageOfAnchor(a)
        if (p !== null) {
          pageRef.current = p
          setPage(p)
          setStrip(-p * (geoRef.current?.sheetW ?? 0))
        }
        if (opts?.flash) flashBlock(flowRef.current, a.block)
      },
      goToBlock: (i, opts) => {
        const el = blockEl(flowRef.current, i)
        if (!el) return
        const rect = el.getClientRects()[0] ?? el.getBoundingClientRect()
        const p = alignPage(columnOf(rect))
        const pv = geoRef.current?.perView ?? 1
        const hidden = p < pageRef.current || p >= pageRef.current + pv
        if (!opts?.onlyIfHidden || hidden) {
          settle()
          atEndRef.current = false
          anchorRef.current = { block: i, char: 0 }
          refreshAnchor.current = false
          pageRef.current = p
          setPage(p)
          setStrip(-p * (geoRef.current?.sheetW ?? 0))
        }
        if (opts?.flash) flashBlock(flowRef.current, i)
      },
      root: () => flowRef.current,
    }),
    [turnPage, jump, readAnchor, settle, pageOfAnchor, alignPage, columnOf, setStrip]
  )

  // ── Значения для анимации листа ──
  const leafTransform = useTransform(progress, (v) => `rotateY(${signRef.current * 180 * v}deg)`)
  const lift = useTransform(progress, (v) => Math.sin(Math.PI * Math.min(1, Math.max(0, v))))
  // Одна страница: лист загибается по вертикальной линии сгиба, его край идёт за пальцем.
  // При ширине W и прогрессе v сгиб стоит на X = W·(1−v), край листа — на 2X−W.
  const sheetW = () => geoRef.current?.sheetW ?? 0
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const foldOuter = useTransform(progress, (v) => -sheetW() * clamp01(v))
  const foldInner = useTransform(progress, (v) => sheetW() * clamp01(v))
  const foldLine = useTransform(progress, (v) => sheetW() * (1 - clamp01(v)))
  const flapEdge = useTransform(progress, (v) => sheetW() * (1 - 2 * clamp01(v)) - 40)
  const crease = useTransform(progress, (v) => sheetW() * clamp01(v) - 72)
  const foldShadow = useTransform(lift, (l) => Math.min(1, l * 1.5))
  const frontShade = useTransform(progress, (v) => Math.min(0.5, v * 0.75))
  const backShade = useTransform(progress, (v) => Math.min(0.45, (1 - v) * 0.7))
  const underShade = useTransform(lift, (s) => s * 0.5)

  if (!geo) return <div ref={stageRef} className="absolute inset-0" />

  const perView = geo.perView
  const spread = perView === 2
  const lastPage = lastPageOf(pages, perView)
  const sheetCount = lastPage + perView
  const flowW = geo.colW * perView + geo.gap * (perView - 1)
  const bookW = geo.sheetW * perView
  const sheetsFrom = Math.max(0, page - 4)
  const sheetsTo = Math.min(sheetCount, page + 6)

  // Раскладка слоёв перелистывания
  const flip = turn?.kind === 'flip' ? turn : null
  let leafSlot = 0
  let origin: 'left' | 'right' = 'left'
  let front = 0
  let back = 0
  let coverSlot = 0
  let coverCol = -1
  let underSlot = 0
  if (flip && !spread) {
    front = flip.dir === 1 ? flip.from : flip.to
    back = front
  } else if (flip && flip.dir === 1) {
    leafSlot = 1
    front = flip.from + 1
    back = flip.to
    coverCol = flip.from
    underSlot = 1
  } else if (flip) {
    origin = 'right'
    front = flip.from
    back = flip.to + 1
    coverSlot = 1
    coverCol = flip.from + 1
  }
  const share = lastPage > 0 ? page / lastPage : 1
  const outside = geo.bookLeft >= 64

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 select-text"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endGesture(e)}
      onPointerCancel={(e) => endGesture(e, true)}
      onWheel={onWheel}
    >
      <div
        className="absolute"
        style={{ left: geo.bookLeft, top: geo.bookTop, width: bookW, height: geo.sheetH, perspective: spread ? 2800 : 1900 }}
      >
        {/* Обрез книги: слева прочитанные страницы, справа оставшиеся */}
        {spread && (
          <>
            <div className="paged-edge absolute bottom-[3px] top-[3px] rounded-l-[4px]" style={{ right: '100%', width: 2 + Math.round(4 * share) }} />
            <div className="paged-edge absolute bottom-[3px] top-[3px] rounded-r-[4px]" style={{ left: '100%', width: 2 + Math.round(4 * (1 - share)) }} />
          </>
        )}

        {/* Основная лента страниц */}
        <div ref={clipRef} className="paged-book absolute inset-0 overflow-hidden">
          <motion.div ref={stripRef} className="absolute inset-y-0 left-0 will-change-transform" style={{ x: stripX, width: sheetCount * geo.sheetW }}>
            {Array.from({ length: Math.max(0, sheetsTo - sheetsFrom) }, (_, k) => {
              const i = sheetsFrom + k
              return (
                <div
                  key={i}
                  className={cn('paged-sheet absolute top-0', spread && (i % 2 ? 'paged-sheet-right' : 'paged-sheet-left'))}
                  style={{ left: i * geo.sheetW, width: geo.sheetW, height: geo.sheetH }}
                />
              )
            })}
            <div className="absolute" style={{ left: geo.mx, top: geo.my, width: flowW, height: geo.colH }}>
              <div
                ref={flowRef}
                className="paged-flow"
                style={{ columnWidth: geo.colW, columnGap: geo.gap, width: flowW, height: geo.colH, ['--page-h' as string]: `${geo.colH}px` }}
              >
                {content}
              </div>
            </div>
          </motion.div>
          {spread && <div className="paged-spine pointer-events-none absolute inset-y-0 left-1/2 w-24 -translate-x-1/2" />}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0"
            style={{
              left: underSlot * geo.sheetW,
              width: geo.sheetW,
              opacity: flip && spread ? underShade : 0,
              background: `linear-gradient(${origin === 'left' ? 90 : 270}deg, rgba(0,0,0,0.5), rgba(0,0,0,0.12) 35%, rgba(0,0,0,0) 75%)`,
            }}
          />
        </div>

        {spread ? (
          <>
        {/* Неподвижная страница разворота, пока над ней идёт лист */}
        <div
          aria-hidden
          className="paged-copy pointer-events-none absolute top-0 overflow-hidden"
          style={{ left: coverSlot * geo.sheetW, width: geo.sheetW, height: geo.sheetH, visibility: flip ? 'visible' : 'hidden' }}
        >
          <SheetCopy geo={geo} col={coverCol} pages={pages} content={copyContent} />
        </div>

        {/* Переворачиваемый лист */}
        <motion.div
          aria-hidden
          className="paged-leaf pointer-events-none absolute top-0"
          style={{
            left: leafSlot * geo.sheetW,
            width: geo.sheetW,
            height: geo.sheetH,
            transformOrigin: `${origin} center`,
            transformStyle: 'preserve-3d',
            transform: leafTransform,
            visibility: flip ? 'visible' : 'hidden',
            zIndex: 5,
          }}
        >
          <div className="paged-face absolute inset-0 overflow-hidden">
            <SheetCopy geo={geo} col={front} pages={pages} content={copyContent} />
            <motion.div
              className="absolute inset-0"
              style={{
                opacity: frontShade,
                background: `linear-gradient(${origin === 'left' ? 270 : 90}deg, rgba(0,0,0,0.55), rgba(0,0,0,0.08) 55%, rgba(255,255,255,0.05))`,
              }}
            />
          </div>
          <div className="paged-face absolute inset-0 overflow-hidden" style={{ transform: 'rotateY(180deg)' }}>
            <SheetCopy geo={geo} col={back} pages={pages} content={copyContent} />
            <motion.div
              className="absolute inset-0"
              style={{
                opacity: backShade,
                background: `linear-gradient(${origin === 'left' ? 270 : 90}deg, rgba(0,0,0,0.5), rgba(0,0,0,0) 70%)`,
              }}
            />
          </div>
        </motion.div>
          </>
        ) : (
          <>
        {/* Одна страница: лист загибается, открывая следующую */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[6px]"
          style={{ zIndex: 5, visibility: flip ? 'visible' : 'hidden' }}
        >
          {/* тень от сгиба на открывающейся странице */}
          <motion.div className="paged-fold-cast absolute inset-y-0 left-0 w-14" style={{ x: foldLine, opacity: foldShadow }} />
          {/* ещё не перевёрнутая часть листа */}
          <motion.div className="absolute inset-0 overflow-hidden" style={{ x: foldOuter }}>
            <motion.div className="absolute inset-0" style={{ x: foldInner }}>
              <SheetCopy geo={geo} col={front} pages={pages} content={copyContent} />
            </motion.div>
          </motion.div>
          {/* тень от загнутого листа */}
          <motion.div className="paged-fold-drop absolute inset-y-0 left-0 w-10" style={{ x: flapEdge, opacity: foldShadow }} />
          {/* оборот загнутого листа */}
          <motion.div className="absolute inset-0 overflow-hidden" style={{ x: foldOuter }}>
            <motion.div className="absolute inset-0 overflow-hidden" style={{ x: foldLine }}>
              <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
                <SheetCopy geo={geo} col={front} pages={pages} content={copyContent} ghost />
              </div>
              <div className="paged-fold-edge absolute inset-y-0 left-0 w-8" />
              <motion.div className="paged-fold-crease absolute inset-y-0 left-0 w-[72px]" style={{ x: crease }} />
            </motion.div>
          </motion.div>
        </div>
          </>
        )}

        {/* Корешок у одиночной страницы: лист поворачивается вокруг него */}
        {!spread && <div aria-hidden className="paged-binding pointer-events-none absolute inset-y-0 left-0 w-5 rounded-l-[6px]" style={{ zIndex: 6 }} />}
      </div>

      {/* Стрелки для мыши и тачпада */}
      <button
        type="button"
        onClick={() => turnPage(-1)}
        aria-label="Предыдущая страница"
        className="paged-arrow"
        style={{ left: outside ? geo.bookLeft - 56 : 8 }}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => turnPage(1)}
        aria-label="Следующая страница"
        className="paged-arrow"
        style={{ right: outside ? geo.bookLeft - 56 : 8 }}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <span className="sr-only" aria-live="polite">
        Страница {page + 1} из {pages}
      </span>
    </div>
  )
})
