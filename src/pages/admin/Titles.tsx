import { Pencil, Plus, Trash } from 'lucide-react'
import { useState } from 'react'
import { TitleBadge } from '../../components/collect/Collect'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Controls'
import { EmptyState, Skeleton } from '../../components/ui/Feedback'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { ConfirmDialog, Modal } from '../../components/ui/Overlay'
import { api, errorMessage } from '../../lib/api'
import { TITLE_TONES } from '../../lib/collect'
import { invalidateSocial, useNovelMap, useNovels, useTitles } from '../../lib/queries'
import { toast } from '../../store/toast'
import type { Title, TitleInput } from '../../types'

const EMPTY: TitleInput = { name: '', description: '', tone: 'gold', novelId: null }

function TitleEditor({ initial, id, onClose }: { initial: TitleInput; id?: string; onClose: () => void }) {
  const [form, setForm] = useState(initial)
  const [pending, setPending] = useState(false)
  const { data: novels = [] } = useNovels({ drafts: true })
  const set = (patch: Partial<TitleInput>) => setForm((f) => ({ ...f, ...patch }))
  const save = async () => {
    setPending(true)
    try {
      await api.saveTitle(form, id)
      await invalidateSocial()
      toast.success(id ? 'Титул сохранён' : 'Титул создан', form.name)
      onClose()
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={id ? 'Титул' : 'Новый титул'} description="Титулы выдаёт администратор — например, за прочтение тайтла целиком.">
      <div className="space-y-4">
        <Input label="Название" value={form.name} onChange={(e) => set({ name: e.target.value.slice(0, 40) })} placeholder="Например: Выпускник класса D" />
        <Textarea label="За что выдаётся" value={form.description} rows={2} onChange={(e) => set({ description: e.target.value.slice(0, 200) })} placeholder="Видно при наведении на титул" />
        <div>
          <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Цвет</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TITLE_TONES).map(([tone, t]) => (
              <Chip key={tone} active={form.tone === tone} onClick={() => set({ tone })}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
        <Select
          label="Связан с тайтлом"
          value={form.novelId ?? ''}
          onChange={(v) => set({ novelId: v || null })}
          options={[{ value: '', label: 'Не связан' }, ...novels.map((n) => ({ value: n.id, label: n.title }))]}
          hint="Подсказка в карточке читателя: сколько глав этого тайтла он прочитал"
        />
        <div className="flex items-center gap-3 rounded-2xl bg-line/[0.04] px-4 py-3">
          <span className="text-sm text-muted">Так он будет выглядеть:</span>
          <TitleBadge title={{ id: 'p', createdAt: '', ...form, name: form.name || 'Название' }} />
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

export default function TitlesAdmin() {
  const { data: titles = [], isLoading } = useTitles()
  const novels = useNovelMap()
  const [editing, setEditing] = useState<{ input: TitleInput; id?: string } | null>(null)
  const [removing, setRemoving] = useState<Title | null>(null)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto max-w-2xl text-sm text-muted">
          Создайте титулы здесь, а выдавайте их в разделе «Пользователи» → карточка читателя. Там же видно, сколько глав каждого тайтла он прочитал.
        </p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ input: EMPTY })}>
          Новый титул
        </Button>
      </div>
      <div className="mt-6 space-y-2">
        {isLoading && <Skeleton className="h-20 rounded-3xl" />}
        {titles.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-line/[0.08] bg-surface/50 p-4">
            <TitleBadge title={t} />
            <div className="min-w-0 flex-1 text-sm text-muted">
              {t.description || 'Без описания'}
              {t.novelId && novels.get(t.novelId) && <span className="text-faint"> · «{novels.get(t.novelId)!.title}»</span>}
            </div>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing({ input: { name: t.name, description: t.description, tone: t.tone, novelId: t.novelId }, id: t.id })}>
              Изменить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRemoving(t)} aria-label="Удалить">
              <Trash className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {!isLoading && !titles.length && <EmptyState kanji="称" title="Титулов пока нет" description="Например: «Прочитал 1-й год», «Знаток класса D», «Первый читатель»." />}
      </div>
      {editing && <TitleEditor initial={editing.input} id={editing.id} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        danger
        title={`Удалить титул «${removing?.name}»?`}
        description="Он пропадёт у всех, кому был выдан."
        confirmLabel="Удалить"
        onConfirm={async () => {
          if (!removing) return
          try {
            await api.deleteTitle(removing.id)
            await invalidateSocial()
            toast.success('Титул удалён')
          } catch (e) {
            toast.error('Не удалось удалить', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
