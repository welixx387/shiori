import { BookCopy, ShieldCheck, Users } from 'lucide-react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Container } from '../../components/ui/Section'
import { NotFound } from '../../components/layout/Layout'
import { useTitle } from '../../hooks/useTitle'
import { isCloud } from '../../lib/api'
import { cn } from '../../lib/cn'
import ChapterEditor from './ChapterEditor'
import Dashboard from './Dashboard'
import NovelEditor from './NovelEditor'
import UsersPage from './Users'

export default function Admin() {
  useTitle('Админ-панель')
  const location = useLocation()
  return (
    <Container className="pt-24 sm:pt-28">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="kicker">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Админ-панель · {isCloud ? 'облако' : 'демо-режим'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Мастерская</h1>
        </div>
        <nav className="flex gap-1 rounded-full border border-line/10 bg-line/[0.03] p-1">
          {[
            { to: '/admin', label: 'Тайтлы', icon: BookCopy, end: false },
            { to: '/admin/users', label: 'Пользователи', icon: Users, end: true },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  isActive && !(item.to === '/admin' && location.pathname.startsWith('/admin/users'))
                    ? 'bg-surface text-fg shadow-sm'
                    : 'text-muted hover:text-fg'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="novels/new" element={<NovelEditor />} />
        <Route path="novels/:id" element={<NovelEditor />} />
        <Route path="novels/:id/chapters/new" element={<ChapterEditor />} />
        <Route path="novels/:id/chapters/:chapterId" element={<ChapterEditor />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Container>
  )
}
