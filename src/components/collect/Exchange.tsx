import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowLeftRight, ChevronRight, Gift, Search, Send, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { invalidateCollections, useCardMap, useFriends, useSearchUsers, useTrades, useUserCards } from '../../lib/queries'
import { useUser } from '../../store/auth'
import { useExchange, type ExchangeMode, type ExchangeRequest } from '../../store/exchange'
import { toast } from '../../store/toast'
import type { Card, PublicProfile } from '../../types'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Controls'
import { Skeleton } from '../ui/Feedback'
import { Modal } from '../ui/Overlay'
import { CollectCard, UserChip } from './Collect'
import { groupOwned, type OwnedGroup } from './CollectionGrid'

const MAX = 10

/** Выбор экземпляров: клик добавляет ещё один, после максимума — сбрасывает. */
function Picker({
  groups,
  picked,
  onChange,
  loading,
  empty,
}: {
  groups: OwnedGroup[]
  picked: Map<string, number>
  onChange: (next: Map<string, number>) => void
  loading: boolean
  empty: string
}) {
  const total = [...picked.values()].reduce((s, n) => s + n, 0)
  if (loading) return <Skeleton className="h-40 rounded-2xl" />
  if (!groups.length) return <p className="rounded-2xl bg-line/[0.04] px-4 py-6 text-center text-sm text-muted">{empty}</p>
  return (
    <div className="scrollbar-thin flex max-h-[300px] flex-wrap justify-center gap-3 overflow-y-auto p-1 sm:max-h-[340px] sm:justify-start">
      {groups.map((g) => {
        const n = picked.get(g.card.id) ?? 0
        return (
          <CollectCard
            key={g.card.id}
            card={g.card}
            size="xs"
            count={g.items.length}
            selected={n > 0}
            onClick={() => {
              const next = new Map(picked)
              const canAdd = n < g.items.length && total < MAX
              if (canAdd) next.set(g.card.id, n + 1)
              else next.delete(g.card.id)
              onChange(next)
            }}
            footer={
              n > 0 ? (
                <span className="mt-1 block text-center text-[11px] font-bold text-accent">
                  {g.items.length > 1 ? `выбрано ${n} из ${g.items.length}` : 'выбрана'}
                </span>
              ) : null
            }
          />
        )
      })}
    </div>
  )
}

/** Выбранные экземпляры. Сначала берём свободные копии, а не те, что уже обещаны в открытых обменах. */
function toIds(groups: OwnedGroup[], picked: Map<string, number>, busy: Set<string>) {
  return groups.flatMap((g) =>
    [...g.items]
      .sort((a, b) => Number(busy.has(a.id)) - Number(busy.has(b.id)))
      .slice(0, picked.get(g.card.id) ?? 0)
      .map((o) => o.id)
  )
}

const cardsWord = (n: number) => plural(n, ['карточку', 'карточки', 'карточек'])

/** Кому подарить или с кем обменяться: друзья и поиск по нику. */
function PartnerPicker({
  open,
  mode,
  onClose,
  onPick,
}: {
  open: boolean
  mode: ExchangeMode
  onClose: () => void
  onPick: (p: PublicProfile) => void
}) {
  const me = useUser()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => {
    if (open) return
    setQuery('')
    setDebounced('')
  }, [open])
  const { data: friends, isLoading } = useFriends()
  const { data: results = [], isFetching } = useSearchUsers(debounced)
  const list = debounced
    ? results.filter((p) => p.id !== me?.id)
    : friends.filter((f) => f.status === 'friends').map((f) => f.profile)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'gift' ? 'Кому подарить карточку?' : 'С кем обменяться?'}
      description="Выберите друга или найдите любого читателя по нику."
    >
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ник или имя читателя"
          aria-label="Ник или имя читателя"
          className="field h-12 rounded-full py-0 pl-11"
        />
      </label>
      <p className="mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-faint">
        {debounced ? (isFetching ? 'Ищем…' : `Найдено: ${list.length}`) : 'Друзья'}
      </p>
      <div className="scrollbar-thin mt-2 max-h-[46vh] space-y-1 overflow-y-auto">
        {!debounced && isLoading && <Skeleton className="h-14 rounded-2xl" />}
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-line/[0.06]"
          >
            <UserChip user={p} size={40} link={false} className="flex-1" />
            <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
          </button>
        ))}
        {!list.length && !isLoading && !isFetching && (
          <p className="rounded-2xl bg-line/[0.04] px-4 py-6 text-center text-sm text-muted">
            {debounced ? 'Никого не нашли — проверьте написание ника' : 'Друзей пока нет — найдите читателя по нику'}
          </p>
        )}
      </div>
    </Modal>
  )
}

