import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, AtSign, CircleCheck, CircleX, Crown, Info, LoaderCircle, Lock, Mail, MailCheck, Quote } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Embers } from '../components/effects/Embers'
import { Logo } from '../components/layout/Logo'
import { Cover } from '../components/novel/Cover'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Controls'
import { Input, PasswordInput } from '../components/ui/Field'
import { Modal } from '../components/ui/Overlay'
import { useTitle } from '../hooks/useTitle'
import { api, errorMessage, isCloud } from '../lib/api'
import { USERNAME_RE, passwordStrength } from '../lib/api/validation'
import { cn } from '../lib/cn'
import { useNovels } from '../lib/queries'
import { useAuth } from '../store/auth'
import { toast } from '../store/toast'

const QUOTES = [
  { text: 'Все мы где-то не собирались оставаться.', who: 'Закладка', from: 'Библиотекарь последнего маяка' },
  { text: 'Синоптики никогда не знают точно. Мы просто ошибаемся реже других.', who: 'Сэйдзи Амано', from: 'Прогноз на завтра: местами драконы' },
  { text: 'Если никто не помнит — должен же кто-то помнить.', who: 'Со Юна', from: 'Город, который забывает по ночам' },
  { text: 'Если день всё равно повторяется, почему бы не сделать то, на что никогда не хватало смелости?', who: 'Мио', from: 'Сто первый понедельник' },
]

const STRENGTH = [
  { label: 'Слишком короткий', color: 'bg-danger' },
  { label: 'Слабый', color: 'bg-danger' },
  { label: 'Средний', color: 'bg-warn' },
  { label: 'Хороший', color: 'bg-ok' },
  { label: 'Отличный', color: 'bg-ok' },
]

