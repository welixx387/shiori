import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeftRight, Check, Clock, ExternalLink, Gem, Gift, Minus, Package, Plus, Receipt, ShoppingBag, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CaseBox, CasePrice, CollectCard, UserChip } from '../components/collect/Collect'
import { CaseOpening } from '../components/collect/CaseOpening'
import { CollectionGrid, RarityFilter, groupOwned, type OwnedGroup } from '../components/collect/CollectionGrid'
import { Button, ButtonLink } from '../components/ui/Button'
import { Tabs } from '../components/ui/Controls'
import { EmptyState, Skeleton } from '../components/ui/Feedback'
import { Modal } from '../components/ui/Overlay'
import { Container } from '../components/ui/Section'
import { useTitle } from '../hooks/useTitle'
import { api, errorMessage } from '../lib/api'
import { RARITIES, RARITY_ORDER, caseOdds, formatPrice } from '../lib/collect'
import { formatDate, plural, timeAgo } from '../lib/format'
import {
  invalidateCollections,
  useCardMap,
  useCards,
  useCases,
  useMyCases,
  useProfileById,
  usePurchases,
  useTrades,
  useUserCards,
  useWeekly,
} from '../lib/queries'
import { useUser } from '../store/auth'
import { toast } from '../store/toast'
import type { CaseType, OwnedCase, Rarity, Trade } from '../types'
import { CardDetails } from './UserProfile'

type Tab = 'cases' | 'collection' | 'trades' | 'purchases'

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [iso])
  if (!iso) return null
  const ms = Math.max(0, new Date(iso).getTime() - now)
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${Math.max(1, m)} мин`
}

function Odds({ box }: { box: CaseType }) {
  const { data: cards = [] } = useCards()
  const odds = caseOdds(box, cards)
  const shown = [...RARITY_ORDER].reverse().filter((r) => odds[r] > 0)
  if (!shown.length) return <p className="text-xs text-faint">Карточки ещё не добавлены</p>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {shown.map((r) => (
        <span key={r} className="text-[11.5px] font-medium" style={{ color: RARITIES[r].color }}>
          {RARITIES[r].label} {odds[r] < 1 ? odds[r].toFixed(1) : Math.round(odds[r])}%
        </span>
      ))}
    </div>
  )
}

function WeeklyBlock({ boxes, onOpen }: { boxes: CaseType[]; onOpen: (c: OwnedCase) => void }) {
  const user = useUser()
  const { data: weekly } = useWeekly()
  const [pending, setPending] = useState(false)
  const countdown = useCountdown(weekly?.availableAt ?? null)
  const box = boxes.find((b) => b.id === weekly?.caseId)
  if (!box) return null

  const claim = async () => {
    setPending(true)
    try {
      const owned = await api.claimWeeklyCase()
      await invalidateCollections()
      onOpen(owned)
    } catch (e) {
      toast.error('Не получилось', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative isolate overflow-hidden rounded-[32px] border border-line/10 bg-surface/60 p-6 sm:p-8"
    >
      <div className="absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <CaseBox box={box} size="lg" locked={Boolean(weekly?.availableAt)} />
        <div className="flex-1 text-center sm:text-left">
          <p className="kicker justify-center sm:justify-start">
            <Gift className="h-3.5 w-3.5 text-accent" /> Каждую неделю
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{box.name}</h2>
          <p className="mt-2 max-w-lg text-muted">{box.description || 'Бесплатный кейс раз в 7 дней. Внутри — случайная карточка персонажа.'}</p>
          <div className="mt-3">
            <Odds box={box} />
          </div>
          <div className="mt-5">
            {!user ? (
              <ButtonLink to="/login?next=/cases" variant="primary" size="lg">
                Войти и забрать
              </ButtonLink>
            ) : weekly?.availableAt ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-line/[0.06] px-4 py-2.5 text-sm font-medium text-fg-2">
                <Clock className="h-4 w-4 text-accent" /> Следующий бесплатный кейс через {countdown}
              </p>
            ) : (
              <Button variant="primary" size="lg" loading={pending} onClick={claim} icon={<Sparkles className="h-4 w-4" />}>
                Забрать и открыть
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  )
}

function BuyDialog({ box, onClose }: { box: CaseType | null; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1)
  const [pending, setPending] = useState(false)
  const [invoice, setInvoice] = useState<{ payUrl: string } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (box) {
      setQuantity(1)
      setInvoice(null)
    }
  }, [box])

  if (!box) return <Modal open={false} onClose={onClose} />

  const create = async () => {
    setPending(true)
    try {
      const res = await api.buyCase(box.id, quantity)
      setInvoice(res)
      window.open(res.payUrl, '_blank', 'noopener')
    } catch (e) {
      toast.error('Не удалось выставить счёт', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const check = async () => {
    setChecking(true)
    try {
      const credited = await api.checkPurchases()
      await invalidateCollections()
      if (credited) {
        toast.success('Оплата получена', `Добавлено ${credited} ${plural(credited, ['кейс', 'кейса', 'кейсов'])}`)
        onClose()
      } else {
        toast.info('Оплата ещё не пришла', 'Если вы уже оплатили, подождите минуту и проверьте снова')
      }
    } catch (e) {
      toast.error('Не удалось проверить оплату', errorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Купить «${box.name}»`} description="Оплата через @CryptoBot в Telegram: криптовалютой или картой внутри кошелька.">
      <div className="flex items-center gap-5">
        <CaseBox box={box} size="sm" />
        <div>
          <p className="text-sm text-muted">Цена за кейс</p>
          <p className="font-display text-xl font-bold">{formatPrice(box.price, box.currency)}</p>
        </div>
      </div>
      {!invoice ? (
        <>
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-line/[0.04] p-3">
            <span className="text-sm font-medium">Количество</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Меньше">
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center font-semibold tabular">{quantity}</span>
              <Button size="sm" variant="ghost" onClick={() => setQuantity((q) => Math.min(20, q + 1))} aria-label="Больше">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button className="mt-5 w-full" variant="primary" size="lg" loading={pending} onClick={create} icon={<ShoppingBag className="h-4 w-4" />}>
            Оплатить {formatPrice(box.price * quantity, box.currency)}
          </Button>
        </>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted">
            Счёт открылся в новой вкладке. Оплатите его в @CryptoBot и вернитесь сюда — кейсы появятся после подтверждения оплаты.
          </p>
          <a
            href={invoice.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" /> Открыть счёт в @CryptoBot
          </a>
          <Button className="w-full" variant="secondary" loading={checking} onClick={check} icon={<Check className="h-4 w-4" />}>
            Я оплатил — проверить
          </Button>
        </div>
      )}
    </Modal>
  )
}

