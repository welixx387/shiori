import { Check, Clock, UserMinus, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { invalidateSocial, useFriends } from '../../lib/queries'
import { useUser } from '../../store/auth'
import { toast } from '../../store/toast'
import type { FriendStatus } from '../../types'
import { Button, type ButtonSize } from '../ui/Button'

export function useFriendStatus(userId: string | undefined): FriendStatus {
  const { data } = useFriends()
  return data.find((f) => f.profile.id === userId)?.status ?? 'none'
}

/** Кнопка дружбы: добавить, отменить заявку, принять/отклонить, удалить. */
export function FriendButton({ userId, size = 'md' }: { userId: string; size?: ButtonSize }) {
  const me = useUser()
  const status = useFriendStatus(userId)
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  if (me?.id === userId) return null

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    setPending(true)
    try {
      await fn()
      await invalidateSocial()
      if (done) toast.success(done)
    } catch (e) {
      toast.error('Не получилось', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  if (status === 'friends') {
    return (
      <Button
        size={size}
        variant="ghost"
        loading={pending}
        icon={<UserMinus className="h-4 w-4" />}
        onClick={() => run(() => api.removeFriend(userId), 'Удалено из друзей')}
      >
        Удалить из друзей
      </Button>
    )
  }
  if (status === 'outgoing') {
    return (
      <Button size={size} variant="secondary" loading={pending} icon={<Clock className="h-4 w-4" />} onClick={() => run(() => api.removeFriend(userId), 'Заявка отменена')}>
        Заявка отправлена
      </Button>
    )
  }
  if (status === 'incoming') {
    return (
      <span className="flex gap-2">
        <Button size={size} variant="primary" loading={pending} icon={<Check className="h-4 w-4" />} onClick={() => run(() => api.respondFriendRequest(userId, true), 'Теперь вы друзья')}>
          Принять
        </Button>
        <Button size={size} variant="ghost" disabled={pending} icon={<X className="h-4 w-4" />} onClick={() => run(() => api.respondFriendRequest(userId, false))}>
          Отклонить
        </Button>
      </span>
    )
  }
  return (
    <Button
      size={size}
      variant="primary"
      loading={pending}
      icon={<UserPlus className="h-4 w-4" />}
      onClick={() =>
        run(async () => {
          const next = await api.sendFriendRequest(userId)
          toast.success(next === 'friends' ? 'Теперь вы друзья' : 'Заявка отправлена')
        })
      }
    >
      В друзья
    </Button>
  )
}
