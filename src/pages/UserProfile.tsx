import { motion } from 'framer-motion'
import { ArrowLeftRight, Crown, Gem, Gift, PenLine, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CollectCard, RarityPill, TitleBadge } from '../components/collect/Collect'
import { CollectionGrid, RarityFilter, groupOwned, type OwnedGroup } from '../components/collect/CollectionGrid'
import { Embers } from '../components/effects/Embers'
import { NotFound } from '../components/layout/Layout'
import { FriendButton } from '../components/social/FriendButton'
import { Avatar } from '../components/ui/Avatar'
import { Button, ButtonLink } from '../components/ui/Button'
import { PageLoader } from '../components/ui/Feedback'
import { Modal } from '../components/ui/Overlay'
import { Container } from '../components/ui/Section'
import { useTitle } from '../hooks/useTitle'
import { RARITY_ORDER } from '../lib/collect'
import { auraInfo } from '../lib/constants'
import { formatDate, plural } from '../lib/format'
import { useCardMap, useCards, useNovelMap, usePublicProfile, useTitleMap, useUserCards, useUserTitles } from '../lib/queries'
import { useUser } from '../store/auth'
import { openExchange } from '../store/exchange'
import type { PublicProfile, Rarity } from '../types'

/**
 * Карточка крупно. owner — чья это коллекция: свои карточки можно подарить или обменять,
 * чужую — попросить в обмен.
 */
