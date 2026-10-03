import { Search, UserRoundPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserChip } from '../components/collect/Collect'
import { FriendButton } from '../components/social/FriendButton'
import { ButtonLink } from '../components/ui/Button'
import { Tabs } from '../components/ui/Controls'
import { EmptyState, Skeleton } from '../components/ui/Feedback'
import { Container } from '../components/ui/Section'
import { useTitle } from '../hooks/useTitle'
import { timeAgo } from '../lib/format'
import { useFriends, useSearchUsers } from '../lib/queries'
import { useUser } from '../store/auth'
import type { PublicProfile } from '../types'

type Tab = 'friends' | 'incoming' | 'outgoing'

function PersonRow({ person, sub }: { person: PublicProfile; sub?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-line/[0.08] bg-surface/50 p-3.5 sm:flex-nowrap">
      <UserChip
        user={person}
        size={44}
        className="flex-1"
        sub={<span className="block truncate text-xs text-muted">@{person.username}{sub ? ` · ${sub}` : ''}</span>}
      />
      <FriendButton userId={person.id} size="sm" />
    </div>
  )
}

export default function People() {
  useTitle('Читатели')
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(query)
  const tab = (params.get('tab') as Tab) || 'friends'

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    setParams(
      (p) => {
        if (debounced.trim()) p.set('q', debounced.trim())
        else p.delete('q')
        return p
      },
      { replace: true }
    )
  }, [debounced, setParams])

  const { data: results = [], isFetching } = useSearchUsers(debounced)
  const { data: friends, isLoading } = useFriends()
  const groups = useMemo(
    () => ({
      friends: friends.filter((f) => f.status === 'friends'),
      incoming: friends.filter((f) => f.status === 'incoming'),
      outgoing: friends.filter((f) => f.status === 'outgoing'),
    }),
    [friends]
  )
  const list = groups[tab]

  return (
    <Container className="max-w-3xl pt-24 sm:pt-28">
      <p className="kicker">
        <Users className="h-3.5 w-3.5 text-accent" /> Сообщество
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Читатели</h1>
      <p className="mt-2 text-muted">Находите читателей по нику, добавляйте в друзья и меняйтесь карточками.</p>

      <label className="relative mt-6 block">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ник или имя читателя"
          className="field h-14 rounded-full py-0 pl-14 text-base"
          autoFocus={!user}
        />
      </label>

      {debounced.trim() ? (
        <div className="mt-6 space-y-2">
          <p className="px-1 text-sm text-muted">
            {isFetching ? 'Ищем…' : results.length ? `Найдено: ${results.length}` : 'Никого не нашли — проверьте написание ника'}
          </p>
          {results.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </div>
      ) : user ? (
        <div className="mt-8">
          <Tabs
            value={tab}
            onChange={(v) =>
              setParams((p) => {
                p.set('tab', v)
                return p
              })
            }
            tabs={[
              { value: 'friends', label: 'Друзья', count: groups.friends.length },
              { value: 'incoming', label: 'Заявки', count: groups.incoming.length },
              { value: 'outgoing', label: 'Отправленные', count: groups.outgoing.length },
            ]}
          />
          <div className="mt-5 space-y-2">
            {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-3xl" />)}
            {!isLoading &&
              list.map((f) => (
                <PersonRow
                  key={f.profile.id}
                  person={f.profile}
                  sub={tab === 'friends' ? `друзья ${timeAgo(f.since)}` : timeAgo(f.since)}
                />
              ))}
            {!isLoading && !list.length && (
              <EmptyState
                kanji={tab === 'friends' ? '友' : '待'}
                title={tab === 'friends' ? 'Пока без друзей' : tab === 'incoming' ? 'Новых заявок нет' : 'Вы никому не отправляли заявок'}
                description={tab === 'friends' ? 'Найдите читателя по нику в строке поиска выше.' : undefined}
              />
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          kanji="友"
          className="mt-10"
          title="Войдите, чтобы заводить друзей"
          description="Искать читателей можно и без аккаунта — просто введите ник."
          action={
            <ButtonLink to="/login?next=/people" variant="primary" icon={<UserRoundPlus className="h-4 w-4" />}>
              Войти
            </ButtonLink>
          }
        />
      )}
    </Container>
  )
}