function ArtPanel() {
  const { data: novels = [] } = useNovels()
  const [q, setQ] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setQ((i) => (i + 1) % QUOTES.length), 6500)
    return () => clearInterval(t)
  }, [])
  const covers = useMemo(() => [...novels].sort((a, b) => b.views - a.views).slice(0, 5), [novels])
  const quote = QUOTES[q]

  return (
    <div className="relative isolate hidden overflow-hidden rounded-[36px] border border-line/10 lg:flex lg:flex-col lg:justify-between lg:p-10">
      <div className="bg-ember-animated absolute inset-0 -z-20 opacity-[0.22]" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(120%_80%_at_0%_100%,rgb(var(--bg)),transparent_70%)]" />
      <Embers className="-z-10" />
      <span aria-hidden className="text-outline pointer-events-none absolute -right-10 top-6 -z-10 font-brush text-[22rem] leading-none">
        栞
      </span>

      <Logo />

      <div className="relative mx-auto my-8 h-72 w-full max-w-md">
        {covers.map((n, i) => {
          const mid = (covers.length - 1) / 2
          const off = i - mid
          return (
            <motion.div
              key={n.id}
              className="absolute left-1/2 top-0 w-36"
              initial={{ opacity: 0, y: 60, rotate: 0, x: '-50%' }}
              animate={{ opacity: 1, y: Math.abs(off) * 18, rotate: off * 9, x: `calc(-50% + ${off * 74}px)` }}
              transition={{ duration: 1, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              style={{ zIndex: 10 - Math.abs(off) }}
            >
              <div className="animate-float" style={{ animationDelay: `${i * 0.7}s` }}>
                <Cover novel={n} className="shadow-cover" rounded="rounded-2xl" />
              </div>
            </motion.div>
          )
        })}
      </div>

      <div>
        <h2 className="font-display text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
          Ваша следующая любимая история <span className="text-ember-animated">уже здесь</span>
        </h2>
        <AnimatePresence mode="wait">
          <motion.figure
            key={q}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45 }}
            className="mt-8 flex gap-3"
          >
            <Quote className="h-6 w-6 shrink-0 text-accent" />
            <div>
              <blockquote className="font-serif text-lg italic leading-relaxed text-fg-2">«{quote.text}»</blockquote>
              <figcaption className="mt-2 text-sm text-muted">
                — {quote.who}, <span className="text-fg-2">«{quote.from}»</span>
              </figcaption>
            </div>
          </motion.figure>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function Auth() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const mode = location.pathname.startsWith('/register') ? 'register' : 'login'
  const next = params.get('next') || '/profile'
  const user = useAuth((s) => s.user)
  useTitle(mode === 'login' ? 'Вход' : 'Регистрация')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)
  const [nameState, setNameState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetError, setResetError] = useState('')

  useEffect(() => setError(''), [mode])

  // Уже вошли — сразу уходим туда, куда шли.
  useEffect(() => {
    if (user && !pending) navigate(next, { replace: true })
  }, [user, pending, navigate, next])

  useEffect(() => {
    if (mode !== 'register' || !username) {
      setNameState('idle')
      return
    }
    if (!USERNAME_RE.test(username.trim())) {
      setNameState('invalid')
      return
    }
    setNameState('checking')
    const t = setTimeout(async () => {
      const taken = await api.isUsernameTaken(username.trim())
      setNameState(taken ? 'taken' : 'free')
    }, 400)
    return () => clearTimeout(t)
  }, [username, mode])

  const strength = passwordStrength(password)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && nameState === 'taken') return setError('Этот никнейм уже занят')
    setPending(true)
    try {
      if (mode === 'login') {
        const profile = await api.signIn(email, password)
        toast.success(`С возвращением, ${profile.displayName}!`, 'Ваши полки и закладки на месте')
        navigate(next, { replace: true })
      } else {
        const res = await api.signUp({ email, password, username })
        if (res.needsConfirmation) {
          setConfirmSent(true)
          return
        }
        if (res.profile) {
          toast.success(`Добро пожаловать, ${res.profile.displayName}!`, 'Аккаунт создан — начинайте собирать библиотеку')
          if (res.profile.role === 'admin') {
            setTimeout(() => toast.info('Вы — администратор', 'Первый аккаунт получает права на публикацию тайтлов'), 600)
          }
        }
        navigate(next, { replace: true })
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-7xl gap-6 px-4 pb-28 pt-24 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-10">
      <ArtPanel />

      <div className="flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <AnimatePresence mode="wait">
            {confirmSent ? (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-ok/15">
                  <Mail className="h-9 w-9 text-ok" />
                </span>
                <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">Проверьте почту</h1>
                <p className="mt-3 text-muted">
                  Мы отправили письмо на <span className="font-semibold text-fg">{email}</span>. Перейдите по ссылке из письма, чтобы
                  подтвердить адрес, — и можно входить.
                </p>
                <Button variant="secondary" className="mt-8" onClick={() => navigate('/login')}>
                  Перейти ко входу
                </Button>
              </motion.div>
            ) : (
              <motion.div key="form" exit={{ opacity: 0 }}>
                <p className="kicker">
                  <span className="font-jp text-sm normal-case tracking-normal text-accent">{mode === 'login' ? '帰' : '始'}</span>
                  {mode === 'login' ? 'С возвращением' : 'Новый читатель'}
                </p>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт'}
                </h1>
                <p className="mt-2 text-muted">
                  {mode === 'login'
                    ? 'Продолжите с той главы, на которой остановились.'
                    : 'Полки, закладки и прогресс — на всех ваших устройствах.'}
                </p>

                <Segmented
                  className="mt-7 w-full"
                  value={mode}
                  onChange={(v) => navigate(`/${v}${location.search}`, { replace: true })}
                  options={[
                    { value: 'login', label: 'Вход' },
                    { value: 'register', label: 'Регистрация' },
                  ]}
                />

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <AnimatePresence initial={false}>
                    {mode === 'register' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <Input
                          label="Никнейм"
                          icon={<AtSign className="h-4 w-4" />}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="night_reader"
                          autoComplete="username"
                          required
                          maxLength={24}
                          error={
                            nameState === 'invalid'
                              ? '3–24 символа: буквы, цифры, точка, дефис, подчёркивание'
                              : nameState === 'taken'
                                ? 'Этот никнейм уже занят'
                                : undefined
                          }
                          right={
                            <span className="flex h-9 w-9 items-center justify-center">
                              {nameState === 'checking' && <LoaderCircle className="h-4 w-4 animate-spin text-faint" />}
                              {nameState === 'free' && <CircleCheck className="h-4 w-4 text-ok" />}
                              {(nameState === 'taken' || nameState === 'invalid') && <CircleX className="h-4 w-4 text-danger" />}
                            </span>
                          }
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Input
                    label="Email"
                    type="email"
                    icon={<Mail className="h-4 w-4" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                  <div>
                    <PasswordInput
                      label="Пароль"
                      aside={
                        mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setResetEmail(email)
                              setResetState('idle')
                              setResetError('')
                              setResetOpen(true)
                            }}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Забыли пароль?
                          </button>
                        )
                      }
                      icon={<Lock className="h-4 w-4" />}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'login' ? 'Ваш пароль' : 'Не короче 6 символов'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={6}
                    />
                    {mode === 'register' && password && (
                      <div className="mt-2.5 px-1">
                        <div className="flex gap-1.5">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-line/10">
                              <motion.span
                                className={cn('block h-full rounded-full', STRENGTH[strength].color)}
                                initial={false}
                                animate={{ width: i < strength ? '100%' : '0%' }}
                                transition={{ duration: 0.35 }}
                              />
                            </span>
                          ))}
                        </div>
                        <p className="mt-1.5 text-xs text-muted">Надёжность: {STRENGTH[strength].label}</p>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger"
                        role="alert"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} iconRight={!pending && <ArrowRight className="h-4 w-4" />}>
                    {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted">
                  {mode === 'login' ? (
                    <>
                      Впервые здесь?{' '}
                      <Link to={`/register${location.search}`} className="font-semibold text-accent hover:underline">
                        Зарегистрируйтесь
                      </Link>
                    </>
                  ) : (
                    <>
                      Уже есть аккаунт?{' '}
                      <Link to={`/login${location.search}`} className="font-semibold text-accent hover:underline">
                        Войдите
                      </Link>
                    </>
                  )}
                </p>

                {!isCloud && (
                  <div className="mt-8 flex gap-3 rounded-2xl border border-accent-2/20 bg-accent-2/[0.07] p-4 text-[13px] leading-relaxed text-fg-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" />
                    <p>
                      <span className="font-semibold text-fg">Демо-режим.</span> Аккаунты и библиотека хранятся только в этом браузере.{' '}
                      <span className="inline-flex items-center gap-1 font-medium text-fg">
                        <Crown className="h-3.5 w-3.5 text-accent-2" />
                        Первый зарегистрированный
                      </span>{' '}
                      аккаунт становится администратором. Подключите Supabase (см. README), чтобы сайт стал общим для всех.
                    </p>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        size="sm"
        title={resetState === 'sent' ? 'Письмо отправлено' : 'Восстановление пароля'}
        description={
          resetState === 'sent'
            ? `Проверьте почту ${resetEmail}: в письме будет ссылка для смены пароля.`
            : 'Укажите email аккаунта — мы пришлём ссылку для сброса пароля.'
        }
      >
        {resetState === 'sent' ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <MailCheck className="h-10 w-10 text-ok" />
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Понятно
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setResetError('')
              setResetState('sending')
              try {
                await api.requestPasswordReset(resetEmail)
                setResetState('sent')
              } catch (err) {
                setResetError(errorMessage(err))
                setResetState('idle')
              }
            }}
          >
            <Input type="email" label="Email" icon={<Mail className="h-4 w-4" />} value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
            {resetError && <p className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{resetError}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={resetState === 'sending'}>
              Отправить ссылку
            </Button>
          </form>
        )}
      </Modal>
    </div>
  )
}
