import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { RARITIES, casePool, rollCard } from '../../lib/collect'
import { invalidateCollections, useCards } from '../../lib/queries'
import { usePrefs } from '../../store/prefs'
import { toast } from '../../store/toast'
import type { Card, CaseType, OwnedCase } from '../../types'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Overlay'
import { CaseBox, CollectCard, RarityPill } from './Collect'

const ITEM = 92
const GAP = 10
const STEP = ITEM + GAP
const WIN_INDEX = 36
const LENGTH = 44

type Phase = 'idle' | 'spinning' | 'done'

/** Открытие кейса: лента карточек прокручивается и останавливается на выпавшей. */
export function CaseOpening({
  owned,
  box,
  onClose,
}: {
  owned: OwnedCase | null
  box: CaseType | undefined
  onClose: () => void
}) {
  const { data: cards = [], refetch } = useCards()
  const reduceMotion = usePrefs((s) => s.reduceMotion)
  const [phase, setPhase] = useState<Phase>('idle')
  const [won, setWon] = useState<Card | null>(null)
  const [strip, setStrip] = useState<Card[]>([])
  const [pending, setPending] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)

  const pool = useMemo(() => (box ? casePool(box, cards) : []), [box, cards])

  useEffect(() => {
    if (!owned) return
    setPhase('idle')
    setWon(null)
    x.set(0)
    if (box) setStrip(Array.from({ length: LENGTH }, () => rollCard(box, cards)).filter(Boolean) as Card[])
  }, [owned, box, cards, x])

  const open = async () => {
    if (!owned || !box) return
    setPending(true)
    try {
      const result = await api.openCase(owned.id)
      let card = cards.find((c) => c.id === result.cardId)
      if (!card) card = (await refetch()).data?.find((c) => c.id === result.cardId)
      if (!card) throw new Error('Карточка не найдена')
      const filler = Array.from({ length: LENGTH }, () => rollCard(box, cards) ?? card!)
      filler[WIN_INDEX] = card
      setStrip(filler)
      setWon(card)
      setPhase('spinning')
      const width = viewport.current?.clientWidth ?? 600
      const jitter = (Math.random() - 0.5) * (ITEM * 0.6)
      const target = -(WIN_INDEX * STEP) + width / 2 - ITEM / 2 + jitter
      if (reduceMotion) {
        x.set(target)
      } else {
        x.set(0)
        await animate(x, target, { duration: 5.2, ease: [0.08, 0.72, 0.12, 1] })
      }
      setPhase('done')
      void invalidateCollections()
    } catch (e) {
      toast.error('Не удалось открыть кейс', errorMessage(e))
      setPhase('idle')
    } finally {
      setPending(false)
    }
  }

  const close = () => {
    if (phase === 'spinning') return
    onClose()
  }

  const rarity = won ? RARITIES[won.rarity] : null

  return (
    <Modal open={Boolean(owned)} onClose={close} size="xl" title={box?.name ?? 'Кейс'} description={phase === 'idle' ? box?.description : undefined}>
      {box && (
        <div>
          <div className="relative -mx-6 overflow-hidden sm:-mx-7" ref={viewport}>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[rgb(var(--surface))] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[rgb(var(--surface))] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[3px] -translate-x-1/2 rounded-full bg-accent shadow-[0_0_14px_rgb(var(--accent))]" />
            <motion.div className="flex py-4" style={{ x, gap: GAP, paddingLeft: GAP }}>
              {strip.map((card, i) => (
                <CollectCard
                  key={i}
                  card={card}
                  size="xs"
                  dim={phase === 'done' && i !== WIN_INDEX}
                  className={phase === 'done' && i === WIN_INDEX ? 'scale-105' : undefined}
                />
              ))}
            </motion.div>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'done' && won && rarity ? (
              <motion.div
                key="won"
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center"
              >
                <div className="relative">
                  <div className="absolute inset-0 -z-10 scale-125 rounded-full blur-3xl" style={{ background: rarity.glow }} />
                  <CollectCard card={won} size="md" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="kicker justify-center sm:justify-start">
                    <Sparkles className="h-3.5 w-3.5" style={{ color: rarity.color }} />
                    Выпала карточка
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-bold">{won.name}</h3>
                  <RarityPill rarity={won.rarity} className="mt-2" />
                  {won.description && <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{won.description}</p>}
                  <div className="mt-5 flex justify-center gap-2 sm:justify-start">
                    <Button variant="primary" onClick={onClose}>
                      В коллекцию
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="idle" exit={{ opacity: 0 }} className="mt-4 flex flex-col items-center gap-4">
                <CaseBox box={box} size="sm" />
                <p className="text-sm text-muted">
                  {pool.length ? `Карточек в кейсе: ${pool.length}` : 'В кейсе пока нет карточек — загляните позже'}
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  loading={pending || phase === 'spinning'}
                  disabled={!pool.length || phase === 'spinning'}
                  onClick={open}
                  icon={<Sparkles className="h-4 w-4" />}
                >
                  {phase === 'spinning' ? 'Крутится…' : 'Открыть кейс'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Modal>
  )
}