interface Done {
  mode: ExchangeMode
  cards: Card[]
  instant: boolean
}

/** Подарок или предложение обмена конкретному читателю. */
function ExchangeDialog({
  open,
  partner,
  request,
  onClose,
  onChangePartner,
}: {
  open: boolean
  partner: PublicProfile | null
  request: ExchangeRequest | null
  onClose: () => void
  onChangePartner?: () => void
}) {
  const me = useUser()
  const cardMap = useCardMap()
  const [mode, setMode] = useState<ExchangeMode>('gift')
  const [give, setGive] = useState(new Map<string, number>())
  const [take, setTake] = useState(new Map<string, number>())
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const mine = useUserCards(open ? me?.id : undefined)
  const theirs = useUserCards(open && partner ? partner.id : undefined)
  const myGroups = useMemo(() => groupOwned(mine.data ?? [], cardMap), [mine.data, cardMap])
  const theirGroups = useMemo(() => groupOwned(theirs.data ?? [], cardMap), [theirs.data, cardMap])

  // Каждое открытие — с карточками, отмеченными там, откуда пришли.
  useEffect(() => {
    if (!open || !request) return
    setMode(request.mode)
    setGive(new Map((request.give ?? []).map((id) => [id, 1])))
    setTake(new Map((request.take ?? []).map((id) => [id, 1])))
    setMessage('')
    setDone(null)
  }, [open, request])

  const { data: trades } = useTrades()
  const busy = useMemo(
    () => new Set(trades.filter((t) => t.status === 'pending').flatMap((t) => [...t.offer, ...t.request])),
    [trades]
  )
  const offer = toIds(myGroups, give, busy)
  const asked = mode === 'trade' ? toIds(theirGroups, take, busy) : []
  const ready = mode === 'gift' ? offer.length > 0 : offer.length + asked.length > 0

  const send = async () => {
    if (!partner) return
    setPending(true)
    try {
      const cards = offer.map((id) => cardMap.get((mine.data ?? []).find((o) => o.id === id)?.cardId ?? '')).filter((c): c is Card => Boolean(c))
      if (mode === 'gift') {
        const result = await api.giftCards({ toUser: partner.id, cards: offer, message })
        setDone({ mode, cards, instant: result.instant })
      } else {
        await api.createTrade({ toUser: partner.id, offer, request: asked, message })
        setDone({ mode, cards, instant: false })
      }
      setGive(new Map())
      setTake(new Map())
      setMessage('')
      await invalidateCollections()
    } catch (e) {
      toast.error(mode === 'gift' ? 'Не удалось подарить' : 'Не удалось отправить предложение', errorMessage(e))
      await invalidateCollections()
    } finally {
      setPending(false)
    }
  }

  const name = partner?.displayName ?? ''
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={mode === 'trade' && !done ? 'xl' : 'lg'}
      title={done ? undefined : mode === 'gift' ? `Подарок для @${partner?.username ?? ''}` : `Обмен с @${partner?.username ?? ''}`}
    >
      {partner && done ? (
        <DoneView done={done} partner={partner} onClose={onClose} onMore={() => setDone(null)} />
      ) : partner ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 basis-[13rem] items-center gap-2">
              <UserChip user={partner} size={36} link={false} />
              {onChangePartner && (
                <button type="button" onClick={onChangePartner} className="shrink-0 text-xs font-semibold text-accent hover:underline">
                  сменить
                </button>
              )}
            </div>
            <Segmented
              className="w-full sm:w-auto"
              value={mode}
              onChange={setMode}
              size="sm"
              options={[
                { value: 'gift', label: 'Подарить', icon: <Gift className="h-3.5 w-3.5" /> },
                { value: 'trade', label: 'Обменяться', icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>

          {mode === 'gift' ? (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">
                Что подарить · {offer.length}
                <span className="ml-2 font-normal text-muted">карточки сразу перейдут к @{partner.username}</span>
              </p>
              <Picker groups={myGroups} picked={give} onChange={setGive} loading={mine.isLoading} empty="У вас пока нет карточек — откройте кейс, чтобы было что дарить" />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div>
                <p className="mb-2 text-sm font-semibold">Вы отдаёте · {offer.length}</p>
                <Picker groups={myGroups} picked={give} onChange={setGive} loading={mine.isLoading} empty="У вас пока нет карточек" />
              </div>
              <div className="hidden items-center lg:flex">
                <ArrowLeftRight className="h-6 w-6 text-faint" />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Вы получаете · {asked.length}</p>
                <Picker groups={theirGroups} picked={take} onChange={setTake} loading={theirs.isLoading} empty={`У @${partner.username} пока нет карточек`} />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 300))}
              placeholder={mode === 'gift' ? 'Подпишите подарок (необязательно)' : 'Сообщение (необязательно)'}
              aria-label="Сообщение"
              className="field h-11 w-full rounded-full py-0 sm:flex-1"
            />
            <Button
              variant="primary"
              loading={pending}
              disabled={!ready}
              onClick={send}
              icon={mode === 'gift' ? <Gift className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            >
              {mode === 'gift' ? (offer.length ? `Подарить ${offer.length} ${cardsWord(offer.length)}` : 'Подарить') : 'Предложить обмен'}
            </Button>
          </div>
          {mode === 'trade' && (
            <p className="mt-3 text-xs text-muted">Обмен состоится, когда {name} его примет. До этого предложение можно отменить во вкладке «Обмены».</p>
          )}
        </>
      ) : null}
    </Modal>
  )
}

/** Подарок вручён или предложение ушло. */
function DoneView({ done, partner, onClose, onMore }: { done: Done; partner: PublicProfile; onClose: () => void; onMore: () => void }) {
  const gift = done.mode === 'gift'
  const shown = done.cards.slice(0, 5)
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <div className="relative">
        <motion.div
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          className="relative z-10"
        >
          <Avatar user={partner} size={84} className="ring-4 ring-accent/30" />
        </motion.div>
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 12 }}
          className="absolute -bottom-1 -right-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-ember text-white shadow-glow"
        >
          {gift ? <Gift className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
        </motion.span>
        {gift &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute left-1/2 top-1/2 text-accent"
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
              animate={{ x: Math.cos((i / 6) * Math.PI * 2) * 70, y: Math.sin((i / 6) * Math.PI * 2) * 70, opacity: [0, 1, 0], scale: 1 }}
              transition={{ duration: 1.1, delay: 0.2 + i * 0.03, ease: 'easeOut' }}
            >
              <Sparkles className="h-4 w-4" />
            </motion.span>
          ))}
      </div>
      <h3 className="mt-6 font-display text-xl font-bold">
        {gift ? (done.instant ? `Подарок у @${partner.username}!` : 'Подарок отправлен') : 'Предложение отправлено'}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted">
        {gift
          ? done.instant
            ? `Карточки уже в коллекции @${partner.username}, а подарок с вашей подписью — во вкладке «Обмены».`
            : `@${partner.username} увидит подарок во вкладке «Обмены» и сможет его принять.`
          : `@${partner.username} увидит предложение во вкладке «Обмены». Обмен состоится, когда его примут.`}
      </p>
      {shown.length > 0 && (
        <div className="mt-6 flex justify-center">
          <AnimatePresence>
            {shown.map((c, i) => (
              <motion.div
                key={`${c.id}-${i}`}
                initial={{ y: 30, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: (i - (shown.length - 1) / 2) * 7 }}
                transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 220, damping: 18 }}
                className={cn(i > 0 && '-ml-8')}
              >
                <CollectCard card={c} size="xs" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button variant="ghost" onClick={onMore} icon={gift ? <Gift className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}>
          {gift ? 'Подарить ещё' : 'Ещё предложение'}
        </Button>
        <Button variant="primary" onClick={onClose}>
          Готово
        </Button>
      </div>
    </div>
  )
}

/** Один на всё приложение: открывается через openExchange() из любой кнопки «Подарить» или «Обменяться». */
export function ExchangeHost() {
  const me = useUser()
  const request = useExchange((s) => s.request)
  const close = useExchange((s) => s.close)
  // Читатель, выбранный для текущего запроса (если кнопка не указала его сама).
  const [picked, setPicked] = useState<{ request: ExchangeRequest; partner: PublicProfile } | null>(null)
  // Последнее открытое окно держим и после закрытия, чтобы оно красиво исчезло, а не пропало.
  const [shown, setShown] = useState<{ request: ExchangeRequest; partner: PublicProfile } | null>(null)
  const partner = request ? (request.partner ?? (picked?.request === request ? picked.partner : null)) : null

  useEffect(() => {
    if (request && partner) setShown({ request, partner })
  }, [request, partner])

  if (!me) return null
  return (
    <>
      <PartnerPicker
        open={Boolean(request) && !partner}
        mode={request?.mode ?? shown?.request.mode ?? 'gift'}
        onClose={close}
        onPick={(p) => request && setPicked({ request, partner: p })}
      />
      <ExchangeDialog
        open={Boolean(request && partner)}
        partner={partner ?? shown?.partner ?? null}
        request={request ?? shown?.request ?? null}
        onClose={close}
        onChangePartner={request && !request.partner ? () => setPicked(null) : undefined}
      />
    </>
  )
}
