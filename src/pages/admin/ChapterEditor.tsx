import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Bold, Eye, Heading, ImagePlus, Italic, Minus, PenLine, Quote, Save, Trash } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { ChapterContent } from '../../components/reader/ChapterContent'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Segmented, Switch } from '../../components/ui/Controls'
import { Input } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Feedback'
import { ConfirmDialog } from '../../components/ui/Overlay'
import { api, errorMessage } from '../../lib/api'
import { safeStorage } from '../../lib/kv'
import { cn } from '../../lib/cn'
import { formatNumber, readingMinutes, timeAgo } from '../../lib/format'
import { invalidateCatalog, qk, useChapter, useChapters, useNovel } from '../../lib/queries'
import { countWords, parseContent } from '../../lib/text'
import { toast } from '../../store/toast'

interface Draft {
  volume: number
  number: number
  title: string
  content: string
  published: boolean
}

interface StoredDraft extends Draft {
  savedAt: string
}

const draftKey = (novelId: string, chapterId?: string) => `shiori-draft:${novelId}:${chapterId ?? 'new'}`

const TOOLS = [
  { icon: Italic, label: 'Курсив', wrap: ['*', '*'] },
  { icon: Bold, label: 'Жирный', wrap: ['**', '**'] },
  { icon: Quote, label: 'Цитата / письмо', line: '> ' },
  { icon: Heading, label: 'Подзаголовок', line: '# ' },
  { icon: Minus, label: 'Смена сцены', block: '* * *' },
  { icon: ImagePlus, label: 'Иллюстрация', block: '![Подпись](https://ссылка-на-картинку.jpg)' },
] as const

