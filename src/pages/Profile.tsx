import { motion } from 'framer-motion'
import {
  BookOpen,
  Bookmark as BookmarkIcon,
  CalendarDays,
  Clock,
  Crown,
  Flame,
  Heart,
  LayoutDashboard,
  Library,
  PenLine,
  Settings,
  Sparkles,
  Trophy,
  Type,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Embers } from '../components/effects/Embers'
import { CountUp } from '../components/effects/Motion'
import { NovelGrid } from '../components/novel/NovelCard'
import { AchievementBadge, ActivityHeatmap, GenreBars, LevelMeter, StatTile } from '../components/profile/Charts'
import { BookmarksTab, HistoryTab } from '../components/profile/Lists'
import { SettingsTab } from '../components/profile/SettingsTab'
import { Avatar } from '../components/ui/Avatar'
import { ButtonLink } from '../components/ui/Button'
import { Segmented, Tabs } from '../components/ui/Controls'
import { EmptyState } from '../components/ui/Feedback'
import { Container } from '../components/ui/Section'
import { useTitle } from '../hooks/useTitle'
import { SHELVES, SHELF_ORDER, auraInfo } from '../lib/constants'
import { cn } from '../lib/cn'
import { formatDate, formatDuration, formatNumber, plural } from '../lib/format'
import { useAllProgress, useNovelMap, useUserData } from '../lib/queries'
import { computeAchievements, computeStats } from '../lib/stats'
import { useAuth } from '../store/auth'
import type { Novel, Shelf } from '../types'

type Tab = 'overview' | 'library' | 'history' | 'bookmarks' | 'achievements' | 'settings'
const TABS: Tab[] = ['overview', 'library', 'history', 'bookmarks', 'achievements', 'settings']

function LibraryTab() {
  const { data } = useUserData()
  const novels = useNovelMap()
  const [shelf, setShelf] = useState<Shelf | 'all' | 'favorite'>('all')
  const [sort, setSort] = useState<'updated' | 'title' | 'progress'>('updated')

  const readCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data.reads) m.set(r.novelId, (m.get(r.novelId) ?? 0) + 1)
    return m
  }, [data.reads])

  const entries = data.library.filter((l) => novels.has(l.novelId))
  const counts = {
    all: entries.length,
    favorite: entries.filter((l) => l.favorite).length,
    ...Object.fromEntries(SHELF_ORDER.map((s) => [s, entries.filter((l) => l.shelf === s).length])),
  } as Record<string, number>

  const filtered = entries.filter((l) => (shelf === 'all' ? true : shelf === 'favorite' ? l.favorite : l.shelf === shelf))
  const progressOf = (n: Novel) => (n.chaptersCount ? Math.min(1, (readCount.get(n.id) ?? 0) / n.chaptersCount) : 0)
  const list = filtered
    .map((l) => ({ l, n: novels.get(l.novelId)! }))
    .sort((a, b) =>
      sort === 'title'
        ? a.n.title.localeCompare(b.n.title, 'ru')
        : sort === 'progress'
          ? progressOf(b.n) - progressOf(a.n)
          : b.l.updatedAt.localeCompare(a.l.updatedAt)
    )
    .map((x) => x.n)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={shelf}
          onChange={setShelf}
          tabs={[
            { value: 'all', label: 'Все', count: counts.all },
            ...SHELF_ORDER.map((s) => ({ value: s, label: SHELVES[s].label, count: counts[s] })),
            { value: 'favorite', label: 'Любимое', count: counts.favorite, icon: <Heart className="h-3.5 w-3.5" /> },
          ]}
        />
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'updated', label: 'Недавние' },
            { value: 'title', label: 'А–Я' },
            { value: 'progress', label: 'Прогресс' },
          ]}
        />
      </div>
      <div className="mt-8">
        {list.length ? (
          <NovelGrid novels={list} progressMap={new Map(list.map((n) => [n.id, progressOf(n)]))} className="lg:grid-cols-5" />
        ) : (
          <EmptyState
            kanji="棚"
            title={shelf === 'all' ? 'Полки пока пусты' : 'На этой полке пусто'}
            description="Откройте любой тайтл и нажмите «В библиотеку» — он появится здесь вместе с прогрессом чтения."
            action={
              <ButtonLink to="/catalog" variant="primary" icon={<Sparkles className="h-4 w-4" />}>
                Найти что почитать
              </ButtonLink>
            }
          />
        )}
      </div>
    </div>
  )
}

