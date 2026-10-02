import { useQueries, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Quote, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { chapterLabel, dayKey, formatDate, timeAgo } from '../../lib/format'
import { qk, useBookmarks, useNovelMap, useUserData } from '../../lib/queries'
import { toast } from '../../store/toast'
import type { ChapterMeta } from '../../types'
import { Cover } from '../novel/Cover'
import { Button, ButtonLink, IconButton } from '../ui/Button'
import { EmptyState } from '../ui/Feedback'
import { Select } from '../ui/Field'
import { ConfirmDialog } from '../ui/Overlay'

/** Метаданные глав для нескольких тайтлов сразу (из кэша, если уже загружены). */
function useChapterIndex(novelIds: string[]) {
  const results = useQueries({
    queries: novelIds.map((id) => ({
      queryKey: qk.chapters(id, false),
      queryFn: () => api.listChapters(id),
      staleTime: 5 * 60_000,
    })),
  })
  return useMemo(() => {
    const m = new Map<string, ChapterMeta>()
    for (const r of results) for (const c of r.data ?? []) m.set(c.id, c)
    return m
    // results — новый массив на каждый рендер, поэтому зависим от времени обновления данных
  }, [results.map((r) => r.dataUpdatedAt).join()])
}

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function dayTitle(key: string) {
  const today = dayKey(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (key === today) return 'Сегодня'
  if (key === dayKey(y)) return 'Вчера'
  return formatDate(`${key}T12:00:00`)
}

export function HistoryTab() {
  const { data } = useUserData()
  const novels = useNovelMap()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const reads = useMemo(() => [...data.reads].sort((a, b) => b.readAt.localeCompare(a.readAt)).slice(0, 200), [data.reads])
  const novelIds = useMemo(() => [...new Set(reads.map((r) => r.novelId))].filter((id) => novels.has(id)), [reads, novels])
  const chapters = useChapterIndex(novelIds)

  const groups = useMemo(() => {
    const m = new Map<string, typeof reads>()
    for (const r of reads) {
      const k = dayKey(r.readAt)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return [...m.entries()]
  }, [reads])

  if (!reads.length) {
    return (
      <EmptyState
        kanji="歴"
        title="История пока пуста"
        description="Здесь появятся главы, которые вы дочитали до конца, — с датой и временем."
        action={
          <ButtonLink to="/catalog" variant="primary">
            Начать читать
          </ButtonLink>
        }
      />
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">Дочитанные главы, от новых к старым</p>
        <Button variant="ghost" size="sm" icon={<Trash className="h-4 w-4" />} onClick={() => setConfirm(true)}>
          Очистить
        </Button>
      </div>
      <div className="relative space-y-8 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-line/10">
        {groups.map(([key, items]) => (
          <section key={key}>
            <h3 className="relative mb-3 font-display text-sm font-semibold">
              <span className="absolute -left-6 top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border-[3px] border-bg bg-ember" />
              {dayTitle(key)}
            </h3>
            <div className="space-y-2">
              {items.map((r) => {
                const novel = novels.get(r.novelId)
                const ch = chapters.get(r.chapterId)
                if (!novel) return null
                return (
                  <Link
                    key={r.chapterId}
                    to={`/read/${novel.slug}/${r.chapterId}`}
                    className="group flex items-center gap-4 rounded-2xl border border-line/[0.06] bg-surface/50 p-3 transition-colors hover:border-accent/30 hover:bg-surface/80"
                  >
                    <Cover novel={novel} className="w-10 shrink-0" rounded="rounded-lg" showTitle={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold transition-colors group-hover:text-accent">{novel.title}</p>
                      <p className="truncate text-xs text-muted">
                        {ch ? `${chapterLabel(ch)}${ch.title ? ` — ${ch.title}` : ''}` : 'Глава'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-faint tabular">{timeFormat.format(new Date(r.readAt))}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        danger
        title="Очистить историю чтения?"
        description="Отметки о прочитанных главах и позиции в тайтлах будут удалены. Полки, оценки и закладки останутся."
        confirmLabel="Очистить"
        onConfirm={async () => {
          try {
            await api.clearHistory()
            await qc.invalidateQueries({ queryKey: ['user-data'] })
            toast.success('История очищена')
          } catch (e) {
            toast.error('Не получилось', errorMessage(e))
          }
        }}
      />
    </div>
  )
}

export function BookmarksTab() {
  const { data } = useUserData()
  const novels = useNovelMap()
  const { remove, edit } = useBookmarks()
  const [filter, setFilter] = useState('')
  const bookmarks = useMemo(
    () => [...data.bookmarks].filter((b) => novels.has(b.novelId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.bookmarks, novels]
  )
  const novelIds = useMemo(() => [...new Set(bookmarks.map((b) => b.novelId))], [bookmarks])
  const chapters = useChapterIndex(novelIds)
  const shown = filter ? bookmarks.filter((b) => b.novelId === filter) : bookmarks

  if (!bookmarks.length) {
    return (
      <EmptyState
        kanji="栞"
        title="Закладок пока нет"
        description="В читалке нажмите на значок закладки (или клавишу B) — место в тексте и цитата сохранятся здесь."
      />
    )
  }

  return (
    <div>
      {novelIds.length > 1 && (
        <Select
          wrapClassName="mb-6 max-w-xs"
          value={filter}
          onChange={setFilter}
          options={[{ value: '', label: 'Все тайтлы' }, ...novelIds.map((id) => ({ value: id, label: novels.get(id)!.title }))]}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {shown.map((b) => {
            const novel = novels.get(b.novelId)!
            const ch = chapters.get(b.chapterId)
            return (
              <motion.article
                key={b.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative flex flex-col rounded-[28px] border border-line/[0.08] bg-surface/60 p-5"
              >
                <Quote className="h-6 w-6 text-accent/70" />
                <blockquote className="mt-3 font-serif text-[16px] italic leading-relaxed text-fg-2">«{b.excerpt}»</blockquote>
                <textarea
                  defaultValue={b.note}
                  placeholder="Ваша заметка…"
                  rows={1}
                  onBlur={(e) => {
                    if (e.target.value !== b.note) edit.mutate({ id: b.id, note: e.target.value })
                  }}
                  className="mt-4 w-full resize-none rounded-xl border border-transparent bg-line/[0.04] px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/40"
                />
                <div className="mt-4 flex items-center gap-3 border-t border-line/[0.06] pt-4">
                  <Cover novel={novel} className="w-9 shrink-0" rounded="rounded-md" showTitle={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{novel.title}</p>
                    <p className="truncate text-xs text-muted">
                      {ch ? chapterLabel(ch) : 'Глава'} · {timeAgo(b.createdAt)}
                    </p>
                  </div>
                  <ButtonLink to={`/read/${novel.slug}/${b.chapterId}?p=${b.paragraph}`} size="sm" variant="secondary" iconRight={<ArrowUpRight className="h-4 w-4" />}>
                    К месту
                  </ButtonLink>
                  <IconButton label="Удалить закладку" size="sm" onClick={() => remove.mutate(b.id)}>
                    <Trash className="h-4 w-4" />
                  </IconButton>
                </div>
              </motion.article>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
