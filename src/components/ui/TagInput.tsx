import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { FieldWrap } from './Field'

interface TagInputProps {
  label?: string
  hint?: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  max?: number
}

/** Поле-«чипсы»: Enter или запятая добавляют значение, Backspace удаляет последнее. */
export function TagInput({ label, hint, value, onChange, placeholder, max = 30 }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p)
    onChange(next)
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }
  return (
    <FieldWrap label={label} hint={hint}>
      <div
        className={cn(
          'field flex min-h-[50px] flex-wrap items-center gap-1.5 py-2 focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_rgb(var(--accent)/0.14)]'
        )}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-line/[0.07] py-1 pl-3 pr-1 text-[13px] text-fg">
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-line/10 hover:text-fg"
              aria-label={`Убрать ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (/[,\n]/.test(text)) {
              e.preventDefault()
              add(text)
            }
          }}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-faint"
        />
      </div>
    </FieldWrap>
  )
}
