import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Search, Settings2, ShieldOff, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Button, ButtonLink } from '../../components/ui/Button'
import { EmptyState, Skeleton } from '../../components/ui/Feedback'
import { ConfirmDialog } from '../../components/ui/Overlay'
import { api, errorMessage, isCloud } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { qk } from '../../lib/queries'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import type { AdminUser } from '../../types'

export default function UsersPage() {
  const me = useAuth((s) => s.user)
  const qc = useQueryClient()
  const { data: users = [], isLoading, error } = useQuery({ queryKey: qk.users, queryFn: () => api.listUsers() })
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<AdminUser | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => !q || [u.username, u.displayName, u.email].some((v) => v.toLowerCase().includes(q)))
  }, [users, query])

  const admins = users.filter((u) => u.role === 'admin').length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">
          Пользователей: <span className="font-semibold text-fg">{users.length}</span> · администраторов: {admins}
        </p>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, никнейм или email" className="field h-11 rounded-full py-0 pl-11" />
        </label>
      </div>

      <div className="mt-6 space-y-2">
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-3xl" />)}
        {error && (
          <EmptyState
            kanji="錯"
            title="Список пользователей недоступен"
            description={isCloud ? `${errorMessage(error)}. Проверьте, что supabase/schema.sql выполнен целиком.` : errorMessage(error)}
          />
        )}
        {list.map((u) => {
          const self = u.id === me?.id
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-4 rounded-3xl border border-line/[0.08] bg-surface/50 p-4 sm:flex-nowrap">
              <Avatar user={u} size={48} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {u.displayName}
                  {u.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-3/15 px-2 py-0.5 text-[10.5px] font-bold uppercase text-accent-3">
                      <Crown className="h-3 w-3" /> админ
                    </span>
                  )}
                  {self && <span className="text-xs font-normal text-faint">это вы</span>}
                </p>
                <p className="truncate text-sm text-muted">
                  @{u.username}
                  {u.email && ` · ${u.email}`}
                </p>
              </div>
              <p className="text-xs text-faint">с {formatDate(u.createdAt)}</p>
              <ButtonLink to={`/admin/users/${u.id}`} size="sm" variant="secondary" icon={<Settings2 className="h-4 w-4" />}>
                Управлять
              </ButtonLink>
              <Button
                size="sm"
                variant={u.role === 'admin' ? 'ghost' : 'secondary'}
                icon={u.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
                onClick={() => setTarget(u)}
              >
                {u.role === 'admin' ? 'Снять права' : 'Сделать админом'}
              </Button>
            </div>
          )
        })}
        {!isLoading && !error && !list.length && <EmptyState kanji="人" title="Никого не нашли" description="Попробуйте другой запрос." />}
      </div>

      <div className="mt-8 flex gap-3 rounded-3xl border border-line/[0.08] bg-line/[0.03] p-5 text-sm text-muted">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          Администраторы могут публиковать, редактировать и удалять тайтлы и главы, управлять ролями, править чужие профили, выдавать титулы,
          кейсы и карточки (кнопка «Управлять»). Последнего администратора лишить прав нельзя.
        </p>
      </div>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        danger={target?.role === 'admin'}
        title={target?.role === 'admin' ? `Снять права администратора с @${target?.username}?` : `Сделать @${target?.username} администратором?`}
        description={
          target?.role === 'admin'
            ? 'Пользователь больше не сможет публиковать и редактировать тайтлы.'
            : 'Пользователь сможет публиковать, редактировать и удалять тайтлы и главы.'
        }
        confirmLabel={target?.role === 'admin' ? 'Снять права' : 'Назначить'}
        onConfirm={async () => {
          if (!target) return
          try {
            await api.setUserRole(target.id, target.role === 'admin' ? 'user' : 'admin')
            await qc.invalidateQueries({ queryKey: qk.users })
            toast.success('Роль изменена', `@${target.username}`)
          } catch (e) {
            toast.error('Не удалось изменить роль', errorMessage(e))
          }
        }}
      />
    </div>
  )
}