export default function ChapterEditor() {
  const { id: novelId, chapterId } = useParams()
  const isNew = !chapterId
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: novel } = useNovel(novelId)
  const { data: chapters = [] } = useChapters(novel?.id, { drafts: true })
  const { data: chapter, isLoading } = useChapter(chapterId)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const savedRef = useRef(false)

  const suggested = useMemo(() => {
    const lastVolume = Math.max(1, ...chapters.map((c) => c.volume))
    const inVolume = chapters.filter((c) => c.volume === lastVolume)
    return { volume: lastVolume, number: Math.floor(Math.max(0, ...inVolume.map((c) => c.number))) + 1 }
  }, [chapters])

  const initial: Draft | null = useMemo(() => {
    if (isNew) return { volume: suggested.volume, number: suggested.number, title: '', content: '', published: true }
    if (!chapter) return null
    return { volume: chapter.volume, number: chapter.number, title: chapter.title, content: chapter.content, published: chapter.published }
  }, [isNew, chapter, suggested])

  const [form, setForm] = useState<Draft | null>(null)
  const [view, setView] = useState<'write' | 'split' | 'preview'>(() => (window.innerWidth >= 1280 ? 'split' : 'write'))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stored, setStored] = useState<StoredDraft | null>(null)

  useEffect(() => {
    if (!initial || !novelId) return
    setForm(initial)
    try {
      const raw = safeStorage.get(draftKey(novelId, chapterId))
      const draft = raw ? (JSON.parse(raw) as StoredDraft) : null
      if (draft && draft.content !== initial.content) setStored(draft)
    } catch {
      /* битый черновик — игнорируем */
    }
  }, [initial, novelId, chapterId])

  const dirty = Boolean(form && initial && JSON.stringify(form) !== JSON.stringify(initial))

  // Автосохранение черновика в браузере — текст не пропадёт, даже если закрыть вкладку.
  useEffect(() => {
    if (!form || !dirty || !novelId) return
    const t = setTimeout(() => safeStorage.set(draftKey(novelId, chapterId), JSON.stringify({ ...form, savedAt: new Date().toISOString() })), 800)
    return () => clearTimeout(t)
  }, [form, dirty, novelId, chapterId])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const apply = (tool: (typeof TOOLS)[number]) => {
    const el = areaRef.current
    if (!el || !form) return
    const { selectionStart: a, selectionEnd: b, value } = el
    let next = value
    let cursor = b
    if ('wrap' in tool) {
      const [l, r] = tool.wrap
      const selected = value.slice(a, b) || 'текст'
      next = value.slice(0, a) + l + selected + r + value.slice(b)
      cursor = a + l.length + selected.length + r.length
    } else if ('line' in tool) {
      const lineStart = value.lastIndexOf('\n', a - 1) + 1
      next = value.slice(0, lineStart) + tool.line + value.slice(lineStart)
      cursor = b + tool.line.length
    } else {
      const insert = `\n\n${tool.block}\n\n`
      next = value.slice(0, a) + insert + value.slice(b)
      cursor = a + insert.length
    }
    set('content', next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const save = async (andNext = false) => {
    if (!form || !novel) return
    if (!form.content.trim()) return toast.error('Глава пустая', 'Добавьте текст главы')
    setSaving(true)
    try {
      const payload = { ...form, novelId: novel.id }
      savedRef.current = true
      if (isNew) {
        const created = await api.createChapter(payload)
        safeStorage.remove(draftKey(novel.id))
        await Promise.all([invalidateCatalog(qc), qc.invalidateQueries({ queryKey: qk.chapters(novel.id, true) })])
        toast.success('Глава добавлена', created.title || `Глава ${created.number}`)
        if (andNext) {
          setForm({ volume: form.volume, number: Math.floor(form.number) + 1, title: '', content: '', published: form.published })
          navigate(`/admin/novels/${novel.id}/chapters/new`, { replace: true })
        } else {
          navigate(`/admin/novels/${novel.id}/chapters/${created.id}`, { replace: true })
        }
      } else if (chapterId) {
        await api.updateChapter(chapterId, payload)
        safeStorage.remove(draftKey(novel.id, chapterId))
        await Promise.all([invalidateCatalog(qc), qc.invalidateQueries({ queryKey: qk.chapters(novel.id, true) })])
        toast.success('Изменения сохранены')
      }
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      savedRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'ы')) {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!novel || (!isNew && isLoading) || !form) return <PageLoader />

  const words = countWords(form.content)
  const blocks = parseContent(form.content)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/admin/novels/${novel.id}?tab=chapters`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> {novel.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && chapterId && (
            <ButtonLink to={`/read/${novel.slug}/${chapterId}`} variant="ghost" size="sm" icon={<BookOpen className="h-4 w-4" />}>
              В читалке
            </ButtonLink>
          )}
          {isNew && (
            <Button variant="secondary" size="sm" loading={saving} onClick={() => save(true)}>
              Сохранить и следующая
            </Button>
          )}
          <Button variant="primary" size="sm" loading={saving} onClick={() => save()} icon={<Save className="h-4 w-4" />}>
            Сохранить
          </Button>
        </div>
      </div>

      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{isNew ? 'Новая глава' : form.title || `Глава ${form.number}`}</h2>

      {stored && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-2/25 bg-accent-2/[0.08] p-4 text-sm">
          <span>
            Найден несохранённый черновик от <span className="font-semibold">{timeAgo(stored.savedAt)}</span>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const { savedAt: _s, ...draft } = stored
                setForm(draft)
                setStored(null)
              }}
            >
              Восстановить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                safeStorage.remove(draftKey(novel.id, chapterId))
                setStored(null)
              }}
            >
              Удалить
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-[110px_130px_1fr]">
        <Input label="Том" type="number" min={1} value={form.volume} onChange={(e) => set('volume', Math.max(1, Number(e.target.value) || 1))} />
        <Input label="Номер главы" type="number" min={0} step={0.5} value={form.number} onChange={(e) => set('number', Number(e.target.value) || 0)} />
        <Input label="Название" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Например: Свет, который ищет корабли" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-line/10 bg-line/[0.03] p-1">
          {TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              onClick={() => apply(t)}
              disabled={view === 'preview'}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-line/[0.08] hover:text-fg disabled:opacity-40"
            >
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'write', label: 'Текст', icon: <PenLine className="h-4 w-4" /> },
            { value: 'split', label: 'Рядом', icon: <BookOpen className="h-4 w-4" /> },
            { value: 'preview', label: 'Просмотр', icon: <Eye className="h-4 w-4" /> },
          ]}
        />
        <span className="ml-auto text-xs text-muted tabular">
          {formatNumber(words)} слов · {readingMinutes(words)} мин · {dirty ? <span className="text-warn">не сохранено</span> : 'сохранено'}
        </span>
      </div>

      <div className={cn('mt-4 grid gap-4', view === 'split' && 'xl:grid-cols-2')}>
        {view !== 'preview' && (
          <textarea
            ref={areaRef}
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder={'Каждая строка — абзац.\n\n* * * — смена сцены\n> Письмо или записка\n*курсив* и **жирный**'}
            spellCheck
            lang="ru"
            className="field min-h-[60vh] resize-y font-serif text-[16px] leading-[1.75]"
          />
        )}
        {view !== 'write' && (
          <div className="reader-root reader-theme-paper min-h-[60vh] overflow-y-auto rounded-2xl border border-line/10 px-6 py-8 sm:px-10" style={{ ['--r-font' as string]: "'Literata', Georgia, serif", ['--r-size' as string]: '17px', ['--r-lh' as string]: 1.75, ['--r-gap' as string]: '0.85em', ['--r-indent' as string]: '0', ['--r-align' as string]: 'left', ['--r-hyphens' as string]: 'auto', maxHeight: view === 'split' ? '75vh' : undefined }}>
            {blocks.length ? (
              <ChapterContent
                blocks={blocks}
                header={
                  <header className="mb-8 text-center">
                    <p className="text-xs text-reader-muted">
                      Том {form.volume} · Глава {form.number}
                    </p>
                    {form.title && <h1 className="mt-2 font-display text-2xl font-bold">{form.title}</h1>}
                  </header>
                }
              />
            ) : (
              <p className="text-center text-sm text-reader-muted">Здесь появится текст в оформлении читалки</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line/[0.08] bg-surface/50 p-5">
        <Switch label="Опубликовать главу" description="Черновик видят только администраторы" checked={form.published} onChange={(v) => set('published', v)} />
        {!isNew && (
          <Button variant="danger" size="sm" icon={<Trash className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
            Удалить главу
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        danger
        title="Уйти без сохранения?"
        description="Черновик сохранён в этом браузере — его можно будет восстановить, вернувшись к главе."
        confirmLabel="Уйти"
        onConfirm={() => blocker.proceed?.()}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="Удалить главу?"
        description="Текст главы и отметки читателей будут удалены."
        confirmLabel="Удалить"
        onConfirm={async () => {
          if (!chapterId) return
          try {
            savedRef.current = true
            await api.deleteChapters([chapterId])
            safeStorage.remove(draftKey(novel.id, chapterId))
            await Promise.all([invalidateCatalog(qc), qc.invalidateQueries({ queryKey: qk.chapters(novel.id, true) })])
            toast.success('Глава удалена')
            navigate(`/admin/novels/${novel.id}?tab=chapters`, { replace: true })
          } catch (e) {
            savedRef.current = false
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
