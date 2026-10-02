import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Eye, EyeOff, PenLine, Plus, Scissors, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ButtonLink, IconButton } from '../../components/ui/Button'
import { Switch } from '../../components/ui/Controls'
import { EmptyState, Skeleton } from '../../components/ui/Feedback'
import { ConfirmDialog } from '../../components/ui/Overlay'
import { api, errorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate, formatDuration, formatNumber, readingMinutes } from '../../lib/format'
import { invalidateCatalog, qk, useChapters } from '../../lib/queries'
import { toast } from '../../store/toast'
import type { ChapterMeta, Novel } from '../../types'

export default function ChaptersManager({ novel, onImport }: { novel: Novel; onImport: () => void }) {
  const qc = useQueryClient()
  const { data: chapters = [], isLoading } = useChapters(novel.id, { drafts: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const volumes = useMemo(() => {
    const m = new Map<number, ChapterMeta[]>()
    for (const c of [...chapters].sort((a, b) => a.volume - b.volume || a.number - b.number)) {
      if (!m.has(c.volume)) m.set(c.volume, [])
      m.get(c.volume)!.push(c)
    }
    return [...m.entries()]
  }, [chapters])

  const allSelected = chapters.length > 0 && selected.size === chapters.length
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const refresh = () => Promise.all([invalidateCatalog(qc), qc.invalidateQueries({ queryKey: qk.chapters(novel.id, true) })])

  const setPublished = async (ids: string[], published: boolean) => {
    setBusy(true)
    qc.setQueryData<ChapterMeta[]>(qk.chapters(novel.id, true), (list) => list?.map((c) => (ids.includes(c.id) ? { ...c, published } : c)))
    try {
      for (const id of ids) await api.updateChapter(id, { published })
      toast.success(published ? 'Опубликовано' : 'Снято с публикации', `Глав: ${ids.length}`)
    } catch (e) {
      toast.error('Не получилось', errorMessage(e))
    } finally {
      setBusy(false)
      setSelected(new Set())
      refresh()
    }
  }

  const words = chapters.reduce((s, c) => s + c.wordCount, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">
          {chapters.length} глав · {formatNumber(words)} слов · ≈ {formatDuration(readingMinutes(words))} чтения
        </p>
        <Button variant="secondary" icon={<Scissors className="h-4 w-4" />} onClick={onImport}>
          Импорт и разбивка
        </Button>
        <ButtonLink to={`/admin/novels/${novel.id}/chapters/new`} variant="primary" icon={<Plus className="h-4 w-4" />}>
          Новая глава
        </ButtonLink>
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-strong sticky top-20 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl p-2 pl-4 shadow-float"
          >
            <span className="mr-auto text-sm font-medium">Выбрано: {selected.size}</span>
            <Button size="sm" variant="ghost" disabled={busy} icon={<Eye className="h-4 w-4" />} onClick={() => setPublished([...selected], true)}>
              Опубликовать
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} icon={<EyeOff className="h-4 w-4" />} onClick={() => setPublished([...selected], false)}>
              В черновики
            </Button>
            <Button size="sm" variant="danger" disabled={busy} icon={<Trash className="h-4 w-4" />} onClick={() => setConfirm([...selected])}>
              Удалить
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !chapters.length ? (
          <EmptyState
            kanji="章"
            title="Глав пока нет"
            description="Добавьте главу вручную или вставьте весь текст тома — мы сами разделим его на главы по заголовкам."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Scissors className="h-4 w-4" />} onClick={onImport}>
                  Импортировать текст
                </Button>
                <ButtonLink to={`/admin/novels/${novel.id}/chapters/new`} variant="secondary" icon={<Plus className="h-4 w-4" />}>
                  Написать главу
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <div className="space-y-6">
            <label className="flex w-fit cursor-pointer items-center gap-2 px-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(chapters.map((c) => c.id)))}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              Выбрать все
            </label>
            {volumes.map(([volume, list]) => (
              <section key={volume}>
                <h3 className="mb-2 px-2 font-display text-sm font-semibold">
                  Том {volume} <span className="font-sans font-normal text-faint">· {list.length} гл.</span>
                </h3>
                <div className="overflow-hidden rounded-3xl border border-line/[0.08]">
                  {list.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn(
                        'flex flex-wrap items-center gap-3 px-4 py-3 transition-colors sm:flex-nowrap',
                        i > 0 && 'border-t border-line/[0.06]',
                        selected.has(c.id) ? 'bg-accent/[0.06]' : 'hover:bg-line/[0.03]'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                        aria-label={`Выбрать главу ${c.number}`}
                      />
                      <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-line/[0.06] px-1.5 font-display text-xs font-semibold tabular">
                        {String(c.number).replace('.', ',')}
                      </span>
                      <Link to={`/admin/novels/${novel.id}/chapters/${c.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium hover:text-accent">{c.title || `Глава ${c.number}`}</p>
                        <p className="text-xs text-faint">
                          {formatNumber(c.wordCount)} слов · {formatDate(c.createdAt)}
                        </p>
                      </Link>
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <Switch checked={c.published} onChange={(v) => setPublished([c.id], v)} />
                        <span className="w-[4.5rem]">{c.published ? 'Вышла' : 'Черновик'}</span>
                      </label>
                      <Link
                        to={`/read/${novel.slug}/${c.id}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-line/[0.07] hover:text-fg"
                        title="Открыть в читалке"
                      >
                        <BookOpen className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/admin/novels/${novel.id}/chapters/${c.id}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-line/[0.07] hover:text-fg"
                        title="Редактировать"
                      >
                        <PenLine className="h-4 w-4" />
                      </Link>
                      <IconButton label="Удалить главу" size="sm" onClick={() => setConfirm([c.id])} className="hover:text-danger">
                        <Trash className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        danger
        title={confirm && confirm.length > 1 ? `Удалить ${confirm.length} глав?` : 'Удалить главу?'}
        description="Текст и отметки читателей об этих главах будут удалены без возможности восстановления."
        confirmLabel="Удалить"
        onConfirm={async () => {
          if (!confirm) return
          try {
            await api.deleteChapters(confirm)
            setSelected(new Set())
            await refresh()
            toast.success('Удалено', `Глав: ${confirm.length}`)
          } catch (e) {
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
