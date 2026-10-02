import { auraInfo } from '../../lib/constants'
import { cn } from '../../lib/cn'

interface AvatarProps {
  user: { displayName?: string; username?: string; avatarUrl?: string | null; aura?: string } | null | undefined
  size?: number
  className?: string
  ring?: boolean
}

export function Avatar({ user, size = 40, className, ring }: AvatarProps) {
  const name = user?.displayName || user?.username || '?'
  const initial = name.trim().charAt(0).toUpperCase()
  const aura = auraInfo(user?.aura ?? 'ember')
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        ring && 'ring-2 ring-bg ring-offset-2 ring-offset-[rgb(var(--accent)/0.6)]',
        className
      )}
      style={{ width: size, height: size, background: user?.avatarUrl ? undefined : aura.gradient }}
    >
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <>
          <span
            className="absolute inset-0 opacity-30 mix-blend-overlay"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.9), transparent 45%), radial-gradient(circle at 80% 90%, rgba(0,0,0,0.5), transparent 50%)',
            }}
          />
          <span className="relative font-display font-bold text-white drop-shadow" style={{ fontSize: size * 0.42 }}>
            {initial}
          </span>
        </>
      )}
    </span>
  )
}
