import { motion } from 'framer-motion'
import { BookOpen, Columns2, GalleryHorizontal, RotateCcw, ScrollText, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { READER_FONTS, READER_THEMES, ensureReaderFont, useReaderSettings } from '../../store/reader'
import { Button } from '../ui/Button'
import { Segmented, Slider, Switch } from '../ui/Controls'
import { Select } from '../ui/Field'

function useRussianVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const load = () => {
      const all = speechSynthesis.getVoices()
      const ru = all.filter((v) => v.lang.toLowerCase().startsWith('ru'))
      setVoices(ru.length ? ru : all)
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

export function SettingsPanel() {
  const s = useReaderSettings()
  const voices = useRussianVoices()
  const desktop = typeof window !== 'undefined' && window.innerWidth >= 768

  return (
    <div className="space-y-7 pb-4">
      <section>
        <p className="kicker mb-3">Тема страницы</p>
        <div className="grid grid-cols-6 gap-2">
          {READER_THEMES.map((t) => {
            const active = s.theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => s.set({ theme: t.id })}
                className="group flex flex-col items-center gap-1.5"
                aria-label={t.label}
                aria-pressed={active}
              >
                <span
                  className={cn(
                    'relative flex h-12 w-12 items-center justify-center rounded-2xl border font-serif text-base font-semibold transition-transform duration-200 group-hover:scale-105',
                    active ? 'border-transparent' : 'border-line/15'
                  )}
                  style={{ background: t.bg, color: t.fg }}
                >
                  Аа
                  {active && (
                    <motion.span
                      layoutId="reader-theme"
                      className="absolute -inset-1 rounded-[20px] border-2 border-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    />
                  )}
                </span>
                <span className={cn('text-[11px]', active ? 'font-semibold text-fg' : 'text-muted')}>{t.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <p className="kicker mb-3">Режим чтения</p>
        <Segmented
          className="w-full"
          value={s.mode}
          onChange={(mode) => s.set({ mode })}
          options={[
            { value: 'scroll', label: 'Лента', icon: <ScrollText className="h-4 w-4" /> },
            { value: 'paged', label: 'Страницы', icon: <Columns2 className="h-4 w-4" /> },
          ]}
        />
        <p className="mt-2 px-1 text-xs text-muted">
          {s.mode === 'paged'
            ? 'Листайте свайпом, касанием левого или правого края страницы, колесом мыши или стрелками.'
            : 'Прокручивайте текст как обычную страницу.'}
        </p>
        {s.mode === 'paged' && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 px-1 text-xs font-semibold text-fg-2">Анимация листания</p>
              <Segmented
                className="w-full"
                value={s.turn}
                onChange={(turn) => s.set({ turn })}
                options={[
                  { value: 'flip', label: 'Книга', icon: <BookOpen className="h-4 w-4" /> },
                  { value: 'slide', label: 'Сдвиг', icon: <GalleryHorizontal className="h-4 w-4" /> },
                  { value: 'none', label: 'Без', icon: <Square className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
            <Switch
              label="Разворот из двух страниц"
              description="На широком экране и на телефоне, повёрнутом горизонтально"
              checked={s.spread === 'auto'}
              onChange={(on) => s.set({ spread: on ? 'auto' : 'single' })}
            />
          </div>
        )}
      </section>

      <section>
        <p className="kicker mb-3">Шрифт</p>
        <div className="grid grid-cols-3 gap-2">
          {READER_FONTS.map((f) => {
            const active = s.font === f.id
            return (
              <button
                key={f.id}
                onMouseEnter={() => ensureReaderFont(f.id)}
                onFocus={() => ensureReaderFont(f.id)}
                onClick={() => {
                  ensureReaderFont(f.id)
                  s.set({ font: f.id })
                }}
                className={cn(
                  'rounded-2xl border px-2 py-3 text-center transition-colors',
                  active ? 'border-accent/60 bg-accent/10 text-fg' : 'border-line/10 text-fg-2 hover:border-line/25'
                )}
              >
                <span className="block text-xl leading-none" style={{ fontFamily: f.family }}>
                  Аа
                </span>
                <span className="mt-1.5 block truncate text-[11px] text-muted">{f.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-5">
        <Slider label="Размер текста" min={14} max={30} value={s.fontSize} onChange={(fontSize) => s.set({ fontSize })} format={(v) => `${v}px`} />
        <Slider label="Межстрочный интервал" min={1.3} max={2.3} step={0.05} value={s.lineHeight} onChange={(lineHeight) => s.set({ lineHeight })} format={(v) => v.toFixed(2)} />
        <Slider label="Отступ между абзацами" min={0} max={1.8} step={0.05} value={s.paragraphGap} onChange={(paragraphGap) => s.set({ paragraphGap })} format={(v) => `${v.toFixed(2)} em`} />
        {desktop && (
          <Slider label="Ширина колонки" min={480} max={980} step={10} value={s.width} onChange={(width) => s.set({ width })} format={(v) => `${v}px`} />
        )}
        <Slider label="Затемнение экрана" min={0} max={0.6} step={0.05} value={s.dim} onChange={(dim) => s.set({ dim })} format={(v) => `${Math.round(v * 100)}%`} />
      </section>

      <section className="space-y-4 rounded-3xl border border-line/[0.08] bg-line/[0.03] p-4">
        <Switch label="Красная строка" description="Отступ в начале абзаца, как в книгах" checked={s.indent} onChange={(indent) => s.set({ indent })} />
        <Switch label="По ширине" description="Ровный правый край текста" checked={s.justify} onChange={(justify) => s.set({ justify })} />
        <Switch label="Переносы слов" description="Аккуратнее на узких экранах" checked={s.hyphens} onChange={(hyphens) => s.set({ hyphens })} />
      </section>

      {typeof speechSynthesis !== 'undefined' && (
        <section className="space-y-4">
          <p className="kicker">Озвучка</p>
          {voices.length > 0 && (
            <Select
              label="Голос"
              value={s.ttsVoice ?? ''}
              onChange={(v) => s.set({ ttsVoice: v || null })}
              options={[{ value: '', label: 'По умолчанию' }, ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` }))]}
            />
          )}
          <Slider label="Скорость речи" min={0.6} max={2} step={0.05} value={s.ttsRate} onChange={(ttsRate) => s.set({ ttsRate })} format={(v) => `×${v.toFixed(2)}`} />
          <Switch label="Продолжать со следующей главы" checked={s.autoNext} onChange={(autoNext) => s.set({ autoNext })} />
        </section>
      )}

      <div className="rounded-3xl border border-line/[0.08] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-accent" />
          Горячие клавиши
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted">
          <li>← → — страницы / главы</li>
          <li>Пробел — дальше</li>
          <li>M — лента или страницы</li>
          <li>C — оглавление</li>
          <li>S — настройки</li>
          <li>B — закладка</li>
          <li>T — озвучка</li>
          <li>F — полный экран</li>
        </ul>
      </div>

      <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={s.reset} className="w-full">
        Сбросить настройки
      </Button>
    </div>
  )
}
