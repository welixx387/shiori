import { memo, useId, useMemo, useState } from 'react'
import { COVER_PALETTES } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { hashString, seededRandom } from '../../lib/id'
import type { CoverPattern, CoverStyle } from '../../types'

/**
 * Обложка тайтла. Если админ загрузил картинку — показываем её,
 * иначе рисуем генеративную обложку в духе японского книжного дизайна:
 * градиент, традиционный узор (сэйгайха, асаноха…), крупный иероглиф и название.
 */

interface CoverProps {
  novel: { id: string; title: string; author?: string; coverUrl: string | null; coverStyle: CoverStyle }
  className?: string
  showTitle?: boolean
  /** Подпись автора на обложке */
  showAuthor?: boolean
  rounded?: string
  priority?: boolean
}

const W = 200
const H = 300

/** Размер названия на обложке: по длине всего названия и самого длинного слова (Unbounded широкий). */
function titleSize(title: string) {
  const base = title.length > 34 ? 8.4 : title.length > 20 ? 9.6 : 11
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length))
  return Math.min(base, 80 / (longest * 0.82))
}

function hexToRgb(hex: string) {
  const v = hex.replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)] as const
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

// ── Плитки узоров для <pattern> ──

function asanohaTile(s: number) {
  const h = (s * Math.sqrt(3)) / 2
  const tris: [number, number][][] = [
    [[0, 0], [s, 0], [s / 2, h]],
    [[-s / 2, h], [s / 2, h], [0, 0]],
    [[s / 2, h], [1.5 * s, h], [s, 0]],
    [[0, 2 * h], [s, 2 * h], [s / 2, h]],
    [[-s / 2, h], [s / 2, h], [0, 2 * h]],
    [[s / 2, h], [1.5 * s, h], [s, 2 * h]],
  ]
  let d = ''
  for (const t of tris) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3
    const cy = (t[0][1] + t[1][1] + t[2][1]) / 3
    d += `M${t[0][0]} ${t[0][1]}L${t[1][0]} ${t[1][1]}L${t[2][0]} ${t[2][1]}Z`
    for (const [x, y] of t) d += `M${cx.toFixed(2)} ${cy.toFixed(2)}L${x} ${y.toFixed(2)}`
  }
  return { d, w: s, h: 2 * h }
}

function seigaihaTile(w: number) {
  const h = w / 2
  const radii = [w * 0.46, w * 0.32, w * 0.18]
  const centers: [number, number][] = [
    [w / 2, h / 2],
    [0, h],
    [w, h],
    [w / 2, h * 1.5],
  ]
  let d = ''
  for (const [cx, cy] of centers) {
    for (const r of radii) d += `M${(cx - r).toFixed(2)} ${cy}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(cx + r).toFixed(2)} ${cy}`
  }
  return { d, w, h }
}

const CIRCUIT_TILE = {
  d: 'M0 20H11L20 11V0M20 40V29L29 20H40M11 20L20 29M29 20L20 11M0 0L6 6M40 40L34 34',
  w: 40,
  h: 40,
}

const ASANOHA = asanohaTile(28)
const SEIGAIHA = seigaihaTile(30)

function petal(cx: number, cy: number, r: number, rot: number) {
  let d = ''
  for (let i = 0; i < 5; i++) {
    const a = ((rot + i * 72) * Math.PI) / 180
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    const c1 = ((rot + i * 72 - 28) * Math.PI) / 180
    const c2 = ((rot + i * 72 + 28) * Math.PI) / 180
    d += `M${cx.toFixed(1)} ${cy.toFixed(1)}Q${(cx + Math.cos(c1) * r * 1.25).toFixed(1)} ${(cy + Math.sin(c1) * r * 1.25).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Q${(cx + Math.cos(c2) * r * 1.25).toFixed(1)} ${(cy + Math.sin(c2) * r * 1.25).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`
  }
  return d
}

function sparkle(x: number, y: number, r: number) {
  return `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`
}

