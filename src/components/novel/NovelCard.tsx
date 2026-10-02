import { motion } from 'framer-motion'
import { ArrowUpRight, BookOpen, Eye, Heart } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { compactNumber, isFresh, plural } from '../../lib/format'
import type { Novel } from '../../types'
import { useSpotlight } from '../../hooks/useSpotlight'
import { Cover } from './Cover'
import { RatingBadge, StatusPill } from './Bits'

interface CardProps {
  novel: Novel
  className?: string
  /** Прогресс чтения 0–1, если тайтл в библиотеке */
  progress?: number
  priority?: boolean
}

export function NovelCard({ novel, className, progress, priority }: CardProps) {
  const fresh = isFresh(novel.lastChapterAt, 3)
  return (
    <Link to={`/novel/${novel.slug}`} className={cn('group block outline-none', className)}>
      <div className="relative">
        <div className="relative transition-transform duration-500 ease-out group-hover:-translate-y-1.5 group-hover:rotate-[-0.6deg] group-focus-visible:-translate-y-1.5">
          <div className="absolute inset-x-[8%] -bottom-3 top-[30%] -z-10 rounded-[40%] bg-accent/0 blur-2xl transition-colors duration-500 group-hover:bg-accent/30" />
          <Cover novel={novel} className="shadow-cover" priority={priority} />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
            <StatusPill status={novel.status} glass />
            {fresh && (
              <span className="rounded-full bg-ember px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-glow">
                новая глава
              </span>
            )}
          </div>
          <div className="absolute right-2 top-2">
            <RatingBadge novel={novel} glass />
          </div>
          {progress !== undefined && (
            <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-black/40 backdrop-blur">
              <div className="h-full rounded-full bg-ember" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <span className="absolute bottom-3 right-3 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
      <h3 className="mt-3.5 line-clamp-2 text-[15px] font-semibold leading-snug text-fg transition-colors duration-200 group-hover:text-accent">
        {novel.title}
      </h3>
      <p className="mt-1 truncate text-[12.5px] text-muted">
        {novel.genres.slice(0, 2).join(' · ')}
        {novel.chaptersCount > 0 && (
          <>
            {' '}
            · {novel.chaptersCount} {plural(novel.chaptersCount, ['глава', 'главы', 'глав'])}
          </>
        )}
      </p>
    </Link>
  )
}

export function NovelRow({ novel, className, highlightTitle }: CardProps & { highlightTitle?: ReactNode }) {
  const onMove = useSpotlight<HTMLAnchorElement>()
  return (
    <Link
      to={`/novel/${novel.slug}`}
      onPointerMove={onMove}
      className={cn(
        'spotlight spotlight-border group flex gap-4 rounded-3xl border border-line/[0.08] bg-surface/50 p-3 transition-colors duration-300 hover:bg-surface/80 sm:gap-5 sm:p-4',
        className
      )}
    >
      <Cover novel={novel} className="w-24 shrink-0 shadow-cover sm:w-28" rounded="rounded-xl" showTitle={false} />
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={novel.status} />
          <RatingBadge novel={novel} />
          <span className="text-[12px] text-faint">
            {novel.country}
            {novel.year ? ` · ${novel.year}` : ''} · {novel.ageRating}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 font-display text-[15px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-accent sm:text-base">
          {highlightTitle ?? novel.title}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">{novel.author}</p>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-fg-2/80 max-sm:hidden">{novel.description.split('\n')[0]}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[12px] text-muted">
          <span className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            {novel.chaptersCount} гл.
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {compactNumber(novel.views)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {compactNumber(novel.libraryCount)}
          </span>
          <span className="truncate max-sm:hidden">{novel.genres.slice(0, 3).join(' · ')}</span>
        </div>
      </div>
    </Link>
  )
}

export function NovelCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[2/3] rounded-2xl" />
      <div className="skeleton mt-3.5 h-4 w-4/5 rounded-full" />
      <div className="skeleton mt-2 h-3 w-1/2 rounded-full" />
    </div>
  )
}

/** Сетка карточек с «каскадным» появлением. */
export function NovelGrid({ novels, className, progressMap }: { novels: Novel[]; className?: string; progressMap?: Map<string, number> }) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6', className)}>
      {novels.map((n, i) => (
        <motion.div
          key={n.id}
          layout
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.5, delay: Math.min(i, 12) * 0.035, ease: [0.22, 1, 0.36, 1] }}
        >
          <NovelCard novel={n} progress={progressMap?.get(n.id)} priority={i < 6} />
        </motion.div>
      ))}
    </div>
  )
}
