import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

const EASE = [0.22, 1, 0.36, 1] as const

let lockCount = 0
function lockScroll() {
  lockCount++
  if (lockCount === 1) {
    const sbw = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`
  }
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  }
}

function useOverlay(open: boolean, onClose: () => void, focusFirst = true) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    lockScroll()
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const selector = focusFirst ? '[data-autofocus], input, textarea, button:not([data-close])' : '[data-autofocus]'
      const el = ref.current?.querySelector<HTMLElement>(selector) ?? ref.current
      el?.focus({ preventScroll: true })
    }, 60)
    return () => {
      clearTimeout(t)
      unlockScroll()
      window.removeEventListener('keydown', onKey)
      prev?.focus?.({ preventScroll: true })
    }
  }, [open, onClose, focusFirst])
  return ref
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  hideClose?: boolean
  position?: 'center' | 'top'
}

export function Modal({ open, onClose, title, description, children, className, size = 'md', hideClose, position = 'center' }: ModalProps) {
  const ref = useOverlay(open, onClose)
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            'fixed inset-0 z-[70] flex justify-center p-4',
            position === 'top' ? 'items-start pt-[10vh]' : 'items-center'
          )}
        >
          <motion.div
            className="absolute inset-0 bg-[rgb(var(--shadow-rgb)/0.55)] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 12, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: EASE }}
            className={cn(
              'glass-strong relative max-h-[86vh] w-full overflow-y-auto rounded-[28px] p-6 shadow-float outline-none sm:p-7',
              width,
              className
            )}
          >
            {!hideClose && (
              <button
                data-close
                onClick={onClose}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-line/[0.07] hover:text-fg"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {title && <h2 className="pr-10 font-display text-lg font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1.5 pr-6 text-sm leading-relaxed text-muted">{description}</p>}
            {children && <div className={cn(title || description ? 'mt-5' : '')}>{children}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  side?: 'right' | 'left' | 'bottom'
  className?: string
  /** На мобильных шторка всегда выезжает снизу */
  responsive?: boolean
  /** Без затемнения фона — чтобы видеть, как меняется текст за шторкой */
  plain?: boolean
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

export function Sheet({ open, onClose, title, children, side = 'right', className, responsive = true, plain }: SheetProps) {
  const ref = useOverlay(open, onClose, false)
  const mobile = useIsMobile()
  const actual = responsive && mobile ? 'bottom' : side
  const variants = {
    right: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } },
    left: { initial: { x: '-100%' }, animate: { x: 0 }, exit: { x: '-100%' } },
    bottom: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } },
  }[actual]
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className={cn('absolute inset-0', plain ? 'bg-transparent' : 'bg-[rgb(var(--shadow-rgb)/0.45)] backdrop-blur-[2px]')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            {...variants}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            drag={actual === 'bottom' ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
            className={cn(
              'glass-strong absolute flex flex-col shadow-float outline-none',
              actual === 'right' && 'inset-y-0 right-0 w-full max-w-md rounded-l-[28px]',
              actual === 'left' && 'inset-y-0 left-0 w-full max-w-md rounded-r-[28px]',
              actual === 'bottom' && cn('inset-x-0 bottom-0 rounded-t-[28px] pb-safe', plain ? 'max-h-[62vh]' : 'max-h-[88vh]'),
              className
            )}
          >
            {actual === 'bottom' && <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line/20" />}
            <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-2 pt-5">
              {title ? <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2> : <span />}
              <button
                data-close
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-line/[0.07] hover:text-fg"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2" onPointerDownCapture={(e) => e.stopPropagation()}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

interface ConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Подтвердить', danger }: ConfirmProps) {
  const [pending, setPending] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={pending}
          data-autofocus
          onClick={async () => {
            setPending(true)
            try {
              await onConfirm()
              onClose()
            } finally {
              setPending(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