export function CardDetails({
  group,
  onClose,
  owner,
}: {
  group: OwnedGroup | null
  onClose: () => void
  owner?: { self: true } | { self: false; profile: PublicProfile }
}) {
  const novels = useNovelMap()
  const me = useUser()
  const card = group?.card
  const novel = card?.novelId ? novels.get(card.novelId) : undefined
  return (
    <Modal open={Boolean(group)} onClose={onClose} size="lg">
      {card && group && (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <CollectCard card={card} size="lg" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="font-display text-2xl font-bold">{card.name}</h2>
            <RarityPill rarity={card.rarity} className="mt-2" />
            {novel && <p className="mt-3 text-sm text-muted">из «{novel.title}»</p>}
            {card.description && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-fg-2">{card.description}</p>}
            <p className="mt-5 text-sm text-muted">
              В коллекции: <span className="font-semibold text-fg">{group.items.length}</span>{' '}
              {plural(group.items.length, ['экземпляр', 'экземпляра', 'экземпляров'])}
            </p>
            {me && owner?.self && (
              <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Button
                  variant="primary"
                  icon={<Gift className="h-4 w-4" />}
                  onClick={() => {
                    onClose()
                    openExchange({ mode: 'gift', give: [card.id] })
                  }}
                >
                  Подарить
                </Button>
                <Button
                  icon={<ArrowLeftRight className="h-4 w-4" />}
                  onClick={() => {
                    onClose()
                    openExchange({ mode: 'trade', give: [card.id] })
                  }}
                >
                  Обменять
                </Button>
              </div>
            )}
            {me && owner && !owner.self && owner.profile.id !== me.id && (
              <div className="mt-6 flex justify-center sm:justify-start">
                <Button
                  variant="primary"
                  icon={<ArrowLeftRight className="h-4 w-4" />}
                  onClick={() => {
                    onClose()
                    openExchange({ mode: 'trade', partner: owner.profile, take: [card.id] })
                  }}
                >
                  Попросить в обмен
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function UserProfile() {
  const { username } = useParams()
  const me = useUser()
  const { data: profile, isLoading } = usePublicProfile(username)
  const { data: owned = [] } = useUserCards(profile?.id)
  const { data: userTitles = [] } = useUserTitles(profile?.id)
  const { data: allCards = [] } = useCards()
  const cardMap = useCardMap()
  const titles = useTitleMap()
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const [details, setDetails] = useState<OwnedGroup | null>(null)
  useTitle(profile ? `${profile.displayName} (@${profile.username})` : 'Профиль')

  const groups = useMemo(() => groupOwned(owned, cardMap), [owned, cardMap])
  const shown = rarity === 'all' ? groups : groups.filter((g) => g.card.rarity === rarity)
  const best = groups.find((g) => RARITY_ORDER.indexOf(g.card.rarity) >= 3)

  if (isLoading) return <PageLoader />
  if (!profile) return <NotFound />

  const aura = auraInfo(profile.aura)
  const self = me?.id === profile.id
  const activeCards = allCards.filter((c) => c.active).length

  return (
    <Container className="pt-24 sm:pt-28">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative isolate overflow-hidden rounded-[36px] border border-line/10"
      >
        <div className="absolute inset-0 -z-20 animate-gradient-pan" style={{ background: aura.gradient, backgroundSize: '220% 220%' }} />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(9,9,15,0.75))]" />
        <Embers className="-z-10" density={0.4} />
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 -z-10 select-none font-brush text-[14rem] leading-none text-white/15 sm:text-[18rem]">
          友
        </span>
        <div className="flex flex-col gap-6 p-6 pt-24 text-white sm:p-10 sm:pt-28 md:flex-row md:items-end">
          <Avatar user={profile} size={112} className="ring-4 ring-white/30" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{profile.displayName}</h1>
              {profile.role === 'admin' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                  <Crown className="h-3.5 w-3.5" /> Администратор
                </span>
              )}
              {profile.titleId && <TitleBadge title={titles.get(profile.titleId)} className="bg-black/30 backdrop-blur" />}
            </div>
            <p className="mt-1 text-sm text-white/75">
              @{profile.username} · с нами с {formatDate(profile.createdAt)}
            </p>
            {profile.bio && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/90">{profile.bio}</p>}
            {userTitles.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {userTitles.map((t) => (
                  <TitleBadge key={t.titleId} title={titles.get(t.titleId)} className="bg-black/30 backdrop-blur" />
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {self ? (
              <ButtonLink to="/profile/settings" variant="light" size="sm" icon={<PenLine className="h-4 w-4" />}>
                Редактировать
              </ButtonLink>
            ) : (
              <>
                <FriendButton userId={profile.id} size="sm" />
                {me && (
                  <>
                    <Button size="sm" variant="light" icon={<Gift className="h-4 w-4" />} onClick={() => openExchange({ mode: 'gift', partner: profile })}>
                      Подарить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                      icon={<ArrowLeftRight className="h-4 w-4" />}
                      onClick={() => openExchange({ mode: 'trade', partner: profile })}
                    >
                      Обмен
                    </Button>
                  </>
                )}
              </>
            )}
            {me?.role === 'admin' && (
              <ButtonLink
                to={`/admin/users/${profile.id}`}
                size="sm"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                Управлять
              </ButtonLink>
            )}
          </div>
        </div>
      </motion.section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker">
              <Gem className="h-3.5 w-3.5 text-accent" /> Коллекция
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold">
              {groups.length} из {activeCards || groups.length}{' '}
              <span className="text-base font-medium text-muted">
                {plural(owned.length, ['карточка', 'карточки', 'карточек'])} всего: {owned.length}
              </span>
            </h2>
            {best && <p className="mt-1 text-sm text-muted">Гордость коллекции — «{best.card.name}»</p>}
          </div>
          <RarityFilter value={rarity} onChange={setRarity} groups={groups} />
        </div>
        <div className="mt-6">
          <CollectionGrid
            groups={shown}
            onPick={setDetails}
            empty={{
              title: self ? 'Ваша коллекция пока пуста' : 'Коллекция пока пуста',
              description: self ? 'Откройте бесплатный кейс в разделе «Кейсы» — он доступен раз в неделю.' : undefined,
            }}
          />
        </div>
      </section>

      <CardDetails group={details} onClose={() => setDetails(null)} owner={self ? { self: true } : { self: false, profile }} />
    </Container>
  )
}