function Scene({ pattern, colors, seed, uid }: { pattern: CoverPattern; colors: [string, string, string]; seed: number; uid: string }) {
  const [, mid, light] = colors

  const content = useMemo(() => {
    const r = seededRandom(seed)
    switch (pattern) {
      case 'seigaiha':
      case 'asanoha':
      case 'circuit': {
        const tile = pattern === 'seigaiha' ? SEIGAIHA : pattern === 'asanoha' ? ASANOHA : CIRCUIT_TILE
        return (
          <>
            <defs>
              <pattern id={`p-${uid}`} width={tile.w} height={tile.h} patternUnits="userSpaceOnUse" patternTransform={`rotate(${pattern === 'circuit' ? 0 : -8})`}>
                <path d={tile.d} fill="none" stroke={rgba(light, pattern === 'circuit' ? 0.28 : 0.22)} strokeWidth={pattern === 'circuit' ? 1.1 : 0.9} />
                {pattern === 'circuit' && (
                  <g fill={rgba(light, 0.5)}>
                    <circle cx="11" cy="20" r="1.8" />
                    <circle cx="29" cy="20" r="1.8" />
                    <circle cx="20" cy="11" r="1.8" />
                  </g>
                )}
              </pattern>
              <radialGradient id={`pm-${uid}`} cx="50%" cy="35%" r="75%">
                <stop offset="0" stopColor="#fff" stopOpacity="1" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
              </radialGradient>
              <mask id={`m-${uid}`}>
                <rect width={W} height={H} fill={`url(#pm-${uid})`} />
              </mask>
            </defs>
            <rect width={W} height={H} fill={`url(#p-${uid})`} mask={`url(#m-${uid})`} />
            {pattern === 'circuit' && (
              <g transform={`translate(${100 + (r() - 0.5) * 30} ${118 + (r() - 0.5) * 20}) rotate(${r() * 60})`} fill="none" stroke={rgba(light, 0.45)}>
                <circle r="58" strokeWidth="0.8" strokeDasharray="2 4" />
                <circle r="46" strokeWidth="1.2" />
                <circle r="30" strokeWidth="0.8" />
                <path d="M0 -46L40 23L-40 23Z M0 46L-40 -23L40 -23Z" strokeWidth="0.9" />
              </g>
            )}
          </>
        )
      }
      case 'moon': {
        const cx = 70 + r() * 60
        const cy = 78 + r() * 34
        return (
          <>
            <defs>
              <radialGradient id={`g-${uid}`}>
                <stop offset="0" stopColor={light} stopOpacity="0.55" />
                <stop offset="1" stopColor={light} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={cx} cy={cy} r="110" fill={`url(#g-${uid})`} />
            {[64, 82, 104].map((rad, i) => (
              <circle key={rad} cx={cx} cy={cy} r={rad} fill="none" stroke={rgba(light, 0.22 - i * 0.05)} strokeWidth="0.8" />
            ))}
            <circle cx={cx} cy={cy} r="44" fill={rgba(light, 0.92)} />
            <circle cx={cx + 12} cy={cy - 8} r="44" fill={mid} opacity="0.35" />
            <circle cx={cx - 14} cy={cy + 10} r="6" fill={rgba(mid, 0.25)} />
            <circle cx={cx - 4} cy={cy - 16} r="4" fill={rgba(mid, 0.2)} />
            {Array.from({ length: 26 }, (_, i) => (
              <circle key={i} cx={r() * W} cy={r() * H * 0.7} r={r() * 1.1 + 0.3} fill={rgba(light, 0.5 + r() * 0.5)} />
            ))}
          </>
        )
      }
      case 'mountains': {
        const layer = (base: number, amp: number, n: number) => {
          let d = `M0 ${H}L0 ${base}`
          for (let i = 1; i <= n; i++) {
            const x = (i / n) * W
            const y = base - r() * amp
            d += `L${(x - W / n / 2).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(base - r() * amp * 0.3).toFixed(1)}`
          }
          return d + `L${W} ${H}Z`
        }
        return (
          <>
            <defs>
              <linearGradient id={`mist-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={light} stopOpacity="0" />
                <stop offset="1" stopColor={light} stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <circle cx={60 + r() * 80} cy={70 + r() * 30} r="30" fill={rgba(light, 0.85)} />
            <circle cx={100} cy={90} r="120" fill="none" stroke={rgba(light, 0.12)} strokeWidth="0.8" />
            <path d={layer(170, 60, 4)} fill={rgba(light, 0.22)} />
            <rect y="140" width={W} height="80" fill={`url(#mist-${uid})`} />
            <path d={layer(205, 55, 5)} fill={rgba(mid, 0.75)} />
            <path d={layer(240, 45, 6)} fill={rgba(colors[0], 0.85)} />
          </>
        )
      }
      case 'stars': {
        return (
          <>
            <ellipse cx="100" cy="120" rx="130" ry="46" fill="none" stroke={rgba(light, 0.25)} strokeWidth="0.8" transform={`rotate(${-25 + r() * 20} 100 120)`} />
            <ellipse cx="100" cy="120" rx="90" ry="30" fill="none" stroke={rgba(light, 0.18)} strokeWidth="0.8" transform={`rotate(${-35 + r() * 20} 100 120)`} />
            <circle cx={100 + (r() - 0.5) * 40} cy={120} r="9" fill={rgba(light, 0.9)} />
            {Array.from({ length: 70 }, (_, i) => (
              <circle key={i} cx={r() * W} cy={r() * H} r={r() * 1.2 + 0.25} fill={rgba(light, 0.35 + r() * 0.6)} />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <path key={`s${i}`} d={sparkle(Math.round(r() * W), Math.round(r() * H * 0.75), Math.round(3 + r() * 6))} fill={rgba(light, 0.85)} />
            ))}
          </>
        )
      }
      case 'rain': {
        return (
          <>
            {Array.from({ length: 80 }, (_, i) => {
              const x = r() * (W + 60) - 30
              const y = r() * H
              const len = 8 + r() * 18
              return <line key={i} x1={x} y1={y} x2={x - len * 0.35} y2={y + len} stroke={rgba(light, 0.12 + r() * 0.3)} strokeWidth={0.6 + r() * 0.6} strokeLinecap="round" />
            })}
            {Array.from({ length: 5 }, (_, i) => {
              const cx = 20 + r() * 160
              const cy = 230 + r() * 50
              return (
                <g key={`r${i}`} fill="none" stroke={rgba(light, 0.3)} strokeWidth="0.7">
                  <ellipse cx={cx} cy={cy} rx={6 + r() * 6} ry={2} />
                  <ellipse cx={cx} cy={cy} rx={14 + r() * 10} ry={4} opacity="0.5" />
                </g>
              )
            })}
          </>
        )
      }
      case 'sakura': {
        return (
          <>
            {Array.from({ length: 16 }, (_, i) => {
              const size = 4 + r() * 12
              return <path key={i} d={petal(r() * W, r() * H, size, r() * 360)} fill={rgba(light, 0.18 + r() * 0.35)} />
            })}
            <path d="M-10 60 C 40 80, 60 40, 120 70 S 190 50, 220 80" fill="none" stroke={rgba(light, 0.25)} strokeWidth="1.4" />
          </>
        )
      }
    }
  }, [pattern, light, mid, colors, seed, uid])

  return <>{content}</>
}

export const Cover = memo(function Cover({ novel, className, showTitle = true, showAuthor = false, rounded = 'rounded-2xl', priority }: CoverProps) {
  const uid = useId().replace(/:/g, '')
  const [failed, setFailed] = useState(false)
  const style = novel.coverStyle
  const palette = COVER_PALETTES[style.palette % COVER_PALETTES.length] ?? COVER_PALETTES[0]
  const [dark, mid, light] = palette.colors
  const seed = hashString(novel.id + novel.title)

  if (novel.coverUrl && !failed) {
    return (
      <div className={cn('relative aspect-[2/3] overflow-hidden bg-surface-2', rounded, className)}>
        <img
          src={novel.coverUrl}
          alt={novel.title}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
      </div>
    )
  }

  return (
    <div
      className={cn('relative aspect-[2/3] overflow-hidden [container-type:inline-size]', rounded, className)}
      style={{ background: dark }}
      role="img"
      aria-label={`Обложка: ${novel.title}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor={mid} />
            <stop offset="0.65" stopColor={dark} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
          <radialGradient id={`glow-${uid}`} cx={`${30 + (seed % 40)}%`} cy="22%" r="70%">
            <stop offset="0" stopColor={light} stopOpacity="0.38" />
            <stop offset="1" stopColor={light} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#bg-${uid})`} />
        <rect width={W} height={H} fill={`url(#glow-${uid})`} />
        <Scene pattern={style.pattern} colors={palette.colors} seed={seed} uid={uid} />
      </svg>

      {/* Иероглиф */}
      <span
        className="pointer-events-none absolute right-[8%] top-[7%] font-jp leading-none"
        style={{
          fontSize: '46cqw',
          color: light,
          opacity: 0.9,
          textShadow: `0 0 24px ${rgba(light, 0.55)}, 0 2px 0 ${rgba(dark, 0.4)}`,
        }}
        aria-hidden
      >
        {style.kanji}
      </span>

      {/* Корешок, рамка и затемнение под текстом */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[7%]"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.35), rgba(255,255,255,0.08) 60%, transparent)' }}
      />
      <div className="pointer-events-none absolute inset-[4.5%] rounded-[6%] border" style={{ borderColor: rgba(light, 0.22) }} />
      <span
        className="writing-vertical pointer-events-none absolute left-[9%] top-[34%] font-jp tracking-[0.3em]"
        style={{ fontSize: '5.2cqw', color: rgba(light, 0.75) }}
        aria-hidden
      >
        栞文庫
      </span>

      {showTitle && (
        <div
          className="absolute inset-x-0 bottom-0 px-[9%] pb-[10%] pt-[30%]"
          style={{ background: `linear-gradient(180deg, transparent, ${rgba(dark, 0.78)} 45%, ${rgba(dark, 0.94)})` }}
        >
          <div className="mb-[4%] h-px w-[22%]" style={{ background: light, opacity: 0.8 }} />
          <p
            className="line-clamp-4 font-display font-bold leading-[1.08] tracking-tight text-white"
            style={{ fontSize: `${titleSize(novel.title)}cqw`, overflowWrap: 'anywhere' }}
          >
            {novel.title}
          </p>
          {showAuthor && novel.author && (
            <p className="mt-[4%] truncate font-medium" style={{ fontSize: '5.6cqw', color: rgba(light, 0.85) }}>
              {novel.author}
            </p>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
    </div>
  )
})