function CasesTab() {
  const user = useUser()
  const { data: boxes = [], isLoading } = useCases()
  const { data: myCases } = useMyCases()
  const [opening, setOpening] = useState<OwnedCase | null>(null)
  const [buying, setBuying] = useState<CaseType | null>(null)

  const closed = myCases.filter((c) => !c.openedAt)
  const grouped = useMemo(() => {
    const m = new Map<string, OwnedCase[]>()
    for (const c of closed) m.set(c.caseId, [...(m.get(c.caseId) ?? []), c])
    return [...m.entries()]
  }, [closed])
  const shop = boxes.filter((b) => b.active && !b.weekly && b.price > 0)
  const boxOf = (id: string) => boxes.find((b) => b.id === id)

  if (isLoading) return <Skeleton className="h-64 rounded-[32px]" />

  return (
    <div className="space-y-10">
      <WeeklyBlock boxes={boxes} onOpen={setOpening} />

      {user && (
        <section>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Package className="h-5 w-5 text-accent" /> Мои кейсы
            <span className="text-sm font-normal text-faint">{closed.length || ''}</span>
          </h2>
          {grouped.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map(([caseId, list]) => {
                const box = boxOf(caseId)
                if (!box) return null
                return (
                  <div key={caseId} className="flex items-center gap-4 rounded-3xl border border-line/[0.08] bg-surface/50 p-4">
                    <CaseBox
                      box={box}
                      size="sm"
                      badge={
                        list.length > 1 ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">×{list.length}</span>
                        ) : null
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{box.name}</p>
                      <p className="text-xs text-muted">
                        {list[0].source === 'weekly' ? 'бесплатный' : list[0].source === 'purchase' ? 'куплен' : 'подарок'} · {timeAgo(list[0].createdAt)}
                      </p>
                      <Button size="sm" variant="primary" className="mt-2" onClick={() => setOpening(list[list.length - 1])} icon={<Sparkles className="h-3.5 w-3.5" />}>
                        Открыть
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Закрытых кейсов нет. Заберите бесплатный или купите в магазине ниже.</p>
          )}
        </section>
      )}

      <section>
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <ShoppingBag className="h-5 w-5 text-accent" /> Магазин кейсов
        </h2>
        {shop.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shop.map((box) => (
              <div key={box.id} className="flex flex-col rounded-3xl border border-line/[0.08] bg-surface/50 p-5">
                <div className="flex items-center gap-4">
                  <CaseBox box={box} size="sm" />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold leading-tight">{box.name}</p>
                    <CasePrice box={box} />
                  </div>
                </div>
                {box.description && <p className="mt-3 text-sm leading-relaxed text-muted">{box.description}</p>}
                <div className="mt-3">
                  <Odds box={box} />
                </div>
                <div className="mt-auto pt-4">
                  {!user ? (
                    <ButtonLink to="/login?next=/cases" variant="secondary" className="w-full">
                      Войти, чтобы купить
                    </ButtonLink>
                  ) : api.paymentsEnabled ? (
                    <Button variant="primary" className="w-full" onClick={() => setBuying(box)} icon={<ShoppingBag className="h-4 w-4" />}>
                      Купить
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-faint">Покупка работает, когда сайт подключён к Supabase</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Платных кейсов пока нет.</p>
        )}
      </section>

      <CaseOpening owned={opening} box={opening ? boxOf(opening.caseId) : undefined} onClose={() => setOpening(null)} />
      <BuyDialog box={buying} onClose={() => setBuying(null)} />
    </div>
  )
}

function CollectionTab() {
  const user = useUser()
  const { data: owned = [], isLoading } = useUserCards(user?.id)
  const { data: cards = [] } = useCards()
  const cardMap = useCardMap()
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const [details, setDetails] = useState<OwnedGroup | null>(null)
  const groups = useMemo(() => groupOwned(owned, cardMap), [owned, cardMap])
  const shown = rarity === 'all' ? groups : groups.filter((g) => g.card.rarity === rarity)
  const total = cards.filter((c) => c.active).length
  const missing = cards.filter((c) => c.active && !groups.some((g) => g.card.id === c.id))

  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-2xl font-bold">
            Собрано {groups.filter((g) => g.card.active).length} из {total}
          </p>
          <p className="text-sm text-muted">
            Всего {owned.length} {plural(owned.length, ['карточка', 'карточки', 'карточек'])} · повторки можно обменять на странице читателя
          </p>
        </div>
        <RarityFilter value={rarity} onChange={setRarity} groups={groups} />
      </div>
      <div className="mt-6">
        <CollectionGrid groups={shown} onPick={setDetails} empty={{ title: 'Коллекция пуста', description: 'Откройте бесплатный кейс на вкладке «Кейсы».' }} />
      </div>
      {missing.length > 0 && rarity === 'all' && (
        <div className="mt-10">
          <p className="mb-4 text-sm font-semibold text-muted">Ещё не найдены · {missing.length}</p>
          <div className="flex flex-wrap gap-3">
            {missing
              .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))
              .map((c) => (
                <CollectCard key={c.id} card={{ ...c, name: '???', imageUrl: null, style: { ...c.style, kanji: '？' } }} size="xs" dim />
              ))}
          </div>
        </div>
      )}
      <CardDetails group={details} onClose={() => setDetails(null)} />
    </div>
  )
}

function TradeSide({ ids, cardIdsByOwned }: { ids: string[]; cardIdsByOwned: Map<string, string> }) {
  const cardMap = useCardMap()
  if (!ids.length) return <p className="text-xs text-faint">ничего</p>
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const card = cardMap.get(cardIdsByOwned.get(id) ?? '')
        return card ? <CollectCard key={id} card={card} size="xs" /> : <Skeleton key={id} className="h-[122px] w-[92px] rounded-2xl" />
      })}
    </div>
  )
}

