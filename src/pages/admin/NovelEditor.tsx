import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Dices, ExternalLink, ImagePlus, Save, Trash, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Tilt } from '../../components/effects/Tilt'
import { RatingBadge, StatusPill } from '../../components/novel/Bits'
import { Cover } from '../../components/novel/Cover'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Chip, Segmented, Switch, Tabs } from '../../components/ui/Controls'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Feedback'
import { ConfirmDialog } from '../../components/ui/Overlay'
import { TagInput } from '../../components/ui/TagInput'
import { api, errorMessage } from '../../lib/api'
import { AGE_RATINGS, COUNTRIES, COVER_KANJI, COVER_PALETTES, COVER_PATTERNS, GENRES, STATUSES, STATUS_ORDER } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { resizeImage } from '../../lib/image'
import { invalidateCatalog, useChapters, useNovel } from '../../lib/queries'
import { slugify } from '../../lib/translit'
import { toast } from '../../store/toast'
import type { Novel, NovelInput } from '../../types'
import ChaptersManager from './ChaptersManager'
import ImportSplit from './ImportSplit'

const EMPTY: NovelInput = {
  slug: '',
  title: '',
  altTitles: [],
  author: '',
  illustrator: '',
  description: '',
  coverUrl: null,
  coverStyle: { palette: 0, pattern: 'seigaiha', kanji: '夜' },
  genres: [],
  tags: [],
  status: 'ongoing',
  country: 'Япония',
  year: new Date().getFullYear(),
  ageRating: '16+',
  featured: false,
  published: false,
}

function toInput(n: Novel): NovelInput {
  const { id: _i, views: _v, ratingSum: _rs, ratingCount: _rc, chaptersCount: _cc, libraryCount: _lc, lastChapterAt: _l, createdAt: _c, updatedAt: _u, ...input } = n
  return input
}

