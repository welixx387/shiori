import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BookOpen, Eye, ExternalLink, FileText, Heart, Library, Plus, Search, Sparkles, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../../components/novel/Bits'
import { Cover } from '../../components/novel/Cover'
import { StatTile } from '../../components/profile/Charts'
import { Button, ButtonLink, IconButton } from '../../components/ui/Button'
import { Segmented, Switch } from '../../components/ui/Controls'
import { EmptyState, Skeleton } from '../../components/ui/Feedback'
import { ConfirmDialog } from '../../components/ui/Overlay'
import { api, errorMessage } from '../../lib/api'
import { compactNumber, formatNumber, timeAgo } from '../../lib/format'
import { invalidateCatalog, useNovels } from '../../lib/queries'
import { searchNovels } from '../../lib/search'
import { toast } from '../../store/toast'
import type { Novel } from '../../types'

export default function Dashboard() {
  const { data: novels = [], isLoading } = useNovels({ drafts: true })
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'published' | 'drafts'>('all')
  const [toDelete, setToDelete] = useState<Novel | null>(null)
  const [importing, setImporting] = useState(false)

  const list = useMemo(() => {
    const base = novels.filter((n) => (filter === 'all' ? true : filter === 'published' ? n.published : !n.published))
    return query ? searchNovels(base, query).map((h) => h.novel) : [...base].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [novels, query, filter])

  const totals = useMemo(
    () => ({
      published: novels.filter((n) => n.published).length,
      drafts: novels.filter((n) => !n.published).length,
      chapters: novels.reduce((s, n) => s + n.chaptersCount, 0),
      views: novels.reduce((s, n) => s + n.views, 0),
      library: novels.reduce((s, n) => s + n.libraryCount, 0),
    }),
    [novels]
  )

  const togglePublished = async (n: Novel, published: boolean) => {
    qc.setQueriesData<Novel[]>({ queryKey: ['novels'] }, (l) => l?.map((x) => (x.id === n.id ? { ...x, published } : x)))
    try {
      await api.updateNovel(n.id, { published })
      toast.success(published ? 'Опубликовано' : 'Снято с публикации', `«${n.title}»`)
    } catch (e) {
      toast.error('Не получилось', errorMessage(e))
    } finally {
      invalidateCatalog(qc)
    }
  }

  const importDemo = async () => {
    setImporting(true)
    try {
      const added = await api.importDemo()
      await invalidateCatalog(qc)
      toast.success(added ? `Добавлено демо-тайтлов: ${added}` : 'Все демо-тайтлы уже в каталоге')
    } catch (e) {
      toast.error('Не удалось добавить демо-тайтлы', errorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Library className="h-4 w-4" />} label="Тайтлов" value={formatNumber(novels.length)} hint={`${totals.published} опубликовано · ${totals.drafts} в черновиках`} />
        <StatTile icon={<BookOpen className="h-4 w-4" />} label="Опубликовано глав" value={formatNumber(totals.chapters)} />
        <StatTile icon={<Eye className="h-4 w-4" />} label="Просмотров" value={compactNumber(totals.views)} />
        <StatTile icon={<Heart className="h-4 w-4" />} label="В библиотеках" value={compactNumber(totals.library)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти тайтл…" className="field h-11 rounded-full py-0 pl-11" />
        </label>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'published', label: 'Опубликованные' },
            { value: 'drafts', label: 'Черновики' },
          ]}
        />
        <Button variant="secondary" loading={importing} onClick={importDemo} icon={<Sparkles className="h-4 w-4" />}>
          Демо-тайтлы
        </Button>
        <ButtonLink to="/admin/novels/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
          Новый тайтл
        </ButtonLink>
      </div>

      <div className="mt-6 space-y-2">
        {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}
        {!isLoading && !list.length && (
          <EmptyState
            kanji="創"
            title={novels.length ? 'Ничего не нашлось' : 'Пора опубликовать первый тайтл'}
            description={novels.length ? 'Попробуйте другой запрос или фильтр.' : 'Создайте тайтл, добавьте главы — или загрузите демо-подборку, чтобы посмотреть, как всё работает.'}
            action={
              !novels.length && (
                <ButtonLink to="/admin/novels/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Создать тайтл
                </ButtonLink>
              )
            }
          />
        )}
        {list.map((n, i) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 10) * 0.03 }}
            className="flex flex-wrap items-center gap-4 rounded-3xl border border-line/[0.08] bg-surface/50 p-3 pr-4 transition-colors hover:bg-surface/80 sm:flex-nowrap"
          >
            <Link to={`/admin/novels/${n.id}`} className="flex min-w-0 flex-1 items-center gap-4">
              <Cover novel={n} className="w-14 shrink-0" rounded="rounded-xl" showTitle={false} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">{n.title}</p>
                  {n.featured && <span className="rounded-full bg-accent-2/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent-2">на главной</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">/novel/{n.slug}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <StatusPill status={n.status} />
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {n.chaptersCount} гл.
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {compactNumber(n.views)}
                  </span>
                  <span>обновлён {timeAgo(n.updatedAt)}</span>
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              <label className="mr-3 flex items-center gap-2 text-xs text-muted">
                <Switch checked={n.published} onChange={(v) => togglePublished(n, v)} />
                <span className="w-24">{n.published ? 'Опубликован' : 'Черновик'}</span>
              </label>
              <ButtonLink to={`/admin/novels/${n.id}?tab=chapters`} size="sm" variant="secondary">
                Главы
              </ButtonLink>
              <Link
                to={`/novel/${n.slug}`}
                className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-line/[0.07] hover:text-fg"
                title="Открыть страницу тайтла"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
              <IconButton label="Удалить тайтл" onClick={() => setToDelete(n)} className="hover:text-danger">
                <Trash className="h-4 w-4" />
              </IconButton>
            </div>
          </motion.div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        danger
        title={`Удалить «${toDelete?.title ?? ''}»?`}
        description="Тайтл, все его главы, а также полки, оценки и закладки читателей для него будут удалены без возможности восстановления."
        confirmLabel="Удалить тайтл"
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await api.deleteNovel(toDelete.id)
            await invalidateCatalog(qc)
            toast.success('Тайтл удалён', `«${toDelete.title}»`)
          } catch (e) {
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
