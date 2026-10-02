import { Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STATUSES, genreInfo } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { formatRating } from '../../lib/format'
import type { Novel, NovelStatus } from '../../types'

export function StatusPill({ status, className, glass }: { status: NovelStatus; className?: string; glass?: boolean }) {
  const s = STATUSES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        glass ? 'bg-black/45 text-white backdrop-blur-md' : 'border border-line/10 bg-surface/70 text-fg-2',
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === 'ongoing' && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-70', s.dot)} />}
        <span className={cn('relative h-1.5 w-1.5 rounded-full', s.dot)} />
      </span>
      {s.label}
    </span>
  )
}

export function RatingBadge({ novel, className, glass }: { novel: Pick<Novel, 'ratingSum' | 'ratingCount'>; className?: string; glass?: boolean }) {
  if (!novel.ratingCount) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tabular',
        glass ? 'bg-black/45 text-white backdrop-blur-md' : 'border border-line/10 bg-surface/70 text-fg',
        className
      )}
    >
      <Star className="h-3 w-3 fill-accent-2 text-accent-2" />
      {formatRating(novel)}
    </span>
  )
}

export function GenreTag({ name, className, linked = true }: { name: string; className?: string; linked?: boolean }) {
  const g = genreInfo(name)
  const Icon = g.icon
  const content = (
    <>
      <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${g.hue} 80% 62%)` }} />
      {name}
    </>
  )
  const cls = cn('chip text-[13px]', className)
  return linked ? (
    <Link to={`/catalog?genres=${encodeURIComponent(name)}`} className={cls}>
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  )
}
