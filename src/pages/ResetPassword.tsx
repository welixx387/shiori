import { KeyRound, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonLink } from '../components/ui/Button'
import { PasswordInput } from '../components/ui/Field'
import { EmptyState, PageLoader } from '../components/ui/Feedback'
import { useTitle } from '../hooks/useTitle'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../store/auth'
import { toast } from '../store/toast'

/** Сюда ведёт ссылка из письма «Сброс пароля»: Supabase уже открыл сессию восстановления. */
export default function ResetPassword() {
  const status = useAuth((s) => s.status)
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useTitle('Новый пароль')

  if (status === 'loading') return <PageLoader />
  if (!user) {
    return (
      <div className="pt-28">
        <EmptyState
          kanji="鍵"
          title="Ссылка устарела"
          description="Ссылка для сброса пароля одноразовая и действует ограниченное время. Запросите новое письмо на странице входа."
          action={
            <ButtonLink to="/login" variant="primary" icon={<LogIn className="h-4 w-4" />}>
              Ко входу
            </ButtonLink>
          }
        />
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== repeat) return setError('Пароли не совпадают')
    setPending(true)
    try {
      await api.setNewPassword(password)
      toast.success('Пароль обновлён', 'Теперь входите с новым паролем')
      navigate('/profile', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 pt-24">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <KeyRound className="h-7 w-7" />
      </span>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Новый пароль</h1>
      <p className="mt-2 text-muted">Для аккаунта {user.email}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <PasswordInput label="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        <PasswordInput label="Повторите пароль" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={6} required />
        {error && <p className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Сохранить пароль
        </Button>
      </form>
    </div>
  )
}
