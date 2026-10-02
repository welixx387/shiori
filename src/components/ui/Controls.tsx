import { motion } from 'framer-motion'
import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-300 disabled:opacity-50',
        checked ? 'border-transparent bg-ember' : 'border-line/15 bg-line/[0.08]'
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={cn('block h-[22px] w-[22px] rounded-full bg-white shadow-md', checked ? 'ml-auto' : 'ml-0')}
      />
    </button>
  )
  if (!label) return control
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-4', className)}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{description}</span>}
      </span>
      {control}
    </label>
  )
}

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label?: ReactNode
  format?: (v: number) => string
  className?: string
}

export function Slider({ value, min, max, step = 1, onChange, label, format, className }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {label && (
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-fg-2">{label}</span>
          <span className="tabular rounded-full bg-line/[0.06] px-2 py-0.5 text-xs font-semibold text-fg">
            {format ? format(value) : value}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range"
        style={{ ['--fill' as string]: `${fill}%` }}
      />
    </div>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({ value, options, onChange, className, size = 'md' }: SegmentedProps<T>) {
  const id = useId()
  return (
    <div
      className={cn('inline-flex rounded-full border border-line/10 bg-line/[0.04] p-1', className)}
      role="radiogroup"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-200',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-[13px]',
              active ? 'text-fg' : 'text-muted hover:text-fg-2'
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full border border-line/10 bg-surface shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface TabsProps<T extends string> {
  value: T
  tabs: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}

export function Tabs<T extends string>({ value, tabs, onChange, className }: TabsProps<T>) {
  const id = useId()
  return (
    <div className={cn('scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1', className)} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-200',
              active ? 'text-fg' : 'text-muted hover:text-fg-2'
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-0 rounded-full bg-line/[0.07]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {active && (
              <motion.span
                layoutId={`tab-line-${id}`}
                className="absolute inset-x-4 -bottom-px h-[2px] rounded-full bg-ember"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 py-px text-[11px] font-semibold',
                    active ? 'bg-accent/15 text-accent' : 'bg-line/[0.07] text-muted'
                  )}
                >
                  {t.count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  icon?: ReactNode
  className?: string
  tone?: 'accent' | 'danger'
}

export function Chip({ active, onClick, children, icon, className, tone = 'accent' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'chip select-none active:scale-95',
        active &&
          (tone === 'danger'
            ? 'border-danger/40 bg-danger/10 text-danger hover:border-danger/60 hover:text-danger'
            : 'border-accent/40 bg-accent/10 text-accent hover:border-accent/60 hover:text-accent'),
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
}
