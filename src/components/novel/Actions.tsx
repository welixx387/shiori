import { AnimatePresence, motion } from 'framer-motion'
import { BookmarkPlus, Check, ChevronDown, Heart, Link2, Share2, Star, Trash } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SHELVES, SHELF_ORDER } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { useLibraryEntry, useMyRating, useRate, useSetLibrary } from '../../lib/queries'
import { useUser } from '../../store/auth'
import { toast } from '../../store/toast'
import type { Novel } from '../../types'
import { Button, IconButton } from '../ui/Button'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'

function useRequireAuth() {
  const user = useUser()
  const navigate = useNavigate()
  const location = useLocation()
  return (action: () => void) => {
    if (!user) {
      toast.info('Нужен аккаунт', 'Войдите, чтобы собирать библиотеку и ставить оценки')
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    action()
  }
}

function Burst({ trigger }: { trigger: number }) {
  return (
    <AnimatePresence>
      {trigger > 0 && (
        <motion.span key={trigger} className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-accent"
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(a) * 26, y: Math.sin(a) * 26, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )
          })}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

export function ShelfButton({ novel, size = 'lg', className }: { novel: Novel; size?: 'md' | 'lg'; className?: string }) {
  const entry = useLibraryEntry(novel.id)
  const setLibrary = useSetLibrary()
  const requireAuth = useRequireAuth()
  const [burst, setBurst] = useState(0)
  const shelf = entry?.shelf ? SHELVES[entry.shelf] : null
  const Icon = shelf?.icon ?? BookmarkPlus

  return (
    <Menu
      align="left"
      width="w-60"
      trigger={({ toggle, open }) => (
        <Button
          variant="glass"
          size={size}
          className={cn('relative', shelf && shelf.tone, className)}
          onClick={() => requireAuth(toggle)}
          icon={<Icon className="h-[18px] w-[18px]" />}
          iconRight={<ChevronDown className={cn('h-4 w-4 opacity-60 transition-transform', open && 'rotate-180')} />}
        >
          <Burst trigger={burst} />
          {shelf ? shelf.label : 'В библиотеку'}
        </Button>
      )}
    >
      {(close) => (
        <>
          {SHELF_ORDER.map((id) => {
            const s = SHELVES[id]
            const ShelfIcon = s.icon
            const active = entry?.shelf === id
            return (
              <MenuItem
                key={id}
                active={active}
                icon={<ShelfIcon className={cn('h-4 w-4', !active && s.tone)} />}
                hint={active ? <Check className="h-4 w-4" /> : undefined}
                onClick={() => {
                  setLibrary.mutate({ novelId: novel.id, shelf: active ? null : id })
                  if (!active) {
                    setBurst((b) => b + 1)
                    toast.success(`«${novel.title}»`, `Добавлено на полку «${s.label}»`)
                  }
                  close()
                }}
              >
                {s.label}
              </MenuItem>
            )
          })}
          {entry?.shelf && (
            <>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash className="h-4 w-4" />}
                onClick={() => {
                  setLibrary.mutate({ novelId: novel.id, shelf: null })
                  close()
                }}
              >
                Убрать с полки
              </MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  )
}

export function FavoriteButton({ novel, size = 'lg' }: { novel: Novel; size?: 'md' | 'lg' }) {
  const entry = useLibraryEntry(novel.id)
  const setLibrary = useSetLibrary()
  const requireAuth = useRequireAuth()
  const [burst, setBurst] = useState(0)
  const active = Boolean(entry?.favorite)
  return (
    <IconButton
      label={active ? 'Убрать из любимого' : 'В любимое'}
      variant="glass"
      size={size}
      className={cn('relative', active && 'text-accent hover:text-accent')}
      onClick={() =>
        requireAuth(() => {
          setLibrary.mutate({ novelId: novel.id, favorite: !active })
          if (!active) setBurst((b) => b + 1)
        })
      }
    >
      <Burst trigger={burst} />
      <motion.span key={String(active)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
        <Heart className={cn('h-5 w-5', active && 'fill-accent')} />
      </motion.span>
    </IconButton>
  )
}

export function ShareButton({ novel, size = 'lg' }: { novel: Novel; size?: 'md' | 'lg' }) {
  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: novel.title, text: `Читаю «${novel.title}»`, url })
        return
      } catch (e) {
        // Пользователь сам закрыл окно — ничего не делаем; иначе копируем ссылку.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Ссылка скопирована', 'Поделитесь ею с друзьями')
    } catch {
      toast.info('Скопируйте ссылку из адресной строки', url)
    }
  }
  return (
    <IconButton label="Поделиться" variant="glass" size={size} onClick={share}>
      {typeof navigator !== 'undefined' && 'share' in navigator ? <Share2 className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
    </IconButton>
  )
}

const SCORE_LABELS = ['', 'Ужасно', 'Очень плохо', 'Плохо', 'Так себе', 'Средне', 'Неплохо', 'Хорошо', 'Очень хорошо', 'Отлично', 'Шедевр']

export function RatingPicker({ novel }: { novel: Novel }) {
  const mine = useMyRating(novel.id)
  const rate = useRate()
  const requireAuth = useRequireAuth()
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? mine ?? 0

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg-2">Ваша оценка</p>
        <AnimatePresence mode="wait">
          <motion.p
            key={shown}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn('text-sm font-semibold', shown ? 'text-accent' : 'text-faint')}
          >
            {shown ? `${shown} · ${SCORE_LABELS[shown]}` : 'не оценено'}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-3 flex gap-1" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: 10 }, (_, i) => {
          const score = i + 1
          const on = score <= shown
          return (
            <button
              key={score}
              type="button"
              aria-label={`Оценка ${score}`}
              onPointerEnter={() => setHover(score)}
              onClick={() =>
                requireAuth(() => {
                  const next = mine === score ? null : score
                  rate.mutate({ novelId: novel.id, score: next })
                  if (next) toast.success(`Оценка ${next} из 10`, SCORE_LABELS[next])
                })
              }
              className="group/star flex-1 py-1"
            >
              <Star
                className={cn(
                  'mx-auto h-6 w-6 transition-all duration-200 group-hover/star:scale-125',
                  on ? 'fill-accent-2 text-accent-2 drop-shadow-[0_0_8px_rgb(var(--accent-2)/0.6)]' : 'text-line/20'
                )}
                style={{ transitionDelay: on ? `${i * 18}ms` : '0ms' }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
