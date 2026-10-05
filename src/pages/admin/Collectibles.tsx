import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Pencil, Plus, Trash, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { CaseBox, CasePrice, CollectCard, RarityPill } from '../../components/collect/Collect'
import { Button } from '../../components/ui/Button'
import { Chip, Switch } from '../../components/ui/Controls'
import { EmptyState, Skeleton } from '../../components/ui/Feedback'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { ConfirmDialog, Modal } from '../../components/ui/Overlay'
import { api, errorMessage } from '../../lib/api'
import { CASE_CURRENCIES, DEFAULT_WEIGHTS, RARITIES, RARITY_ORDER, caseOdds } from '../../lib/collect'
import { COVER_PALETTES } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { resizeImage } from '../../lib/image'
import { invalidateCollections, sk, useCards, useCases, useNovels } from '../../lib/queries'
import { toast } from '../../store/toast'
import type { ArtStyle, Card, CardInput, CaseInput, CaseType, Rarity } from '../../types'

const KANJI_CHOICES = ['札', '影', '月', '星', '剣', '狐', '炎', '桜', '雷', '夢', '王', '策', '智', '心', '鬼', '神', '運', '宝', '鍵', '光']

function ImageField({ value, onChange, kind }: { value: string | null; onChange: (url: string | null) => void; kind: 'card' | 'case' }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setPending(true)
    try {
      const blob = await resizeImage(file, kind === 'card' ? { maxWidth: 600, maxHeight: 800, quality: 0.86 } : { maxWidth: 512, maxHeight: 512, quality: 0.86 })
      onChange(await api.uploadImage(kind, blob))
    } catch (e) {
      toast.error('Картинка не загрузилась', errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary" loading={pending} onClick={() => input.current?.click()} icon={<ImagePlus className="h-4 w-4" />}>
        {value ? 'Заменить картинку' : 'Загрузить картинку'}
      </Button>
      {value && (
        <Button size="sm" variant="ghost" onClick={() => onChange(null)} icon={<X className="h-4 w-4" />}>
          Убрать
        </Button>
      )}
      <span className="text-xs text-muted">{kind === 'card' ? 'Вертикальная 3:4, например арт персонажа' : 'Квадратная'}. Без картинки — фирменный фон с иероглифом.</span>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}

function StyleField({ value, onChange }: { value: ArtStyle; onChange: (s: ArtStyle) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {COVER_PALETTES.map((p, i) => (
          <button
            key={p.name}
            type="button"
            title={p.name}
            onClick={() => onChange({ ...value, palette: i })}
            className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-bg transition', value.palette === i && 'ring-2 ring-accent')}
            style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]} 60%, ${p.colors[2]})` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {KANJI_CHOICES.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ ...value, kanji: k })}
            className={cn('h-9 w-9 rounded-xl font-brush text-lg transition', value.kanji === k ? 'bg-accent text-white' : 'bg-line/[0.05] hover:bg-line/[0.1]')}
          >
            {k}
          </button>
        ))}
        <input
          value={value.kanji}
          onChange={(e) => onChange({ ...value, kanji: [...e.target.value].slice(-1).join('') || value.kanji })}
          className="field h-9 w-14 rounded-xl px-0 text-center font-brush text-lg"
          aria-label="Свой иероглиф"
        />
      </div>
    </div>
  )
}

function NovelSelect({ value, onChange, label, hint }: { value: string | null; onChange: (v: string | null) => void; label: string; hint?: string }) {
  const { data: novels = [] } = useNovels({ drafts: true })
  return (
    <Select
      label={label}
      hint={hint}
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      options={[{ value: '', label: 'Не важно' }, ...novels.map((n) => ({ value: n.id, label: n.title }))]}
    />
  )
}

// ───────────────────────── Карточки ─────────────────────────

const EMPTY_CARD: CardInput = {
  name: '',
  description: '',
  rarity: 'common',
  imageUrl: null,
  style: { palette: 2, kanji: '札' },
  novelId: null,
  active: true,
}

function CardEditor({ initial, id, onClose }: { initial: CardInput | null; id?: string; onClose: () => void }) {
  const [form, setForm] = useState<CardInput>(initial ?? EMPTY_CARD)
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<CardInput>) => setForm((f) => ({ ...f, ...patch }))
  const preview: Card = { ...form, name: form.name || 'Имя персонажа', id: id ?? 'preview', createdAt: '' }

  const save = async () => {
    setPending(true)
    try {
      await api.saveCard(form, id)
      await invalidateCollections()
      toast.success(id ? 'Карточка сохранена' : 'Карточка создана', form.name)
      onClose()
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={Boolean(initial)} onClose={onClose} size="xl" title={id ? 'Карточка' : 'Новая карточка'}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <Input label="Персонаж" value={form.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} placeholder="Например: Киётака Аянокодзи" />
          <Textarea label="Описание" value={form.description} onChange={(e) => set({ description: e.target.value })} rows={3} placeholder="Пара строк о персонаже — показывается при просмотре карточки" />
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Редкость</p>
            <div className="flex flex-wrap gap-2">
              {RARITY_ORDER.map((r) => (
                <Chip key={r} active={form.rarity === r} onClick={() => set({ rarity: r })}>
                  <span className="h-2 w-2 rounded-full" style={{ background: RARITIES[r].color }} />
                  {RARITIES[r].label}
                </Chip>
              ))}
            </div>
          </div>
          <NovelSelect label="Из какого тайтла" value={form.novelId} onChange={(novelId) => set({ novelId })} hint="Кейсы с выбранным тайтлом выдают только его карточки" />
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Картинка</p>
            <ImageField value={form.imageUrl} onChange={(imageUrl) => set({ imageUrl })} kind="card" />
          </div>
          {!form.imageUrl && <StyleField value={form.style} onChange={(style) => set({ style })} />}
          <Switch checked={form.active} onChange={(active) => set({ active })} label="Выпадает из кейсов" description="Выключите, чтобы карточка осталась у владельцев, но больше не выпадала" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <CollectCard card={preview} size="lg" />
          <RarityPill rarity={form.rarity} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" loading={pending} disabled={!form.name.trim()} onClick={save}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}

export function CardsAdmin() {
  const { data: cards = [], isLoading } = useCards()
  const { data: novels = [] } = useNovels({ drafts: true })
  const [editing, setEditing] = useState<{ input: CardInput; id?: string } | null>(null)
  const [removing, setRemoving] = useState<Card | null>(null)
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const qc = useQueryClient()

  const list = useMemo(
    () =>
      cards
        .filter((c) => rarity === 'all' || c.rarity === rarity)
        .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name, 'ru')),
    [cards, rarity]
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex flex-wrap gap-2">
          <Chip active={rarity === 'all'} onClick={() => setRarity('all')}>
            Все · {cards.length}
          </Chip>
          {[...RARITY_ORDER].reverse().map((r) => (
            <Chip key={r} active={rarity === r} onClick={() => setRarity(r)}>
              <span className="h-2 w-2 rounded-full" style={{ background: RARITIES[r].color }} />
              {RARITIES[r].label} · {cards.filter((c) => c.rarity === r).length}
            </Chip>
          ))}
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ input: EMPTY_CARD })}>
          Новая карточка
        </Button>
      </div>

      <div className="mt-6">
        {isLoading && <Skeleton className="h-60 rounded-3xl" />}
        {!isLoading && !list.length && (
          <EmptyState
            kanji="札"
            title="Карточек пока нет"
            description="Создайте карточки персонажей: имя, редкость и картинка. Потом они начнут выпадать из кейсов."
          />
        )}
        <div className="flex flex-wrap gap-4">
          {list.map((c) => (
            <div key={c.id} className="group relative">
              <CollectCard
                card={c}
                size="sm"
                onClick={() => setEditing({ input: { name: c.name, description: c.description, rarity: c.rarity, imageUrl: c.imageUrl, style: c.style, novelId: c.novelId, active: c.active }, id: c.id })}
                footer={<p className="mt-1 truncate text-center text-[11px] text-faint">{novels.find((n) => n.id === c.novelId)?.title ?? 'любой тайтл'}</p>}
              />
              <button
                onClick={() => setRemoving(c)}
                className="absolute -right-2 -top-2 hidden h-8 w-8 items-center justify-center rounded-full bg-surface text-danger shadow group-hover:flex"
                aria-label="Удалить"
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {editing && <CardEditor initial={editing.input} id={editing.id} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        danger
        title={`Удалить карточку «${removing?.name}»?`}
        description="Она исчезнет из всех коллекций. Если нужно только перестать выдавать её — выключите «Выпадает из кейсов»."
        confirmLabel="Удалить"
        onConfirm={async () => {
          if (!removing) return
          try {
            await api.deleteCard(removing.id)
            await qc.invalidateQueries({ queryKey: sk.cards })
            await invalidateCollections()
            toast.success('Карточка удалена')
          } catch (e) {
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}

// ───────────────────────── Кейсы ─────────────────────────

const EMPTY_CASE: CaseInput = {
  name: '',
  description: '',
  price: 0,
  currency: 'USDT',
  weights: { ...DEFAULT_WEIGHTS },
  novelId: null,
  weekly: false,
  active: true,
  imageUrl: null,
  style: { palette: 8, kanji: '運' },
}

function CaseEditor({ initial, id, onClose }: { initial: CaseInput; id?: string; onClose: () => void }) {
  const [form, setForm] = useState<CaseInput>(initial)
  const [pending, setPending] = useState(false)
  const { data: cards = [] } = useCards()
  const set = (patch: Partial<CaseInput>) => setForm((f) => ({ ...f, ...patch }))
  const odds = caseOdds(form, cards)
  const preview: CaseType = { ...form, id: 'preview', createdAt: '' }

  const save = async () => {
    setPending(true)
    try {
      await api.saveCase(form, id)
      await invalidateCollections()
      toast.success(id ? 'Кейс сохранён' : 'Кейс создан', form.name)
      onClose()
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={id ? 'Кейс' : 'Новый кейс'}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <Input label="Название" value={form.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} placeholder="Например: Кейс класса D" />
          <Textarea label="Описание" value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
          <Switch
            checked={form.weekly}
            onChange={(weekly) => set({ weekly })}
            label="Бесплатный еженедельный"
            description="Каждый читатель может забирать его раз в 7 дней. Если таких кейсов несколько, выдаётся самый первый."
          />
          {!form.weekly && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Цена"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => set({ price: Math.max(0, Number(e.target.value) || 0) })}
                hint="0 — кейс не продаётся, его можно только выдать"
              />
              <Select label="Валюта" value={form.currency} onChange={(currency) => set({ currency })} options={CASE_CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
          )}
          <NovelSelect label="Карточки из тайтла" value={form.novelId} onChange={(novelId) => set({ novelId })} hint="«Не важно» — выпадают любые активные карточки" />
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Шансы редкостей (веса)</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {RARITY_ORDER.map((r) => (
                <label key={r} className="rounded-2xl bg-line/[0.04] p-2.5">
                  <span className="block text-[11px] font-semibold" style={{ color: RARITIES[r].color }}>
                    {RARITIES[r].label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={form.weights[r]}
                    onChange={(e) => set({ weights: { ...form.weights, [r]: Math.max(0, Number(e.target.value) || 0) } })}
                    className="mt-1 w-full bg-transparent text-lg font-semibold tabular outline-none"
                  />
                  <span className="text-[11px] text-faint">{odds[r] ? `${odds[r] < 1 ? odds[r].toFixed(2) : odds[r].toFixed(1)}%` : 'нет карточек'}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 px-1 text-xs text-muted">Проценты считаются только по тем редкостям, для которых есть карточки.</p>
          </div>
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Оформление</p>
            <ImageField value={form.imageUrl} onChange={(imageUrl) => set({ imageUrl })} kind="case" />
            {!form.imageUrl && (
              <div className="mt-3">
                <StyleField value={form.style} onChange={(style) => set({ style })} />
              </div>
            )}
          </div>
          <Switch checked={form.active} onChange={(active) => set({ active })} label="Показывать читателям" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <CaseBox box={preview} size="lg" />
          <p className="font-display font-bold">{form.name || 'Название кейса'}</p>
          <CasePrice box={preview} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" loading={pending} disabled={!form.name.trim()} onClick={save}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}

export function CasesAdmin() {
  const { data: cases = [], isLoading } = useCases()
  const [editing, setEditing] = useState<{ input: CaseInput; id?: string } | null>(null)
  const [removing, setRemoving] = useState<CaseType | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">
          Бесплатный кейс выдаётся раз в неделю, платные продаются через @CryptoBot. Любой кейс можно подарить читателю в его карточке в разделе «Пользователи».
        </p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ input: EMPTY_CASE })}>
          Новый кейс
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <Skeleton className="h-40 rounded-3xl" />}
        {cases.map((c) => (
          <div key={c.id} className={cn('flex items-center gap-4 rounded-3xl border border-line/[0.08] bg-surface/50 p-4', !c.active && 'opacity-60')}>
            <CaseBox box={c} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <CasePrice box={c} />
              {!c.active && <p className="text-xs text-faint">скрыт</p>}
              <div className="mt-2 flex gap-1">
                <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing({ input: { ...c }, id: c.id })}>
                  Изменить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(c)} aria-label="Удалить">
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!isLoading && !cases.length && (
        <EmptyState kanji="箱" title="Кейсов пока нет" description="Создайте хотя бы один бесплатный еженедельный кейс — и читатели смогут собирать карточки." />
      )}
      {editing && <CaseEditor initial={editing.input} id={editing.id} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        danger
        title={`Удалить кейс «${removing?.name}»?`}
        description="Неоткрытые кейсы этого типа пропадут у читателей. Чтобы просто убрать его из магазина, выключите «Показывать читателям»."
        confirmLabel="Удалить"
        onConfirm={async () => {
          if (!removing) return
          try {
            await api.deleteCase(removing.id)
            await invalidateCollections()
            toast.success('Кейс удалён')
          } catch (e) {
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
