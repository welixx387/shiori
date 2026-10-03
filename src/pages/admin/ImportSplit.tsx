import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FileUp, Scissors, Wand } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Segmented, Slider, Switch } from '../../components/ui/Controls'
import { Input } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatNumber, plural } from '../../lib/format'
import { invalidateCatalog, qk, useChapters } from '../../lib/queries'
import { HEADING_PATTERN, parseFb2, readTextFile, splitIntoChapters, type SplitMode, type SplitPart } from '../../lib/text'
import { toast } from '../../store/toast'
import type { Novel } from '../../types'

const SAMPLE = `Пролог

Ночь была тихой — слишком тихой для порта, в котором никогда не спят.

Глава 1. Человек с фонарём

Он пришёл с первым туманом и попросил комнату с окном на море.

— Надолго? — спросила хозяйка.
— Пока не погаснет, — ответил он и поднял фонарь.

Глава 2. Чужие письма

Утром на пороге лежало письмо без марки. На конверте было написано моё имя.`

interface Row extends SplitPart {
  include: boolean
  open: boolean
}

export default function ImportSplit({ novel, onDone }: { novel: Novel; onDone: () => void }) {
  const qc = useQueryClient()
  const { data: chapters = [] } = useChapters(novel.id, { drafts: true })
  const [text, setText] = useState('')
  const [structured, setStructured] = useState<SplitPart[] | null>(null)
  const [fullText, setFullText] = useState('')
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<SplitMode>('headings')
  const [pattern, setPattern] = useState(HEADING_PATTERN)
  const [wordsPer, setWordsPer] = useState(3000)
  const [volume, setVolume] = useState(1)
  const [numbering, setNumbering] = useState<'sequential' | 'headings'>('sequential')
  const [start, setStart] = useState(1)
  const [publish, setPublish] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [pending, setPending] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const lastInVolume = useMemo(
    () => Math.max(0, ...chapters.filter((c) => c.volume === volume).map((c) => Math.floor(c.number))),
    [chapters, volume]
  )
  useEffect(() => setStart(lastInVolume + 1), [lastInVolume])

  const patternError = useMemo(() => {
    if (mode !== 'regex') return ''
    try {
      new RegExp(pattern, 'iu')
      return ''
    } catch {
      return 'Некорректное регулярное выражение'
    }
  }, [mode, pattern])

  const parts = useMemo(() => {
    if (structured) return structured
    if (!text.trim() || patternError) return []
    return splitIntoChapters(text, { mode, pattern, wordsPerChapter: wordsPer })
  }, [structured, text, mode, pattern, wordsPer, patternError])

  useEffect(() => {
    setRows(parts.map((p) => ({ ...p, include: p.words > 0, open: false })))
  }, [parts])

  const included = rows.filter((r) => r.include)
  const numberFor = (r: Row, indexAmongIncluded: number) =>
    numbering === 'headings' && r.number !== null ? r.number : start + indexAmongIncluded

  const loadFile = async (file: File) => {
    try {
      setFileName(file.name)
      const name = file.name.toLowerCase()
      if (name.endsWith('.fb2')) {
        const xml = await readTextFile(file)
        const parsed = parseFb2(xml)
        setStructured(parsed.parts)
        setFullText(parsed.parts.map((p) => `${p.title}\n\n${p.content}`).join('\n\n'))
        setText('')
        toast.success('FB2 прочитан', `${parsed.title || file.name}: разделов — ${parsed.parts.length}`)
      } else if (/\.(epub|docx|html?)$/.test(name)) {
        const { parseDocx, parseEpub, parseHtml } = await import('../../lib/books')
        const book = name.endsWith('.epub')
          ? parseEpub(await file.arrayBuffer())
          : name.endsWith('.docx')
            ? parseDocx(await file.arrayBuffer())
            : parseHtml(await readTextFile(file))
        setFullText(book.text)
        if (book.parts.length > 1) {
          setStructured(book.parts)
          setText('')
          toast.success('Файл прочитан', `${book.title || file.name}: глав по структуре файла — ${book.parts.length}`)
        } else {
          setStructured(null)
          setText(book.text)
          toast.success('Файл прочитан', 'Разделов не нашлось — выберите ниже, как делить текст')
        }
      } else if (/\.(doc|pdf|rtf|mobi|azw3?)$/.test(name)) {
        throw new Error('Этот формат не читается в браузере. Сохраните книгу как EPUB, FB2, DOCX или TXT')
      } else {
        setStructured(null)
        setFullText('')
        setText(await readTextFile(file))
      }
    } catch (e) {
      toast.error('Не удалось прочитать файл', errorMessage(e))
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const importAll = async () => {
    if (!included.length) return
    setPending(true)
    try {
      let n = 0
      const inputs = rows
        .filter((r) => r.include)
        .map((r) => ({
          novelId: novel.id,
          volume,
          number: numberFor(r, n++),
          title: r.title,
          content: r.content,
          published: publish,
        }))
      await api.createChapters(inputs)
      await Promise.all([invalidateCatalog(qc), qc.invalidateQueries({ queryKey: qk.chapters(novel.id, true) })])
      toast.success(`Добавлено ${inputs.length} ${plural(inputs.length, ['глава', 'главы', 'глав'])}`, publish ? 'Читатели уже видят их' : 'Сохранены как черновики')
      setText('')
      setStructured(null)
      setFileName('')
      onDone()
    } catch (e) {
      toast.error('Импорт не удался', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const totalWords = included.reduce((s, r) => s + r.words, 0)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        <section className="rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">Текст для разбивки</h2>
              <p className="mt-0.5 text-sm text-muted">Вставьте целый том или загрузите файл: EPUB, FB2, DOCX, TXT, MD или HTML</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" icon={<Wand className="h-4 w-4" />} onClick={() => { setStructured(null); setText(SAMPLE) }}>
                Пример
              </Button>
              <Button size="sm" variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                Файл
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.fb2,.epub,.docx,.html,.htm,text/plain,application/epub+zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) loadFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          {structured ? (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-accent-3/10 p-4 text-sm">
              <span>
                <span className="font-semibold">{fileName}</span> — разделы файла станут главами
              </span>
              <span className="flex shrink-0 gap-1">
                {fullText && (
                  <Button size="sm" variant="ghost" onClick={() => { setStructured(null); setText(fullText) }}>
                    Разбить по-своему
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setStructured(null); setFileName(''); setFullText('') }}>
                  Сбросить
                </Button>
              </span>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                const f = e.dataTransfer.files?.[0]
                if (f) loadFile(f)
              }}
              placeholder={'Глава 1. Название\n\nТекст первой главы…\n\nГлава 2. Название\n\nТекст второй главы…'}
              className={cn('field mt-5 min-h-[320px] resize-y font-serif text-[15px] leading-relaxed', drag && 'border-accent bg-accent/5')}
            />
          )}
          {text && !structured && (
            <p className="mt-2 px-1 text-xs text-faint">
              {formatNumber(text.length)} символов{fileName ? ` · ${fileName}` : ''}
            </p>
          )}
        </section>

        <section className="space-y-5 rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
          <h2 className="font-display text-base font-semibold">Как делить</h2>
          {!structured && (
            <>
              <Segmented
                className="flex-wrap"
                value={mode}
                onChange={setMode}
                size="sm"
                options={[
                  { value: 'headings', label: '«Глава N»' },
                  { value: 'numbered', label: '«1.», «2)»' },
                  { value: 'separator', label: 'По «***»' },
                  { value: 'words', label: 'По объёму' },
                  { value: 'regex', label: 'Свой шаблон' },
                ]}
              />
              <p className="text-xs leading-relaxed text-muted">
                {mode === 'headings' && 'Находит строки «Глава 12», «Chapter 3», «Пролог», «Эпилог», «Интерлюдия», «Экстра». Римские цифры тоже понимает.'}
                {mode === 'numbered' && 'Заголовки вида «1. Название» или «2) Название» на отдельной строке.'}
                {mode === 'separator' && 'Новая глава начинается после строки из «***», «---» или «⁂».'}
                {mode === 'words' && 'Режет на части примерно одинакового объёма — по границе абзаца.'}
                {mode === 'regex' && 'Строка, совпавшая с шаблоном, становится заголовком новой главы.'}
              </p>
              {mode === 'words' && (
                <Slider label="Слов в главе" min={1000} max={10000} step={250} value={wordsPer} onChange={setWordsPer} format={(v) => formatNumber(v)} />
              )}
              {mode === 'regex' && <Input label="Регулярное выражение" value={pattern} onChange={(e) => setPattern(e.target.value)} error={patternError || undefined} className="font-mono text-xs" />}
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Том" type="number" min={1} value={volume} onChange={(e) => setVolume(Math.max(1, Number(e.target.value) || 1))} />
            <Input
              label="Начать нумерацию с"
              type="number"
              min={0}
              step={1}
              value={start}
              disabled={numbering === 'headings'}
              onChange={(e) => setStart(Number(e.target.value) || 0)}
              hint={lastInVolume ? `Последняя глава тома: ${lastInVolume}` : undefined}
            />
          </div>
          <Segmented
            value={numbering}
            onChange={setNumbering}
            size="sm"
            options={[
              { value: 'sequential', label: 'Нумеровать подряд' },
              { value: 'headings', label: 'Номера из заголовков' },
            ]}
          />
          <Switch label="Сразу опубликовать" description="Иначе главы сохранятся черновиками" checked={publish} onChange={setPublish} />
        </section>
      </div>

      <section className="rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7 xl:sticky xl:top-24 xl:self-start">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Предпросмотр</h2>
            <p className="mt-0.5 text-sm text-muted">
              {rows.length ? (
                <>
                  Будет создано <span className="font-semibold text-fg">{included.length}</span> {plural(included.length, ['глава', 'главы', 'глав'])} ·{' '}
                  {formatNumber(totalWords)} слов
                </>
              ) : (
                'Вставьте текст — главы появятся здесь'
              )}
            </p>
          </div>
          <Button variant="primary" loading={pending} disabled={!included.length} onClick={importAll} icon={<Scissors className="h-4 w-4" />}>
            Создать главы
          </Button>
        </div>

        <div className="mt-5 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {(() => {
            let n = 0
            return rows.map((r, i) => {
              const num = r.include ? numberFor(r, n++) : null
              return (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.02 }}
                  className={cn('rounded-2xl border border-line/[0.08] bg-bg/40 p-3', !r.include && 'opacity-50')}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(i, { include: e.target.checked })}
                      className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                      aria-label="Импортировать эту часть"
                    />
                    <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-line/[0.06] px-1.5 font-display text-xs font-semibold tabular">
                      {num ?? '—'}
                    </span>
                    <input
                      value={r.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-sm font-medium outline-none focus:bg-line/[0.05]"
                    />
                    <span className="shrink-0 text-xs text-faint tabular">{formatNumber(r.words)} сл.</span>
                    <button
                      onClick={() => update(i, { open: !r.open })}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line/[0.07]"
                      aria-label="Показать начало текста"
                    >
                      <ChevronDown className={cn('h-4 w-4 transition-transform', r.open && 'rotate-180')} />
                    </button>
                  </div>
                  <AnimatePresence>
                    {r.open && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden whitespace-pre-line px-1 pt-3 font-serif text-[13px] leading-relaxed text-fg-2"
                      >
                        {r.content.slice(0, 420) || '— пустая часть —'}
                        {r.content.length > 420 && '…'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })
          })()}
        </div>
      </section>
    </div>
  )
}
