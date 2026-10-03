import { useMemo, useState } from 'react'
import { RARITIES, RARITY_ORDER } from '../../lib/collect'
import { cn } from '../../lib/cn'
import type { Card, OwnedCard, Rarity } from '../../types'
import { Chip } from '../ui/Controls'
import { EmptyState } from '../ui/Feedback'
import { CollectCard } from './Collect'

export interface OwnedGroup {
  card: Card
  items: OwnedCard[]
}

/** Экземпляры карточек → группы «карточка × количество», от редких к частым. */
export function groupOwned(owned: OwnedCard[], cardMap: Map<string, Card>): OwnedGroup[] {
  const groups = new Map<string, OwnedGroup>()
  for (const o of owned) {
    const card = cardMap.get(o.cardId)
    if (!card) continue
    const g = groups.get(card.id) ?? { card, items: [] }
    g.items.push(o)
    groups.set(card.id, g)
  }
  return [...groups.values()].sort(
    (a, b) =>
      RARITY_ORDER.indexOf(b.card.rarity) - RARITY_ORDER.indexOf(a.card.rarity) || a.card.name.localeCompare(b.card.name, 'ru')
  )
}

export function useRarityFilter() {
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  return { rarity, setRarity }
}

export function RarityFilter({
  value,
  onChange,
  groups,
  className,
}: {
  value: Rarity | 'all'
  onChange: (v: Rarity | 'all') => void
  groups: OwnedGroup[]
  className?: string
}) {
  const counts = useMemo(() => {
    const m = new Map<Rarity, number>()
    for (const g of groups) m.set(g.card.rarity, (m.get(g.card.rarity) ?? 0) + g.items.length)
    return m
  }, [groups])
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Chip active={value === 'all'} onClick={() => onChange('all')}>
        Все
      </Chip>
      {[...RARITY_ORDER].reverse().map((r) =>
        counts.get(r) ? (
          <Chip key={r} active={value === r} onClick={() => onChange(r)}>
            <span className="h-2 w-2 rounded-full" style={{ background: RARITIES[r].color }} />
            {RARITIES[r].label} · {counts.get(r)}
          </Chip>
        ) : null
      )}
    </div>
  )
}

/** Сетка коллекции; onPick — клик по карточке. */
export function CollectionGrid({
  groups,
  onPick,
  empty,
  size = 'sm',
}: {
  groups: OwnedGroup[]
  onPick?: (g: OwnedGroup) => void
  empty?: { title: string; description?: string }
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!groups.length) {
    return <EmptyState kanji="札" title={empty?.title ?? 'Карточек пока нет'} description={empty?.description} className="py-10" />
  }
  return (
    <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
      {groups.map((g) => (
        <CollectCard key={g.card.id} card={g.card} size={size} count={g.items.length} onClick={onPick ? () => onPick(g) : undefined} />
      ))}
    </div>
  )
}
