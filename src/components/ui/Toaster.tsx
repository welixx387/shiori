import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Info, Sparkles, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useToasts } from '../../store/toast'

const ICONS = {
  default: Sparkles,
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
}

const TONES = {
  default: 'text-accent-2',
  success: 'text-ok',
  error: 'text-danger',
  info: 'text-accent-3',
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl p-4 pr-3 shadow-float"
              role="status"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', TONES[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.description}</p>}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick()
                      dismiss(t.id)
                    }}
                    className="mt-2 text-[13px] font-semibold text-accent hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-line/[0.07] hover:text-fg"
                aria-label="Закрыть уведомление"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