function TradeRow({ trade, cardIdsByOwned }: { trade: Trade; cardIdsByOwned: Map<string, string> }) {
  const user = useUser()
  const incoming = trade.toUser === user?.id
  const { data: partner } = useProfileById(incoming ? trade.fromUser : trade.toUser)
  const [pending, setPending] = useState(false)
  const run = async (fn: () => Promise<void>, done: string) => {
    setPending(true)
    try {
      await fn()
      await invalidateCollections()
      toast.success(done)
    } catch (e) {
      toast.error('Не получилось', errorMessage(e))
      await invalidateCollections()
    } finally {
      setPending(false)
    }
  }
  const statusLabel = { pending: 'ждёт ответа', accepted: 'обмен состоялся', declined: 'отклонено', cancelled: 'отменено' }[trade.status]
  return (
    <div className="rounded-3xl border border-line/[0.08] bg-surface/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UserChip user={partner} size={36} sub={<span className="block text-xs text-muted">{incoming ? 'предлагает вам' : 'вы предложили'} · {timeAgo(trade.createdAt)}</span>} />
        <span className="rounded-full bg-line/[0.06] px-3 py-1 text-xs font-medium text-muted">{statusLabel}</span>
      </div>
      {trade.message && <p className="mt-3 rounded-2xl bg-line/[0.04] px-4 py-2.5 text-sm text-fg-2">«{trade.message}»</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{incoming ? 'Вы получите' : 'Вы отдадите'}</p>
          <TradeSide ids={trade.offer} cardIdsByOwned={cardIdsByOwned} />
        </div>
        <ArrowLeftRight className="hidden h-5 w-5 text-faint sm:block" />
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{incoming ? 'Вы отдадите' : 'Вы получите'}</p>
          <TradeSide ids={trade.request} cardIdsByOwned={cardIdsByOwned} />
        </div>
      </div>
      {trade.status === 'pending' && (
        <div className="mt-4 flex justify-end gap-2">
          {incoming ? (
            <>
              <Button size="sm" variant="ghost" disabled={pending} icon={<X className="h-4 w-4" />} onClick={() => run(() => api.respondTrade(trade.id, false), 'Предложение отклонено')}>
                Отклонить
              </Button>
              <Button size="sm" variant="primary" loading={pending} icon={<Check className="h-4 w-4" />} onClick={() => run(() => api.respondTrade(trade.id, true), 'Обмен состоялся')}>
                Принять обмен
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => api.cancelTrade(trade.id), 'Предложение отменено')}>
              Отменить
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function TradesTab() {
  const { data: trades, isLoading } = useTrades()
  const ids = useMemo(() => [...new Set(trades.flatMap((t) => [...t.offer, ...t.request]))], [trades])
  const { data: owned = [] } = useQuery({
    queryKey: ['trade-cards', ids.join(',')],
    queryFn: () => api.getOwnedCards(ids),
    enabled: ids.length > 0,
  })
  const cardIdsByOwned = useMemo(() => new Map(owned.map((o) => [o.id, o.cardId])), [owned])
  const active = trades.filter((t) => t.status === 'pending')
  const history = trades.filter((t) => t.status !== 'pending')

  if (isLoading) return <Skeleton className="h-48 rounded-3xl" />
  if (!trades.length) {
    return (
      <EmptyState
        kanji="換"
        title="Обменов пока не было"
        description="Откройте профиль друга и нажмите «Обмен», чтобы предложить свои карточки за его."
        action={
          <ButtonLink to="/people" variant="primary">
            Найти читателей
          </ButtonLink>
        }
      />
    )
  }
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {active.length ? active.map((t) => <TradeRow key={t.id} trade={t} cardIdsByOwned={cardIdsByOwned} />) : <p className="text-sm text-muted">Активных предложений нет.</p>}
      </div>
      {history.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-muted">История</p>
          <div className="space-y-3 opacity-80">
            {history.slice(0, 30).map((t) => (
              <TradeRow key={t.id} trade={t} cardIdsByOwned={cardIdsByOwned} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PurchasesTab() {
  const { data: purchases = [], isLoading } = usePurchases()
  const { data: boxes = [] } = useCases()
  if (isLoading) return <Skeleton className="h-40 rounded-3xl" />
  if (!purchases.length) return <EmptyState kanji="買" title="Покупок пока нет" description="Купленные кейсы появятся на вкладке «Кейсы»." />
  const label = { active: 'ожидает оплаты', credited: 'зачислено', expired: 'счёт истёк', failed: 'ошибка' }
  return (
    <div className="space-y-2">
      {purchases.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/[0.08] bg-surface/50 px-4 py-3">
          <Receipt className="h-4 w-4 text-faint" />
          <span className="font-medium">
            {boxes.find((b) => b.id === p.caseId)?.name ?? 'Кейс'} × {p.quantity}
          </span>
          <span className="text-sm text-muted">{formatPrice(p.amount, p.currency)}</span>
          <span className="text-xs text-faint">{formatDate(p.createdAt)}</span>
          <span className="ml-auto text-xs font-semibold text-muted">{label[p.status]}</span>
          {p.status === 'active' && p.payUrl && (
            <a href={p.payUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent hover:underline">
              оплатить
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Cases() {
  useTitle('Кейсы и карточки')
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'cases'
  const { data: trades } = useTrades()
  const { data: purchases = [] } = usePurchases()
  const incomingTrades = trades.filter((t) => t.status === 'pending' && t.toUser === user?.id).length

  // Вернулись из @CryptoBot — проверяем оплату неоплаченных счетов.
  const hasActive = purchases.some((p) => p.status === 'active')
  useEffect(() => {
    if (!user || !api.paymentsEnabled || !(hasActive || params.get('paid'))) return
    api
      .checkPurchases()
      .then(async (n) => {
        if (n > 0) {
          await invalidateCollections()
          toast.success('Оплата получена', `Добавлено ${n} ${plural(n, ['кейс', 'кейса', 'кейсов'])}`)
        }
      })
      .catch(() => {})
  }, [user, hasActive, params])

  return (
    <Container className="pt-24 sm:pt-28">
      <p className="kicker">
        <Gem className="h-3.5 w-3.5 text-accent" /> Коллекция персонажей
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">Кейсы и карточки</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Раз в неделю — бесплатный кейс со случайной карточкой. Собирайте коллекцию, меняйтесь повторками с друзьями и охотьтесь за легендарными.
      </p>

      <Tabs
        className="mt-6"
        value={tab}
        onChange={(v) =>
          setParams((p) => {
            p.set('tab', v)
            p.delete('paid')
            return p
          })
        }
        tabs={[
          { value: 'cases', label: 'Кейсы', icon: <Package className="h-4 w-4" /> },
          { value: 'collection', label: 'Коллекция', icon: <Gem className="h-4 w-4" /> },
          { value: 'trades', label: 'Обмены', icon: <ArrowLeftRight className="h-4 w-4" />, count: incomingTrades || undefined },
          ...(api.paymentsEnabled && user ? [{ value: 'purchases' as Tab, label: 'Покупки', icon: <Receipt className="h-4 w-4" /> }] : []),
        ]}
      />

      <div className="mt-8">
        {tab === 'cases' && <CasesTab />}
        {tab !== 'cases' && !user && (
          <EmptyState
            kanji="札"
            title="Войдите, чтобы собирать коллекцию"
            action={
              <ButtonLink to={`/login?next=${encodeURIComponent('/cases?tab=' + tab)}`} variant="primary">
                Войти
              </ButtonLink>
            }
          />
        )}
        {user && tab === 'collection' && <CollectionTab />}
        {user && tab === 'trades' && <TradesTab />}
        {user && tab === 'purchases' && <PurchasesTab />}
      </div>

      {user?.role === 'admin' && (
        <p className="mt-12 text-center text-xs text-faint">
          Карточки, кейсы и шансы настраиваются в{' '}
          <Link to="/admin/cards" className="text-accent hover:underline">
            админке
          </Link>
          .
        </p>
      )}
    </Container>
  )
}
