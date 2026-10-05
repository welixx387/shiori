import { Link } from 'react-router-dom'
import { isCloud } from '../../lib/api'
import { GENRES, SITE } from '../../lib/constants'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="relative mt-28 overflow-hidden border-t border-line/[0.07] pb-24 md:pb-0">
      <div
        aria-hidden
        className="text-outline pointer-events-none absolute -bottom-[6vw] -right-[2vw] select-none font-jp text-[26vw] leading-none md:text-[19vw]"
      >
        読書
      </div>
      <div className="relative mx-auto grid grid-cols-1 max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            {SITE.tagline}. Каталог с умным поиском, читалка, которая подстраивается под вас, и личная библиотека с прогрессом.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-line/10 bg-surface/60 px-3 py-1.5 text-xs text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${isCloud ? 'bg-ok' : 'bg-accent-2'}`} />
            {isCloud ? 'Облачный режим' : 'Демо-режим: данные хранятся в этом браузере'}
          </span>
        </div>
        <div>
          <p className="kicker mb-4">Читателям</p>
          <ul className="space-y-2.5 text-sm text-fg-2">
            <li><Link className="hover:text-accent" to="/catalog">Каталог</Link></li>
            <li><Link className="hover:text-accent" to="/catalog?sort=updated">Свежие главы</Link></li>
            <li><Link className="hover:text-accent" to="/catalog?sort=rating">Топ по оценкам</Link></li>
            <li><Link className="hover:text-accent" to="/catalog?status=completed">Завершённые</Link></li>
          </ul>
        </div>
        <div>
          <p className="kicker mb-4">Жанры</p>
          <ul className="space-y-2.5 text-sm text-fg-2">
            {GENRES.slice(0, 5).map((g) => (
              <li key={g.name}>
                <Link className="hover:text-accent" to={`/catalog?genres=${encodeURIComponent(g.name)}`}>
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="kicker mb-4">Аккаунт</p>
          <ul className="space-y-2.5 text-sm text-fg-2">
            <li><Link className="hover:text-accent" to="/profile">Личный кабинет</Link></li>
            <li><Link className="hover:text-accent" to="/profile/library">Моя библиотека</Link></li>
            <li><Link className="hover:text-accent" to="/register">Регистрация</Link></li>
          </ul>
        </div>
      </div>
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-line/[0.07] px-5 py-6 text-xs text-faint">
        <span>© {new Date().getFullYear()} {SITE.name} · Для тех, кто читает до рассвета</span>
        <span className="font-jp tracking-widest">一頁ずつ、物語へ</span>
      </div>
    </footer>
  )
}
