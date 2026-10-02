import { motion } from 'framer-motion'
import { Camera, Check, KeyRound, LogOut, Mail, MonitorSmartphone, Moon, Palette, RotateCcw, Save, Sun, Trash, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, isCloud } from '../../lib/api'
import { USERNAME_RE } from '../../lib/api/validation'
import { AURAS } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { resizeImage } from '../../lib/image'
import { useAuth } from '../../store/auth'
import { usePrefs, type ThemePref } from '../../store/prefs'
import { useReaderSettings } from '../../store/reader'
import { toast } from '../../store/toast'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Segmented, Switch } from '../ui/Controls'
import { Input, PasswordInput, Textarea } from '../ui/Field'
import { ConfirmDialog } from '../ui/Overlay'

function Card({ title, description, icon, children }: { title: string; description?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">{icon}</span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function ProfileCard() {
  const user = useAuth((s) => s.user)!
  const [displayName, setDisplayName] = useState(user.displayName)
  const [username, setUsername] = useState(user.username)
  const [bio, setBio] = useState(user.bio)
  const [aura, setAura] = useState(user.aura)
  const [nameError, setNameError] = useState('')
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = displayName !== user.displayName || username !== user.username || bio !== user.bio || aura !== user.aura

  useEffect(() => {
    if (username === user.username) return setNameError('')
    if (!USERNAME_RE.test(username.trim())) return setNameError('3–24 символа: буквы, цифры, точка, дефис, подчёркивание')
    setNameError('')
    const t = setTimeout(async () => {
      if (await api.isUsernameTaken(username.trim())) setNameError('Этот никнейм уже занят')
    }, 400)
    return () => clearTimeout(t)
  }, [username, user.username])

  const save = async () => {
    setPending(true)
    try {
      await api.updateProfile({ displayName, username, bio, aura })
      toast.success('Профиль обновлён')
    } catch (e) {
      toast.error('Не удалось сохранить', errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const blob = await resizeImage(file, { maxWidth: 320, maxHeight: 320, square: true })
      const url = await api.uploadImage('avatar', blob)
      await api.updateProfile({ avatarUrl: url })
      toast.success('Аватар обновлён')
    } catch (e) {
      toast.error('Не удалось загрузить аватар', errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card title="Профиль" description="Так вас видят в приложении" icon={<UserRound className="h-5 w-5" />}>
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative overflow-hidden rounded-full"
            aria-label="Загрузить аватар"
          >
            <Avatar user={{ ...user, displayName, aura }} size={104} />
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </span>
            {uploading && <span className="absolute inset-0 animate-pulse bg-black/40" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
          {user.avatarUrl && (
            <button className="text-xs text-muted hover:text-danger" onClick={() => api.updateProfile({ avatarUrl: null })}>
              Убрать фото
            </button>
          )}
        </div>
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Input label="Имя" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          <Input label="Никнейм" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} error={nameError || undefined} />
          <Textarea
            wrapClassName="sm:col-span-2"
            label="О себе"
            aside={<span className="text-xs text-faint tabular">{bio.length}/280</span>}
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            placeholder="Например: читаю исекаи по ночам и коллекционирую закладки"
            className="min-h-[96px]"
          />
          <div className="sm:col-span-2">
            <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Аура профиля</p>
            <div className="flex flex-wrap gap-2.5">
              {AURAS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAura(a.id)}
                  className="group flex flex-col items-center gap-1.5"
                  aria-label={a.name}
                  aria-pressed={aura === a.id}
                >
                  <span
                    className={cn(
                      'relative flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110',
                      aura === a.id && 'ring-2 ring-fg ring-offset-2 ring-offset-bg'
                    )}
                    style={{ background: a.gradient }}
                  >
                    {aura === a.id && <Check className="h-4 w-4 text-white drop-shadow" />}
                  </span>
                  <span className="text-[11px] text-muted">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <motion.div initial={false} animate={{ opacity: dirty ? 1 : 0.5 }} className="mt-6 flex justify-end">
        <Button variant="primary" onClick={save} loading={pending} disabled={!dirty || Boolean(nameError)} icon={<Save className="h-4 w-4" />}>
          Сохранить изменения
        </Button>
      </motion.div>
    </Card>
  )
}

function AccountCard() {
  const user = useAuth((s) => s.user)!
  const [email, setEmail] = useState(user.email)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pending, setPending] = useState<'email' | 'password' | null>(null)

  const changeEmail = async () => {
    setPending('email')
    try {
      const res = await api.changeEmail(email)
      toast.success(res.needsConfirmation ? 'Почти готово' : 'Email обновлён', res.needsConfirmation ? 'Подтвердите новый адрес по ссылке из письма' : undefined)
    } catch (e) {
      toast.error('Email не изменён', errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  const changePassword = async () => {
    setPending('password')
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      toast.success('Пароль изменён')
    } catch (e) {
      toast.error('Пароль не изменён', errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <Card title="Аккаунт" description="Email и пароль для входа" icon={<KeyRound className="h-5 w-5" />}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Input label="Email" type="email" icon={<Mail className="h-4 w-4" />} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button size="sm" onClick={changeEmail} loading={pending === 'email'} disabled={email.trim().toLowerCase() === user.email}>
            Сменить email
          </Button>
          {isCloud && <p className="text-xs text-muted">На новый адрес придёт письмо для подтверждения.</p>}
        </div>
        <div className="space-y-3">
          <PasswordInput label="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <PasswordInput label="Новый пароль" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="Не короче 6 символов" />
          <Button size="sm" onClick={changePassword} loading={pending === 'password'} disabled={!current || next.length < 6}>
            Сменить пароль
          </Button>
        </div>
      </div>
    </Card>
  )
}

function AppearanceCard() {
  const theme = usePrefs((s) => s.theme)
  const setTheme = usePrefs((s) => s.setTheme)
  const reduce = usePrefs((s) => s.reduceMotion)
  const setReduce = usePrefs((s) => s.setReduceMotion)
  const resetReader = useReaderSettings((s) => s.reset)
  return (
    <Card title="Оформление" description="Тема сайта и анимации" icon={<Palette className="h-5 w-5" />}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 px-1 text-[13px] font-medium text-fg-2">Тема сайта</p>
          <Segmented<ThemePref>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: 'Ночь', icon: <Moon className="h-4 w-4" /> },
              { value: 'light', label: 'Васи', icon: <Sun className="h-4 w-4" /> },
              { value: 'system', label: 'Как в системе', icon: <MonitorSmartphone className="h-4 w-4" /> },
            ]}
          />
        </div>
        <Switch
          label="Меньше анимаций"
          description="Отключает плавающие частицы, бегущие строки и большинство переходов"
          checked={reduce}
          onChange={setReduce}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-line/[0.04] p-4">
          <div>
            <p className="text-sm font-medium">Настройки читалки</p>
            <p className="text-xs text-muted">Шрифт, размер и тему страницы удобнее менять прямо в читалке (кнопка «Аа»)</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              resetReader()
              toast.success('Настройки читалки сброшены')
            }}
          >
            Сбросить
          </Button>
        </div>
      </div>
    </Card>
  )
}

function DangerCard() {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-[32px] border border-danger/20 bg-danger/[0.04] p-5 sm:p-7">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">Выход и удаление</h2>
        <p className="mt-0.5 text-sm text-muted">Удаление аккаунта сотрёт полки, историю, оценки и закладки без возможности восстановления.</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          icon={<LogOut className="h-4 w-4" />}
          onClick={async () => {
            await api.signOut()
            navigate('/')
          }}
        >
          Выйти
        </Button>
        <Button variant="danger" icon={<Trash className="h-4 w-4" />} onClick={() => setConfirm(true)}>
          Удалить аккаунт
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        danger
        title="Удалить аккаунт навсегда?"
        description="Все ваши данные будут удалены. Это действие нельзя отменить."
        confirmLabel="Удалить навсегда"
        onConfirm={async () => {
          try {
            await api.deleteAccount()
            toast.show('Аккаунт удалён', 'Будем рады видеть вас снова')
            navigate('/')
          } catch (e) {
            toast.error('Не удалось удалить аккаунт', errorMessage(e))
          }
        }}
      />
    </section>
  )
}

export function SettingsTab() {
  return (
    <div className="space-y-6">
      <ProfileCard />
      <AccountCard />
      <AppearanceCard />
      <DangerCard />
    </div>
  )
}