export default function Profile() {
  const user = useAuth((s) => s.user)!
  const { tab: rawTab } = useParams()
  const navigate = useNavigate()
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'overview'
  const { data } = useUserData()
  const novels = useNovelMap()
  const progress = useAllProgress()
  const stats = useMemo(() => computeStats(data, novels), [data, novels])
  const achievements = useMemo(() => computeAchievements(stats), [stats])
  const aura = auraInfo(user.aura)
  useTitle('Личный кабинет')

  const unlocked = achievements.filter((a) => a.unlocked)
  const continueList = [...progress]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => novels.get(p.novelId))
    .filter((n): n is Novel => Boolean(n))
    .slice(0, 4)

  return (
    <Container className="pt-24 sm:pt-28">
      {/* Карточка профиля */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative isolate overflow-hidden rounded-[36px] border border-line/10"
      >
        <div className="absolute inset-0 -z-20 animate-gradient-pan" style={{ background: aura.gradient, backgroundSize: '220% 220%' }} />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(9,9,15,0.72))]" />
        <Embers className="-z-10" density={0.5} />
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 -z-10 select-none font-brush text-[14rem] leading-none text-white/15 sm:text-[18rem]">
          読
        </span>

        <div className="flex flex-col gap-6 p-6 pt-24 text-white sm:p-10 sm:pt-28 md:flex-row md:items-end">
          <div className="relative w-fit">
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }}>
              <Avatar user={user} size={112} className="ring-4 ring-white/30" />
            </motion.div>
            <span className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-4 border-[#14121a] bg-white font-display text-sm font-bold text-[#14121a]">
              {stats.level}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{user.displayName}</h1>
              {user.role === 'admin' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                  <Crown className="h-3.5 w-3.5" /> Администратор
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-white/75">
              @{user.username} · с нами с {formatDate(user.createdAt)}
            </p>
            {user.bio && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/90">{user.bio}</p>}
            <div className="mt-5 max-w-md">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold">
                  Уровень {stats.level} · {stats.levelTitle}
                </span>
                <span className="text-white/70 tabular">
                  {stats.xp} / {stats.levelTo} XP
                </span>
              </div>
              <LevelMeter xp={stats.xp} from={stats.levelFrom} to={stats.levelTo} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/profile/settings" variant="light" size="sm" icon={<PenLine className="h-4 w-4" />}>
              Редактировать
            </ButtonLink>
            {user.role === 'admin' && (
              <ButtonLink to="/admin" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20" variant="outline" icon={<LayoutDashboard className="h-4 w-4" />}>
                Админка
              </ButtonLink>
            )}
          </div>
        </div>
      </motion.section>

      <Tabs
        className="mt-8"
        value={tab}
        onChange={(t) => navigate(t === 'overview' ? '/profile' : `/profile/${t}`)}
        tabs={[
          { value: 'overview', label: 'Обзор', icon: <Sparkles className="h-4 w-4" /> },
          { value: 'library', label: 'Библиотека', icon: <Library className="h-4 w-4" />, count: stats.library },
          { value: 'history', label: 'История', icon: <Clock className="h-4 w-4" /> },
          { value: 'bookmarks', label: 'Закладки', icon: <BookmarkIcon className="h-4 w-4" />, count: stats.bookmarks },
          { value: 'achievements', label: 'Достижения', icon: <Trophy className="h-4 w-4" />, count: unlocked.length },
          { value: 'settings', label: 'Настройки', icon: <Settings className="h-4 w-4" /> },
        ]}
      />

      <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-8">
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon={<BookOpen className="h-4 w-4" />} label="Глав прочитано" value={formatNumber(stats.chapters)} hint={`${formatNumber(stats.words)} ${plural(stats.words, ['слово', 'слова', 'слов'])}`} />
              <StatTile icon={<Clock className="h-4 w-4" />} label="Время за чтением" value={stats.minutes ? formatDuration(stats.minutes) : '0 мин'} hint="оценка по объёму текста" />
              <StatTile
                icon={<Flame className="h-4 w-4" />}
                label="Серия дней"
                value={`${stats.streak} ${plural(stats.streak, ['день', 'дня', 'дней'])}`}
                hint={stats.bestStreak ? `рекорд — ${stats.bestStreak}` : 'читайте каждый день'}
              />
              <StatTile icon={<CalendarDays className="h-4 w-4" />} label="Дней с книгой" value={formatNumber(stats.activeDays)} hint={`в библиотеке ${stats.library} ${plural(stats.library, ['тайтл', 'тайтла', 'тайтлов'])}`} />
            </div>

            <section className="rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
              <h2 className="font-display text-lg font-semibold tracking-tight">Активность чтения</h2>
              <p className="mb-5 text-sm text-muted">Каждая клетка — день, цвет — сколько глав вы дочитали</p>
              <ActivityHeatmap byDay={stats.byDay} />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
                <h2 className="font-display text-lg font-semibold tracking-tight">Любимые жанры</h2>
                <p className="mb-5 text-sm text-muted">{data.reads.length ? 'По прочитанным главам' : 'По тайтлам в библиотеке'}</p>
                <GenreBars genres={stats.genres} unit={data.reads.length ? 'chapters' : 'titles'} />
              </section>
              <section className="rounded-[32px] border border-line/[0.08] bg-surface/50 p-5 sm:p-7">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold tracking-tight">Достижения</h2>
                  <Link to="/profile/achievements" className="text-sm font-medium text-accent hover:underline">
                    Все {achievements.length}
                  </Link>
                </div>
                <p className="mb-5 text-sm text-muted">
                  Открыто <CountUp value={unlocked.length} /> из {achievements.length}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {(unlocked.length ? unlocked : achievements).slice(0, 3).map((a, i) => (
                    <div key={a.id} className={cn('flex flex-col items-center rounded-3xl border border-line/[0.06] p-3 text-center', !a.unlocked && 'opacity-60')}>
                      <span
                        className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', a.unlocked ? 'text-white' : 'bg-line/[0.06] text-faint')}
                        style={a.unlocked ? { background: `linear-gradient(135deg, hsl(${a.hue} 85% 62%), hsl(${a.hue + 40} 80% 50%))` } : undefined}
                      >
                        <a.icon className="h-6 w-6" />
                      </span>
                      <span className="mt-2 line-clamp-2 text-xs font-medium">{a.title}</span>
                      <span className="sr-only">{i}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {continueList.length > 0 && (
              <section>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold tracking-tight">Недавно читали</h2>
                  <Link to="/profile/history" className="text-sm font-medium text-accent hover:underline">
                    История
                  </Link>
                </div>
                <NovelGrid novels={continueList} className="lg:grid-cols-4 xl:grid-cols-4" />
              </section>
            )}

            {stats.chapters === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-[32px] border border-dashed border-line/15 p-8 text-center">
                <Type className="h-6 w-6 text-accent" />
                <p className="font-semibold">Статистика наполнится, как только вы дочитаете первую главу</p>
                <ButtonLink to="/catalog" variant="primary" size="sm">
                  Выбрать историю
                </ButtonLink>
              </div>
            )}
          </div>
        )}
        {tab === 'library' && <LibraryTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'bookmarks' && <BookmarksTab />}
        {tab === 'achievements' && (
          <div>
            <p className="mb-6 text-sm text-muted">
              Открыто <span className="font-semibold text-fg">{unlocked.length}</span> из {achievements.length}. Достижения считаются по прочитанным главам, полкам, оценкам и закладкам.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[...achievements].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).map((a, i) => (
                <AchievementBadge key={a.id} a={a} index={i} />
              ))}
            </div>
          </div>
        )}
        {tab === 'settings' && <SettingsTab />}
      </motion.div>
    </Container>
  )
}
