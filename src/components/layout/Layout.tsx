import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { House, RotateCcw, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, ScrollRestoration, isRouteErrorResponse, useLocation, useMatch, useNavigation, useRouteError } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { usePrefs } from '../../store/prefs'
import { Backdrop } from '../effects/Backdrop'
import { Button, ButtonLink } from '../ui/Button'
import { EmptyState, PageLoader } from '../ui/Feedback'
import { Toaster } from '../ui/Toaster'
import { CommandPalette } from './CommandPalette'
import { Footer } from './Footer'
import { ExchangeHost } from '../collect/Exchange'
import { Header, MobileNav } from './Header'

function NavigationProgress() {
  const navigation = useNavigation()
  const loading = navigation.state !== 'idle'
  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          className="fixed inset-x-0 top-0 z-[90] h-[3px] origin-left bg-ember shadow-glow"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 0.8, transition: { duration: 2.5, ease: [0.1, 0.8, 0.3, 1] } }}
          exit={{ scaleX: 1, opacity: 0, transition: { duration: 0.35 } }}
        />
      )}
    </AnimatePresence>
  )
}

/** Корень приложения: фон, поиск, уведомления — общие для всех страниц, включая читалку. */
export function Root() {
  const reduce = usePrefs((s) => s.reduceMotion)
  const reading = useMatch('/read/*')
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>
      {!reading && <Backdrop />}
      {!reading && <div className="grain" aria-hidden />}
      <NavigationProgress />
      <Outlet />
      <CommandPalette />
      <Toaster />
      <ExchangeHost />
      <ScrollRestoration getKey={(location) => (location.pathname.startsWith('/profile') ? '/profile' : location.key)} />
    </MotionConfig>
  )
}

function pageKey(pathname: string) {
  if (pathname.startsWith('/profile')) return '/profile'
  if (/^\/admin\/novels\/[^/]+$/.test(pathname)) return pathname
  return pathname
}

export function SiteLayout() {
  const location = useLocation()
  return (
    <>
      <Header />
      <main className="min-h-[70vh]">
        <motion.div
          key={pageKey(location.pathname)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
      <Footer />
      <MobileNav />
    </>
  )
}

export function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const status = useAuth((s) => s.status)
  const user = useAuth((s) => s.user)
  const location = useLocation()
  if (status === 'loading') return <PageLoader />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && user.role !== 'admin') {
    return (
      <div className="pt-24">
        <EmptyState
          kanji="禁"
          title="Сюда могут только администраторы"
          description="Этот раздел для тех, кто публикует тайтлы. Если вы считаете, что это ошибка, попросите администратора выдать вам права."
          action={
            <ButtonLink to="/" variant="secondary" icon={<House className="h-4 w-4" />}>
              На главную
            </ButtonLink>
          }
        />
      </div>
    )
  }
  return <>{children}</>
}

export function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-x-clip px-6 pt-24 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 12 }}
        className="relative"
      >
        <span className="font-display text-[7rem] font-black leading-none tracking-tighter text-outline min-[400px]:text-[9rem] sm:text-[12rem]">404</span>
        <span className="absolute inset-0 flex items-center justify-center font-brush text-7xl text-ember sm:text-8xl">迷</span>
      </motion.div>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Эта страница затерялась между главами</h1>
      <p className="mt-3 max-w-md text-muted">
        Возможно, ссылка устарела или тайтл переехал. Попробуйте поиск — он понимает даже опечатки.
      </p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/" variant="primary" icon={<House className="h-4 w-4" />}>
          На главную
        </ButtonLink>
        <ButtonLink to="/catalog" variant="secondary">
          В каталог
        </ButtonLink>
      </div>
    </div>
  )
}

export function ErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <>
        <Backdrop />
        <NotFound />
      </>
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  const chunkError = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(message)
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Backdrop />
      <EmptyState
        kanji="乱"
        title={chunkError ? 'Сайт обновился' : 'Что-то пошло не так'}
        description={
          chunkError
            ? 'Пока вы читали, вышла новая версия сайта. Обновите страницу — это займёт секунду.'
            : `Мы уже в смятении. Попробуйте обновить страницу. ${message ? `(${message.slice(0, 160)})` : ''}`
        }
        action={
          <div className="flex gap-3">
            <Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => window.location.reload()}>
              Обновить
            </Button>
            <ButtonLink to="/" variant="secondary" icon={<ShieldAlert className="h-4 w-4" />} reloadDocument>
              На главную
            </ButtonLink>
          </div>
        }
      />
    </div>
  )
}
