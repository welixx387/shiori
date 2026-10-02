import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/cn'

interface FieldWrapProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  className?: string
  children: ReactNode
  aside?: ReactNode
}

export function FieldWrap({ label, hint, error, htmlFor, className, children, aside }: FieldWrapProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-end justify-between gap-3 px-1">
          {label && (
            <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg-2">
              {label}
            </label>
          )}
          {aside}
        </div>
      )}
      {children}
      {error ? (
        <p className="px-1 text-[12.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="px-1 text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  icon?: ReactNode
  right?: ReactNode
  wrapClassName?: string
  aside?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, right, className, wrapClassName, aside, id, ...rest },
  ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={inputId} className={wrapClassName} aside={aside}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint">{icon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn('field', icon && 'pl-11', right && 'pr-12', error && 'border-danger/50', className)}
          aria-invalid={Boolean(error) || undefined}
          {...rest}
        />
        {right && <span className="absolute right-2 top-1/2 -translate-y-1/2">{right}</span>}
      </div>
    </FieldWrap>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'right'>>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        right={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-faint transition-colors hover:bg-line/5 hover:text-fg"
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
        {...props}
      />
    )
  }
)

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  wrapClassName?: string
  aside?: ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, wrapClassName, aside, id, ...rest },
  ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={inputId} className={wrapClassName} aside={aside}>
      <textarea
        ref={ref}
        id={inputId}
        className={cn('field min-h-[120px] resize-y leading-relaxed', error && 'border-danger/50', className)}
        {...rest}
      />
    </FieldWrap>
  )
})

interface SelectProps extends Omit<InputHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: ReactNode
  hint?: ReactNode
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  wrapClassName?: string
}

export function Select({ label, hint, options, onChange, wrapClassName, className, id, value, ...rest }: SelectProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldWrap label={label} hint={hint} htmlFor={inputId} className={wrapClassName}>
      <div className="relative">
        <select
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('field cursor-pointer appearance-none pr-10', className)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </FieldWrap>
  )
}
