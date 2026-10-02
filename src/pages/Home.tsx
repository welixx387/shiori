import { PenLine, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Embers } from '../components/effects/Embers'
import { RevealWords } from '../components/effects/Motion'
import { ContinueReading, FreshChapters, GenreGrid, JoinCta, StatsBand, TickerBand, TopRated } from '../components/home/Sections'
import { Hero } from '../components/home/Hero'
import { NovelCardSkeleton, NovelGrid } from '../components/novel/NovelCard'
import { Button, ButtonLink } from '../components/ui/Button'
import { Container, SectionHeader } from '../components/ui/Section'
import { api, errorMessage } from '../lib/api'
import { invalidateCatalog, useNovels, useUserData } from '../lib/queries'
import { useAuth } from '../store/auth'
import { toast } from '../store/toast'

function HomeSkeleton() {
  return (
    <Container className="pt-32">
      <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-5">
          <div className="skeleton h-4 w-40 rounded-full" />
          <div className="skeleton h-16 w-4/5 rounded-3xl" />
          <div className="skeleton h-16 w-3/5 rounded-3xl" />
          <div className="skeleton h-20 w-full max-w-xl rounded-3xl" />
        </div>
        <div className="skeleton mx-auto aspect-[2/3] w-64 rounded-[22px] lg:w-80" />
      </div>
      <div className="mt-24 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <NovelCardSkeleton key={i} />
        ))}
      </div>
    </Container>
  )
}

function EmptyHome() {
  const user = useAuth((s) => s.user)
  const [pending, setPending] = useState(false)
  const isAdmin = user?.role === 'admin'
  return (
    <section className="relative isolate flex min-h-[80vh] items-center overflow-hidden pt-24">
      <Embers className="-z-10" />
      <Container className="text-center">
        <span className="font-brush text-8xl text-ember">栞</span>
        <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          <RevealWords text="Здесь скоро появятся истории" />
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-muted">
          {isAdmin
            ? 'Каталог пока пуст. Добавьте первый тайтл или загрузите демо-подборку, чтобы посмотреть, как всё выглядит.'
            : 'Каталог пока пуст — администратор уже готовит первые главы. Загляните чуть позже.'}
        </p>
        {isAdmin && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/admin/novels/new" variant="primary" size="lg" icon={<PenLine className="h-4 w-4" />}>
              Добавить тайтл
            </ButtonLink>
            <Button
              size="lg"
              variant="glass"
              loading={pending}
              icon={<Sparkles className="h-4 w-4" />}
              onClick={async () => {
                setPending(true)
                try {
                  const n = await api.importDemo()
                  await invalidateCatalog()
                  toast.success('Готово', `Добавлено демо-тайтлов: ${n}`)
                } catch (e) {
                  toast.error('Не получилось', errorMessage(e))
                } finally {
                  setPending(false)
                }
              }}
            >
              Загрузить демо-тайтлы
            </Button>
          </div>
        )}
      </Container>
    </section>
  )
}

export default function Home() {
  const { data: novels, isLoading } = useNovels()
  const user = useAuth((s) => s.user)
  const { data } = useUserData()

  if (isLoading) return <HomeSkeleton />
  if (!novels?.length) return <EmptyHome />

  const newest = [...novels].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const progressMap = new Map(
    data.library.map((l) => {
      const n = novels.find((x) => x.id === l.novelId)
      const read = data.reads.filter((r) => r.novelId === l.novelId).length
      return [l.novelId, n?.chaptersCount ? Math.min(1, read / n.chaptersCount) : 0]
    })
  )

  return (
    <>
      <Hero novels={novels} />
      <TickerBand />
      <ContinueReading />
      <FreshChapters novels={novels} />
      <TopRated novels={novels} />
      <GenreGrid novels={novels} />
      <Container className="mt-24">
        <SectionHeader kanji="始" kicker="Недавно в каталоге" title="Новинки" link={{ to: '/catalog?sort=new', label: 'Все новинки' }} />
        <NovelGrid novels={newest} progressMap={user ? progressMap : undefined} />
      </Container>
      <StatsBand novels={novels} />
      {!user && <JoinCta novels={novels} />}
    </>
  )
}
