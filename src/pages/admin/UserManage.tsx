import { ArrowLeft, BookOpen, Gem, Gift, Package, Save, Trash, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CollectCard, TitleBadge } from '../../components/collect/Collect'
import { groupOwned } from '../../components/collect/CollectionGrid'
import { Avatar } from '../../components/ui/Avatar'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Switch } from '../../components/ui/Controls'
import { EmptyState, PageLoader, ProgressBar } from '../../components/ui/Feedback'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { RARITIES, RARITY_ORDER } from '../../lib/collect'
import { formatDate, plural } from '../../lib/format'
import {
  invalidateCollections,
  invalidateSocial,
  useCardMap,
  useCards,
  useCases,
  useCasesOf,
  useNovelMap,
  useProfileById,
  useTitles,
  useUserCards,
  useUserReading,
  useUserTitles,
} from '../../lib/queries'
import { toast } from '../../store/toast'

function Panel({ icon, title, children, aside }: { icon: React.ReactNode; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-line/[0.08] bg-surface/50 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export default function UserManage() {
  const { id } = useParams()
  const { data: profile, isLoading, refetch } = useProfileById(id)
  const { data: titles = [] } = useTitles()
  const { data: userTitles = [], refetch: refetchTitles } = useUserTitles(id)
  const { data: reading = [] } = useUserReading(id)
  const { data: owned = [] } = useUserCards(id)
  const { data: userCases = [] } = useCasesOf(id)
  const { data: cards = [] } = useCards()
  const { data: cases = [] } = useCases()
  const cardMap = useCardMap()
  const novels = useNovelMap()

  const [form, setForm] = useState({ username: '', displayName: '', bio: '' })
  const [saving, setSaving] = useState(false)
  const [giveCase, setGiveCase] = useState('')
  const [caseQty, setCaseQty] = useState(1)
  const [giveCard, setGiveCard] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) setForm({ username: profile.username, displayName: profile.displayName, bio: profile.bio })
  }, [profile])

  const groups = useMemo(() => groupOwned(owned, cardMap), [owned, cardMap])
  const closedCases = userCases.filter((c) => !c.openedAt)
  const granted = new Set(userTitles.map((t) => t.titleId))

  if (isLoading) return <PageLoader />
  if (!profile || !id) return <EmptyState kanji="無" title="Пользователь не найден" />

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await fn()
      await Promise.all([invalidateCollections(), invalidateSocial()])
      toast.success(done)
    } catch (e) {
      toast.error('Не получилось', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      await api.adminUpdateProfile(id, form)
      await invalidateSocial()
      await refetch()
      toast.success('Профиль обновлён', `@${form.username}`)
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Все пользователи
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Avatar user={profile} size={64} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold">
            {profile.displayName}
            {profile.titleId && <TitleBadge title={titles.find((t) => t.id === profile.titleId)} />}
          </p>
          <p className="text-sm text-muted">
            @{profile.username} · {profile.role === 'admin' ? 'администратор' : 'читатель'} · с {formatDate(profile.createdAt)}
          </p>
        </div>
        <ButtonLink to={`/u/${encodeURIComponent(profile.username)}`} variant="secondary" size="sm">
          Открыть профиль
        </ButtonLink>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel icon={<UserRound className="h-5 w-5 text-accent" />} title="Профиль">
          <div className="space-y-3">
            <Input label="Никнейм" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <Input label="Отображаемое имя" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            <Textarea label="О себе" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" loading={saving} onClick={saveProfile} icon={<Save className="h-4 w-4" />}>
                Сохранить
              </Button>
              {profile.avatarUrl && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api.adminUpdateProfile(id, { avatarUrl: null }).then(() => refetch()), 'Аватар удалён')}>
                  Убрать аватар
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel icon={<BookOpen className="h-5 w-5 text-accent" />} title="Что прочитал">
          {reading.length ? (
            <div className="space-y-3">
              {reading.map((r) => {
                const novel = novels.get(r.novelId)
                const done = r.chaptersTotal > 0 && r.chaptersRead >= r.chaptersTotal
                const linked = titles.filter((t) => t.novelId === r.novelId)
                return (
                  <div key={r.novelId} className="rounded-2xl bg-line/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{novel?.title ?? 'Тайтл удалён'}</span>
                      <span className={done ? 'font-semibold text-accent-2' : 'text-muted'}>
                        {r.chaptersRead} / {r.chaptersTotal || '?'}
                        {done && ' · прочитан'}
                      </span>
                    </div>
                    <ProgressBar value={r.chaptersTotal ? r.chaptersRead / r.chaptersTotal : 0} className="mt-2" />
                    {linked.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {linked.map((t) =>
                          granted.has(t.id) ? (
                            <span key={t.id} className="text-xs text-muted">
                              титул «{t.name}» уже выдан
                            </span>
                          ) : (
                            <Button key={t.id} size="sm" variant="secondary" disabled={busy} onClick={() => act(() => api.grantTitle(id, t.id).then(() => refetchTitles()), `Титул «${t.name}» выдан`)}>
                              Выдать «{t.name}»
                            </Button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">Пока ничего не прочитал.</p>
          )}
        </Panel>

        <Panel icon={<Gem className="h-5 w-5 text-accent" />} title="Титулы">
          {titles.length ? (
            <div className="space-y-2.5">
              {titles.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <TitleBadge title={t} />
                    {t.description && <span className="ml-2 text-xs text-faint">{t.description}</span>}
                  </span>
                  <Switch
                    checked={granted.has(t.id)}
                    disabled={busy}
                    onChange={(on) =>
                      act(
                        () => (on ? api.grantTitle(id, t.id) : api.revokeTitle(id, t.id)).then(() => refetchTitles()),
                        on ? `Титул «${t.name}» выдан` : `Титул «${t.name}» снят`
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Титулов пока нет —{' '}
              <Link to="/admin/titles" className="text-accent hover:underline">
                создайте первый
              </Link>
              .
            </p>
          )}
        </Panel>

        <Panel icon={<Gift className="h-5 w-5 text-accent" />} title="Подарить">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Select
                wrapClassName="min-w-[12rem] flex-1"
                label="Кейс"
                value={giveCase}
                onChange={setGiveCase}
                options={[{ value: '', label: 'Выберите кейс' }, ...cases.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <Input wrapClassName="w-24" label="Сколько" type="number" min={1} max={100} value={caseQty} onChange={(e) => setCaseQty(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
              <Button variant="primary" disabled={!giveCase || busy} onClick={() => act(() => api.grantCase(id, giveCase, caseQty), `Выдано кейсов: ${caseQty}`)}>
                Выдать
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Select
                wrapClassName="min-w-[12rem] flex-1"
                label="Карточка"
                value={giveCard}
                onChange={setGiveCard}
                options={[
                  { value: '', label: 'Выберите карточку' },
                  ...[...cards]
                    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))
                    .map((c) => ({ value: c.id, label: `${c.name} · ${RARITIES[c.rarity].label}` })),
                ]}
              />
              <Button variant="primary" disabled={!giveCard || busy} onClick={() => act(() => api.grantCard(id, giveCard), 'Карточка выдана')}>
                Выдать
              </Button>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Package className="h-4 w-4" /> Неоткрытых кейсов у читателя: {closedCases.length}
            </p>
          </div>
        </Panel>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 font-display text-lg font-semibold">
          Коллекция · {owned.length} {plural(owned.length, ['карточка', 'карточки', 'карточек'])}
        </h2>
        {groups.length ? (
          <div className="flex flex-wrap gap-4">
            {groups.map((g) => (
              <CollectCard
                key={g.card.id}
                card={g.card}
                size="sm"
                count={g.items.length}
                footer={
                  <button
                    disabled={busy}
                    onClick={() => act(() => api.removeUserCard(g.items[0].id), `Забрали одну «${g.card.name}»`)}
                    className="mt-1 flex w-full items-center justify-center gap-1 text-xs text-faint hover:text-danger"
                  >
                    <Trash className="h-3 w-3" /> забрать одну
                  </button>
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Карточек пока нет.</p>
        )}
      </section>
    </div>
  )
}
