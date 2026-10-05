import { ArrowLeftRight, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { invalidateCollections, useCardMap, useUserCards } from '../../lib/queries'
import { useUser } from '../../store/auth'
import { toast } from '../../store/toast'
import type { PublicProfile } from '../../types'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Feedback'
import { Modal } from '../ui/Overlay'
import { CollectCard } from './Collect'
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
    <div className="scrollbar-thin flex max-h-[340px] flex-wrap gap-3 overflow-y-auto p-1">
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

function toIds(groups: OwnedGroup[], picked: Map<string, number>) {
  return groups.flatMap((g) => g.items.slice(0, picked.get(g.card.id) ?? 0).map((o) => o.id))
}

export function TradeDialog({ partner, open, onClose }: { partner: PublicProfile; open: boolean; onClose: () => void }) {
  const me = useUser()
  const cardMap = useCardMap()
  const mine = useUserCards(open ? me?.id : undefined)
  const theirs = useUserCards(open ? partner.id : undefined)
  const myGroups = useMemo(() => groupOwned(mine.data ?? [], cardMap), [mine.data, cardMap])
  const theirGroups = useMemo(() => groupOwned(theirs.data ?? [], cardMap), [theirs.data, cardMap])
  const [give, setGive] = useState(new Map<string, number>())
  const [take, setTake] = useState(new Map<string, number>())
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  const offer = toIds(myGroups, give)
  const request = toIds(theirGroups, take)

  const send = async () => {
    setPending(true)
    try {
      await api.createTrade({ toUser: partner.id, offer, request, message })
      await invalidateCollections()
      toast.success('Предложение отправлено', `@${partner.username} увидит его в разделе «Обмены»`)
      setGive(new Map())
      setTake(new Map())
      setMessage('')
      onClose()
    } catch (e) {
      toast.error('Не удалось отправить', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Обмен с ${partner.displayName}`}
      description="Отметьте карточки: свои — что отдаёте, собеседника — что хотите получить. Можно и просто подарить карточку."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-sm font-semibold">Вы отдаёте · {offer.length}</p>
          <Picker groups={myGroups} picked={give} onChange={setGive} loading={mine.isLoading} empty="У вас пока нет карточек" />
        </div>
        <div className="hidden items-center lg:flex">
          <ArrowLeftRight className="h-6 w-6 text-faint" />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Вы получаете · {request.length}</p>
          <Picker
            groups={theirGroups}
            picked={take}
            onChange={setTake}
            loading={theirs.isLoading}
            empty={`У ${partner.displayName} пока нет карточек`}
          />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 300))}
          placeholder="Сообщение (необязательно)"
          className="field h-11 flex-1 rounded-full py-0"
        />
        <Button variant="primary" loading={pending} disabled={!offer.length && !request.length} onClick={send} icon={<Send className="h-4 w-4" />}>
          Предложить
        </Button>
      </div>
    </Modal>
  )
}
