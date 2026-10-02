import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Reveal } from '../effects/Motion'

interface SectionHeaderProps {
  kanji?: string
  kicker: string
  title: ReactNode
  link?: { to: string; label: string }
  className?: string
  aside?: ReactNode
}

export function SectionHeader({ kanji, kicker, title, link, className, aside }: SectionHeaderProps) {
  return (
    <Reveal className={cn('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <p className="kicker">
          {kanji && <span className="font-jp text-sm normal-case tracking-normal text-accent">{kanji}</span>}
          {kicker}
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-[2rem] sm:leading-tight">{title}</h2>
      </div>
      {aside}
      {link && (
        <Link
          to={link.to}
          className="group inline-flex items-center gap-1.5 rounded-full border border-line/10 px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:border-accent/40 hover:text-accent"
        >
          {link.label}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </Reveal>
  )
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6', className)}>{children}</div>
}
