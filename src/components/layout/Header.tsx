import { AnimatePresence, motion } from 'framer-motion'
import {
  Bookmark,
  Compass,
  House,
  LayoutDashboard,
  Library,
  LogIn,
  LogOut,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  UserRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useAuth } from '../../store/auth'
import { resolveTheme, usePrefs } from '../../store/prefs'
import { toast } from '../../store/toast'
import { useUI } from '../../store/ui'
import { Avatar } from '../ui/Avatar'
import { ButtonLink, IconButton } from '../ui/Button'
import { Kbd } from '../ui/Feedback'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { Logo } from './Logo'

const NAV = [
  { to: '/', label: 'Главная', icon: House, end: true },
  { to: '/catalog', label: 'Каталог', icon: Compass },
  { to: '/profile/library', label: 'Библиотека', icon: Library, auth: true },
]

export function ThemeToggle({ className }: { className?: string }) {
  const theme = usePrefs((s) => s.theme)
  const setTheme = usePrefs((s) => s.setTheme)
  const resolved = resolveTheme(theme)
  return (
    <IconButton
      label={resolved === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      className={className}
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={resolved}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {resolved === 'dark' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  )
}

function UserMenu() {
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  if (!user) return null
  const go = (to: string, close: () => void) => {
    close()
    navigate(to)
  }
  return (
    <Menu
      width="w-72"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={cn(
            'relative rounded-full p-0.5 transition-transform duration-200 hover:scale-105',
            open && 'ring-2 ring-accent/60'
          )}
          aria-label="Меню профиля"
        >
          <Avatar user={user} size={36} />
          {user.role === 'admin' && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-bg bg-accent-3">
              <Shield className="h-2 w-2 text-white" />
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar user={user} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-muted">@{user.username}</p>
            </div>
            {user.role === 'admin' && (
              <span className="ml-auto rounded-full bg-accent-3/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-accent-3">
                админ
              </span>
            )}
          </div>
          <MenuSeparator />
          <MenuItem icon={<UserRound className="h-4 w-4" />} onClick={() => go('/profile', close)}>
            Личный кабинет
          </MenuItem>
          <MenuItem icon={<Library className="h-4 w-4" />} onClick={() => go('/profile/library', close)}>
            Библиотека
          </MenuItem>
          <MenuItem icon={<Bookmark className="h-4 w-4" />} onClick={() => go('/profile/bookmarks', close)}>
            Закладки
          </MenuItem>
          <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => go('/profile/settings', close)}>
            Настройки
          </MenuItem>
          {user.role === 'admin' && (
            <>
              <MenuSeparator />
              <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => go('/admin', close)}>
                Админ-панель
              </MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem
            danger
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              close()
              await api.signOut()
              toast.show('Вы вышли из аккаунта', 'Возвращайтесь — главы ждут')
              navigate('/')
            }}
          >
            Выйти
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

export function Header() {
  const user = useAuth((s) => s.user)
  const status = useAuth((s) => s.status)
  const openPalette = useUI((s) => s.openPalette)
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 8)
      setHidden(y > 240 && y > last + 4 ? true : y < last - 4 ? false : (h) => h)
      last = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setHidden(false), [location.pathname])

  const nav = NAV.filter((n) => !n.auth || user)
  if (user?.role === 'admin') nav.push({ to: '/admin', label: 'Админка', icon: Shield })

  return (
    <motion.header
      animate={{ y: hidden ? -88 : 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5"
    >
      <div
        className={cn(
          'mx-auto flex h-14 max-w-7xl items-center gap-3 rounded-full px-2.5 pl-3 transition-all duration-500 sm:h-[60px] sm:gap-5 sm:px-3 sm:pl-4',
          scrolled ? 'glass shadow-float' : 'border border-transparent'
        )}
      >
        <Logo />

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200',
                  isActive ? 'text-fg' : 'text-muted hover:text-fg'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full border border-line/10 bg-line/[0.07]"
                      transition={{ type: 'spring', stiffness: 450, damping: 36 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={openPalette}
            className="group hidden h-10 w-64 items-center gap-2.5 rounded-full border border-line/10 bg-line/[0.04] pl-4 pr-2 text-left text-sm text-faint transition-all duration-300 hover:border-line/20 hover:bg-line/[0.07] lg:flex xl:w-72"
          >
            <Search className="h-4 w-4 transition-colors group-hover:text-accent" />
            <span className="flex-1 truncate">Тайтл, автор, жанр…</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <IconButton label="Поиск" className="lg:hidden" onClick={openPalette}>
            <Search className="h-[18px] w-[18px]" />
          </IconButton>
          <ThemeToggle className="max-sm:hidden" />
          {status === 'loading' ? (
            <div className="skeleton h-9 w-9 rounded-full" />
          ) : user ? (
            <UserMenu />
          ) : (
            <ButtonLink
              to={`/login?next=${encodeURIComponent(location.pathname)}`}
              variant="primary"
              size="sm"
              icon={<LogIn className="h-4 w-4" />}
            >
              Войти
            </ButtonLink>
          )}
        </div>
      </div>
    </motion.header>
  )
}

export function MobileNav() {
  const user = useAuth((s) => s.user)
  const openPalette = useUI((s) => s.openPalette)
  const location = useLocation()
  const items = [
    { to: '/', label: 'Главная', icon: House },
    { to: '/catalog', label: 'Каталог', icon: Compass },
    { to: '#search', label: 'Поиск', icon: Search },
    { to: user ? '/profile/library' : '/login', label: 'Полка', icon: Library },
    { to: user ? '/profile' : '/login', label: user ? 'Профиль' : 'Войти', icon: user ? UserRound : LogIn },
  ]
  const activeIndex = items.findIndex((i) =>
    i.to === '/' ? location.pathname === '/' : i.to !== '#search' && location.pathname.startsWith(i.to) && !(i.to === '/profile' && location.pathname.startsWith('/profile/library'))
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-safe md:hidden">
      <div className="glass-strong mx-auto mb-2 flex h-16 max-w-md items-stretch justify-around rounded-[26px] px-1 shadow-float">
        {items.map((item, i) => {
          const Icon = item.icon
          const active = i === activeIndex
          const content = (
            <>
              {active && (
                <motion.span
                  layoutId="mobile-nav"
                  className="absolute inset-x-2 inset-y-2 rounded-2xl bg-accent/12"
                  style={{ background: 'rgb(var(--accent) / 0.12)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <Icon className={cn('relative h-5 w-5 transition-colors', active ? 'text-accent' : 'text-muted')} />
              <span className={cn('relative text-[10.5px] font-medium', active ? 'text-fg' : 'text-muted')}>{item.label}</span>
            </>
          )
          const cls = 'relative flex flex-1 flex-col items-center justify-center gap-1'
          return item.to === '#search' ? (
            <button key={item.label} onClick={openPalette} className={cls}>
              {content}
            </button>
          ) : (
            <Link key={item.label} to={item.to} className={cls}>
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
