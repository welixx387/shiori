import { motion } from 'framer-motion'
import { Gift, Lock } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RARITIES, formatPrice, titleTone } from '../../lib/collect'
import { COVER_PALETTES } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { hashString } from '../../lib/id'
import { useTitleMap } from '../../lib/queries'
import type { ArtStyle, Card, CaseType, PublicProfile, Rarity, Title } from '../../types'
import { Avatar } from '../ui/Avatar'

function paletteOf(style: ArtStyle) {
  return (COVER_PALETTES[style.palette % COVER_PALETTES.length] ?? COVER_PALETTES[0]).colors
}

/** Абстрактный фон без картинки: градиент палитры, узор и иероглиф. */
function GeneratedArt({ style, seed, className }: { style: ArtStyle; seed: string; className?: string }) {
  const [dark, mid, light] = paletteOf(style)
  const h = hashString(seed)
  const angle = 120 + (h % 90)
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{ background: `linear-gradient(${angle}deg, ${dark} 10%, ${mid} 70%, ${light} 140%)` }}
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${light} 1px, transparent 1.4px)`,
          backgroundSize: '12px 12px',
        }}
      />
      <div
        className="absolute -right-[20%] -top-[15%] aspect-square w-[90%] rounded-full opacity-40 blur-2xl"
        style={{ background: light }}
      />
      <span
        className="absolute inset-x-0 top-[12%] flex justify-center font-brush leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
        style={{ color: light, fontSize: '230%' }}
      >
        {style.kanji}
      </span>
    </div>
  )
}

export function RarityPill({ rarity, className }: { rarity: Rarity; className?: string }) {
  const r = RARITIES[rarity]
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide', className)}
      style={{ color: r.color, background: `${r.color}22`, boxShadow: `inset 0 0 0 1px ${r.color}44` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
      {r.label}
    </span>
  )
}

interface CollectCardProps {
  card: Card
  size?: 'xs' | 'sm' | 'md' | 'lg'
  count?: number
  selected?: boolean
  dim?: boolean
  onClick?: () => void
  footer?: ReactNode
  className?: string
}

const SIZES = {
  xs: { w: 'w-[92px]', text: 'text-[10px]', font: 'text-[34px]' },
  sm: { w: 'w-[132px]', text: 'text-[11px]', font: 'text-[48px]' },
  md: { w: 'w-[176px]', text: 'text-[12.5px]', font: 'text-[64px]' },
  lg: { w: 'w-[248px]', text: 'text-sm', font: 'text-[92px]' },
}

/** Коллекционная карточка: рамка цвета редкости, картинка или сгенерированный фон. */
export function CollectCard({ card, size = 'md', count, selected, dim, onClick, footer, className }: CollectCardProps) {
  const r = RARITIES[card.rarity]
  const s = SIZES[size]
  const shiny = card.rarity === 'legendary' || card.rarity === 'mythic'
  const Tag = onClick ? motion.button : motion.div
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      whileHover={onClick ? { y: -4 } : undefined}
      className={cn(
        'group relative block shrink-0 text-left',
        s.w,
        dim && 'opacity-40 grayscale',
        className
      )}
    >
      <div
        className={cn(
          'relative aspect-[3/4] overflow-hidden rounded-2xl ring-2 transition-shadow duration-300',
          selected ? 'ring-[3px] ring-accent' : ''
        )}
        style={
          {
            '--tw-ring-color': selected ? undefined : `${r.color}aa`,
            boxShadow: `0 10px 30px -12px ${r.glow}, 0 0 0 1px rgba(0,0,0,0.25)`,
          } as CSSProperties
        }
      >
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : (
          <div className={cn('absolute inset-0', s.font)}>
            <GeneratedArt style={card.style} seed={card.id} />
          </div>
        )}
        {shiny && <div className="holo pointer-events-none absolute inset-0 animate-[gradient-pan_6s_ease-in-out_infinite]" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className={cn('line-clamp-2 font-display font-bold leading-tight text-white drop-shadow', s.text)}>{card.name}</p>
          <p className={cn('mt-0.5 font-semibold uppercase tracking-wide', size === 'xs' ? 'text-[8.5px]' : 'text-[9.5px]')} style={{ color: r.color }}>
            {r.label}
          </p>
        </div>
        {count !== undefined && count > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">×{count}</span>
        )}
        {!card.active && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/80">вне кейсов</span>
        )}
      </div>
      {footer}
    </Tag>
  )
}

interface CaseBoxProps {
  box: CaseType
  size?: 'sm' | 'md' | 'lg'
  badge?: ReactNode
  locked?: boolean
  className?: string
  onClick?: () => void
}

/** Кейс: «шкатулка» с иероглифом или картинкой. */
export function CaseBox({ box, size = 'md', badge, locked, className, onClick }: CaseBoxProps) {
  const [dark, mid, light] = paletteOf(box.style)
  const w = size === 'sm' ? 'w-24' : size === 'lg' ? 'w-56' : 'w-36'
  const Tag = onClick ? motion.button : motion.div
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      whileHover={onClick ? { rotate: -2, y: -3 } : undefined}
      className={cn('relative shrink-0', w, className)}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-[28%] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]"
        style={{ background: `linear-gradient(145deg, ${mid}, ${dark})`, boxShadow: `inset 0 0 0 2px ${light}55` }}
      >
        {box.imageUrl ? (
          <img src={box.imageUrl} alt={box.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : (
          <>
            <div className="absolute inset-x-0 top-[38%] h-[14%]" style={{ background: `linear-gradient(90deg, ${light}cc, ${light}66)` }} />
            <div className="absolute inset-y-0 left-[43%] w-[14%]" style={{ background: `linear-gradient(180deg, ${light}cc, ${light}55)` }} />
            <span
              className="absolute inset-0 flex items-center justify-center font-brush drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
              style={{ color: '#fff', fontSize: size === 'sm' ? 34 : size === 'lg' ? 96 : 56 }}
            >
              {box.style.kanji}
            </span>
          </>
        )}
        {locked && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
            <Lock className="h-6 w-6 text-white/90" />
          </span>
        )}
      </div>
      {badge && <span className="absolute -right-2 -top-2">{badge}</span>}
    </Tag>
  )
}

export function CasePrice({ box }: { box: CaseType }) {
  if (box.weekly) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-2">
        <Gift className="h-4 w-4" /> раз в неделю бесплатно
      </span>
    )
  }
  if (box.price <= 0) return <span className="text-sm text-muted">только в подарок</span>
  return <span className="text-sm font-bold text-fg">{formatPrice(box.price, box.currency)}</span>
}

export function TitleBadge({ title, className }: { title: Title | undefined | null; className?: string }) {
  if (!title) return null
  const tone = titleTone(title.tone)
  return (
    <span
      title={title.description || undefined}
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', tone.className, className)}
    >
      {title.name}
    </span>
  )
}

/** Аватар, имя и титул читателя со ссылкой на его профиль. */
export function UserChip({
  user,
  size = 36,
  sub,
  className,
  link = true,
}: {
  user: PublicProfile | null | undefined
  size?: number
  sub?: ReactNode
  className?: string
  link?: boolean
}) {
  const titles = useTitleMap()
  if (!user) {
    return (
      <span className={cn('flex items-center gap-3', className)}>
        <Avatar user={null} size={size} />
        <span className="text-sm text-muted">Удалённый аккаунт</span>
      </span>
    )
  }
  const body = (
    <>
      <Avatar user={user} size={size} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-fg">{user.displayName}</span>
          {user.titleId && <TitleBadge title={titles.get(user.titleId)} />}
        </span>
        {sub ?? <span className="block truncate text-xs text-muted">@{user.username}</span>}
      </span>
    </>
  )
  return link ? (
    <Link to={`/u/${encodeURIComponent(user.username)}`} className={cn('flex min-w-0 items-center gap-3 hover:opacity-90', className)}>
      {body}
    </Link>
  ) : (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>{body}</span>
  )
}