function NovelForm({ novel }: { novel?: Novel }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const initial = useMemo(() => (novel ? toInput(novel) : { ...EMPTY, coverStyle: { ...EMPTY.coverStyle, palette: Math.floor(Math.random() * COVER_PALETTES.length), kanji: COVER_KANJI[Math.floor(Math.random() * COVER_KANJI.length)] } }), [novel])
  const [form, setForm] = useState<NovelInput>(initial)
  const [slugAuto, setSlugAuto] = useState(!novel)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; slug?: string }>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  useEffect(() => setForm(initial), [initial])

  const set = <K extends keyof NovelInput>(key: K, value: NovelInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const onTitle = (title: string) => setForm((f) => ({ ...f, title, slug: slugAuto ? slugify(title) : f.slug }))

  const uploadCover = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Нужна картинка', 'Поддерживаются JPG, PNG, WebP')
    setUploading(true)
    try {
      const blob = await resizeImage(file, { maxWidth: 720, maxHeight: 1080, quality: 0.86 })
      const url = await api.uploadImage('cover', blob)
      set('coverUrl', url)
      toast.success('Обложка загружена', 'Не забудьте сохранить тайтл')
    } catch (e) {
      toast.error('Не удалось загрузить обложку', errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    const errs: typeof errors = {}
    if (!form.title.trim()) errs.title = 'Введите название'
    if (!slugify(form.slug || form.title)) errs.slug = 'Адрес не может быть пустым'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const payload: NovelInput = { ...form, title: form.title.trim(), slug: slugify(form.slug || form.title) }
      if (novel) {
        const updated = await api.updateNovel(novel.id, payload)
        savedRef.current = true
        await invalidateCatalog(qc)
        savedRef.current = false
        toast.success('Изменения сохранены', `«${updated.title}»`)
      } else {
        const created = await api.createNovel(payload)
        savedRef.current = true
        await invalidateCatalog(qc)
        toast.success('Тайтл создан', 'Теперь добавьте главы — вручную или импортом текста')
        navigate(`/admin/novels/${created.id}?tab=chapters`, { replace: true })
      }
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Ctrl+S — сохранить
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

  const preview: Novel = {
    ...(novel ?? ({} as Novel)),
    ...form,
    id: novel?.id ?? 'preview',
    views: novel?.views ?? 0,
    ratingSum: novel?.ratingSum ?? 0,
    ratingCount: novel?.ratingCount ?? 0,
    chaptersCount: novel?.chaptersCount ?? 0,
    libraryCount: novel?.libraryCount ?? 0,
    lastChapterAt: novel?.lastChapterAt ?? null,
    createdAt: novel?.createdAt ?? new Date().toISOString(),
    updatedAt: novel?.updatedAt ?? new Date().toISOString(),
    title: form.title || 'Название тайтла',
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
          <h2 className="font-display text-base font-semibold">Основное</h2>
          <Input label="Название *" value={form.title} onChange={(e) => onTitle(e.target.value)} placeholder="Например: Библиотекарь последнего маяка" error={errors.title} />
          <Input
            label="Адрес страницы"
            value={form.slug}
            onChange={(e) => {
              setSlugAuto(false)
              set('slug', e.target.value)
            }}
            onBlur={() => set('slug', slugify(form.slug || form.title))}
            error={errors.slug}
            hint={`Страница будет доступна по адресу /novel/${slugify(form.slug || form.title || 'title')}`}
            aside={
              <button type="button" onClick={() => { setSlugAuto(true); set('slug', slugify(form.title)) }} className="text-xs font-medium text-accent hover:underline">
                из названия
              </button>
            }
          />
          <TagInput label="Альтернативные названия" hint="Оригинальное, английское, ромадзи — по ним тоже ищут. Enter или запятая — добавить." value={form.altTitles} onChange={(v) => set('altTitles', v)} placeholder="Saigo no Toudai no Shisho" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Автор" value={form.author} onChange={(e) => set('author', e.target.value)} />
            <Input label="Художник" value={form.illustrator} onChange={(e) => set('illustrator', e.target.value)} />
          </div>
          <Textarea
            label="Описание"
            aside={<span className="text-xs text-faint tabular">{form.description.length}</span>}
            hint="Абзацы разделяйте пустой строкой. Первый абзац показывается на главной."
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className="min-h-[180px] font-serif"
          />
        </section>

        <section className="space-y-5 rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
          <h2 className="font-display text-base font-semibold">Жанры и теги</h2>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const on = form.genres.includes(g.name)
              const Icon = g.icon
              return (
                <Chip
                  key={g.name}
                  active={on}
                  onClick={() => set('genres', on ? form.genres.filter((x) => x !== g.name) : [...form.genres, g.name])}
                  icon={<Icon className="h-3.5 w-3.5" style={on ? undefined : { color: `hsl(${g.hue} 80% 62%)` }} />}
                >
                  {g.name}
                </Chip>
              )
            })}
          </div>
          <TagInput label="Теги" value={form.tags} onChange={(v) => set('tags', v)} placeholder="маяк, говорящий кот, магия слов" />
        </section>

        <section className="space-y-5 rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
          <h2 className="font-display text-base font-semibold">Статус и выходные данные</h2>
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Статус перевода</p>
            <Segmented
              value={form.status}
              onChange={(v) => set('status', v)}
              options={STATUS_ORDER.map((s) => ({ value: s, label: STATUSES[s].label, icon: <span className={cn('h-1.5 w-1.5 rounded-full', STATUSES[s].dot)} /> }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Страна" value={form.country} onChange={(v) => set('country', v)} options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
            <Input
              label="Год"
              type="number"
              min={1900}
              max={2100}
              value={form.year ?? ''}
              onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}
            />
            <Select label="Возраст" value={form.ageRating} onChange={(v) => set('ageRating', v)} options={AGE_RATINGS.map((a) => ({ value: a, label: a }))} />
          </div>
          <div className="space-y-4 rounded-3xl bg-line/[0.03] p-4">
            <Switch label="Опубликован" description="Черновик видят только администраторы" checked={form.published} onChange={(v) => set('published', v)} />
            <Switch label="Выбор редакции" description="Показывать в большом слайдере на главной" checked={form.featured} onChange={(v) => set('featured', v)} />
          </div>
        </section>

        <section className="space-y-5 rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Обложка</h2>
            {form.coverUrl && (
              <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => set('coverUrl', null)}>
                Убрать картинку
              </Button>
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) uploadCover(f)
            }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors',
              dragOver ? 'border-accent bg-accent/10' : 'border-line/15 hover:border-line/30'
            )}
          >
            {uploading ? <Upload className="h-6 w-6 animate-bounce text-accent" /> : <ImagePlus className="h-6 w-6 text-accent" />}
            <p className="text-sm font-medium">{uploading ? 'Загружаем…' : 'Перетащите картинку или нажмите, чтобы выбрать'}</p>
            <p className="text-xs text-muted">Лучше вертикальная 2:3. Уменьшим и сожмём автоматически.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadCover(f)
                e.target.value = ''
              }}
            />
          </div>
          <div className={cn('space-y-5 transition-opacity', form.coverUrl && 'pointer-events-none opacity-40')}>
            <p className="text-sm text-muted">…или соберите фирменную обложку: палитра, узор и иероглиф.</p>
            <div>
              <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Палитра</p>
              <div className="flex flex-wrap gap-2">
                {COVER_PALETTES.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    onClick={() => set('coverStyle', { ...form.coverStyle, palette: i })}
                    className={cn(
                      'h-10 w-10 rounded-full transition-transform hover:scale-110',
                      form.coverStyle.palette === i && 'ring-2 ring-fg ring-offset-2 ring-offset-bg'
                    )}
                    style={{ background: `linear-gradient(135deg, ${p.colors[1]}, ${p.colors[0]} 60%), ${p.colors[2]}` }}
                  >
                    <span className="block h-full w-full rounded-full" style={{ boxShadow: `inset -6px -6px 0 0 ${p.colors[2]}55` }} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Узор</p>
              <div className="flex flex-wrap gap-2">
                {COVER_PATTERNS.map((p) => (
                  <Chip key={p.id} active={form.coverStyle.pattern === p.id} onClick={() => set('coverStyle', { ...form.coverStyle, pattern: p.id })}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <Input
                wrapClassName="w-40"
                label="Иероглиф"
                value={form.coverStyle.kanji}
                maxLength={2}
                onChange={(e) => set('coverStyle', { ...form.coverStyle, kanji: e.target.value.slice(0, 2) })}
                className="text-center font-jp text-xl"
              />
              <Button
                variant="secondary"
                icon={<Dices className="h-4 w-4" />}
                onClick={() =>
                  set('coverStyle', {
                    palette: Math.floor(Math.random() * COVER_PALETTES.length),
                    pattern: COVER_PATTERNS[Math.floor(Math.random() * COVER_PATTERNS.length)].id,
                    kanji: COVER_KANJI[Math.floor(Math.random() * COVER_KANJI.length)],
                  })
                }
              >
                Случайно
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COVER_KANJI.slice(0, 24).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set('coverStyle', { ...form.coverStyle, kanji: k })}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl font-jp text-lg transition-colors',
                    form.coverStyle.kanji === k ? 'bg-accent/15 text-accent' : 'text-fg-2 hover:bg-line/[0.07]'
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </section>

        {novel && (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-[32px] border border-danger/20 bg-danger/[0.04] p-5 sm:p-7">
            <div>
              <h2 className="font-display text-base font-semibold">Удалить тайтл</h2>
              <p className="mt-0.5 text-sm text-muted">Вместе со всеми главами, оценками и закладками читателей.</p>
            </div>
            <Button variant="danger" icon={<Trash className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          </section>
        )}
      </div>

      {/* Живой предпросмотр */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="kicker mb-4">Предпросмотр</p>
        <div className="mx-auto w-56 lg:w-full">
          <Tilt className="rounded-[22px]">
            <Cover novel={preview} rounded="rounded-[22px]" className="shadow-cover" showAuthor />
          </Tilt>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatusPill status={form.status} />
          <RatingBadge novel={preview} />
          {!form.published && <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-warn">черновик</span>}
        </div>
        <p className="mt-3 font-display text-lg font-semibold leading-snug">{preview.title}</p>
        <p className="mt-1 text-sm text-muted">{form.genres.slice(0, 3).join(' · ') || 'жанры не выбраны'}</p>
        <div className="sticky bottom-4 mt-6 flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
            {novel ? 'Сохранить' : 'Создать тайтл'}
          </Button>
          {novel && (
            <ButtonLink to={`/novel/${novel.slug}`} size="lg" variant="secondary" className="px-4" title="Открыть страницу">
              <ExternalLink className="h-4 w-4" />
            </ButtonLink>
          )}
        </div>
        {!novel && (
          <p className="mt-3 rounded-2xl bg-line/[0.04] px-4 py-3 text-xs leading-relaxed text-muted">
            Текст глав загружается после создания: откроется вкладка «Главы», а в «Импорт и разбивка» можно загрузить книгу целиком —
            EPUB, FB2, DOCX, TXT или HTML. Она сама разделится на главы.
          </p>
        )}
        <AnimatePresence>
          {dirty && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-center text-xs text-warn">
              Есть несохранённые изменения · Ctrl+S
            </motion.p>
          )}
        </AnimatePresence>
      </aside>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Уйти без сохранения?"
        description="Изменения в тайтле не сохранены и пропадут."
        confirmLabel="Уйти"
        danger
        onConfirm={() => blocker.proceed?.()}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title={`Удалить «${novel?.title}»?`}
        description="Это действие нельзя отменить."
        confirmLabel="Удалить навсегда"
        onConfirm={async () => {
          if (!novel) return
          try {
            savedRef.current = true
            await api.deleteNovel(novel.id)
            await invalidateCatalog(qc)
            toast.success('Тайтл удалён')
            navigate('/admin', { replace: true })
          } catch (e) {
            savedRef.current = false
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}

export default function NovelEditor() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: novel, isLoading } = useNovel(id)
  const { data: chapters = [] } = useChapters(novel?.id, { drafts: true })
  const tab = !id ? 'info' : ((params.get('tab') as 'info' | 'chapters' | 'import' | null) ?? 'info')

  if (id && isLoading) return <PageLoader />
  if (id && !novel) {
    return (
      <div className="py-20 text-center">
        <p className="font-semibold">Тайтл не найден</p>
        <Link to="/admin" className="mt-3 inline-block text-accent hover:underline">
          К списку тайтлов
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Все тайтлы
        </Link>
      </div>
      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{novel ? novel.title : 'Новый тайтл'}</h2>
      {novel && (
        <Tabs
          className="mt-5"
          value={tab}
          onChange={(t) => setParams(t === 'info' ? {} : { tab: t }, { replace: true })}
          tabs={[
            { value: 'info', label: 'Информация' },
            { value: 'chapters', label: 'Главы', count: chapters.length },
            { value: 'import', label: 'Импорт и разбивка' },
          ]}
        />
      )}
      <div className="mt-6">
        {tab === 'info' && <NovelForm novel={novel ?? undefined} />}
        {tab === 'chapters' && novel && <ChaptersManager novel={novel} onImport={() => setParams({ tab: 'import' }, { replace: true })} />}
        {tab === 'import' && novel && <ImportSplit novel={novel} onDone={() => setParams({ tab: 'chapters' }, { replace: true })} />}
      </div>
    </div>
  )
}
