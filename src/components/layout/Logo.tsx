import { Link } from 'react-router-dom'
import { SITE } from '../../lib/constants'
import { cn } from '../../lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line/10 bg-surface-2',
        className
      )}
    >
      <span className="absolute inset-0 bg-ember opacity-20 transition-opacity duration-300 group-hover:opacity-40" />
      <svg viewBox="0 0 24 24" className="relative h-[22px] w-[22px] origin-top transition-transform duration-500 group-hover:animate-sway">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgb(var(--accent))" />
            <stop offset="0.55" stopColor="rgb(var(--accent-2))" />
            <stop offset="1" stopColor="rgb(var(--accent-3))" />
          </linearGradient>
        </defs>
        <path d="M7.2 2.5h9.6a1.2 1.2 0 0 1 1.2 1.2v17.1l-6-4.3-6 4.3V3.7a1.2 1.2 0 0 1 1.2-1.2z" fill="url(#logo-g)" />
        <circle cx="12" cy="8" r="1.6" fill="rgb(var(--surface-2))" />
      </svg>
    </span>
  )
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label={`${SITE.name} — на главную`}>
      <LogoMark />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[19px] font-bold tracking-tight">
            {SITE.name}
            <span className="text-ember">.</span>
          </span>
          <span className="font-jp text-xs text-faint transition-colors group-hover:text-accent">{SITE.kanji}</span>
        </span>
      )}
    </Link>
  )
}
