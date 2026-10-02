import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient as QC,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { useUser } from '../store/auth'
import { usePositions } from '../store/guest'
import { toast } from '../store/toast'
import type { Bookmark, BookmarkInput, LibraryEntry, Novel, Shelf, UserData } from '../types'
import { api, errorMessage } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

export const qk = {
  novels: (drafts = false) => ['novels', drafts ? 'all' : 'published'] as const,
  novel: (slug: string) => ['novel', slug] as const,
  chapters: (novelId: string, drafts = false) => ['chapters', novelId, drafts ? 'all' : 'published'] as const,
  chapter: (id: string) => ['chapter', id] as const,
  latest: ['latest-chapters'] as const,
  userData: (uid?: string) => ['user-data', uid ?? 'guest'] as const,
  users: ['admin-users'] as const,
}

/** После правок в админке — обновить всё, что зависит от каталога. */
export function invalidateCatalog(qc: QC = queryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['novels'] }),
    qc.invalidateQueries({ queryKey: ['novel'] }),
    qc.invalidateQueries({ queryKey: ['chapters'] }),
    qc.invalidateQueries({ queryKey: ['chapter'] }),
    qc.invalidateQueries({ queryKey: qk.latest }),
  ])
}

// ───────────────────────── Каталог ─────────────────────────

export function useNovels(opts?: { drafts?: boolean }) {
  const drafts = Boolean(opts?.drafts)
  return useQuery({ queryKey: qk.novels(drafts), queryFn: () => api.listNovels({ includeDrafts: drafts }) })
}

export function useNovel(slug: string | undefined) {
  return useQuery({
    queryKey: qk.novel(slug ?? ''),
    queryFn: () => api.getNovel(slug!),
    enabled: Boolean(slug),
  })
}

export function useChapters(novelId: string | undefined, opts?: { drafts?: boolean }) {
  const drafts = Boolean(opts?.drafts)
  return useQuery({
    queryKey: qk.chapters(novelId ?? '', drafts),
    queryFn: () => api.listChapters(novelId!, { includeDrafts: drafts }),
    enabled: Boolean(novelId),
  })
}

export function useChapter(id: string | undefined) {
  return useQuery({
    queryKey: qk.chapter(id ?? ''),
    queryFn: () => api.getChapter(id!),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  })
}

export function useLatestChapters(limit = 24) {
  return useQuery({ queryKey: [...qk.latest, limit], queryFn: () => api.latestChapters(limit) })
}

/** Карта id → тайтл для быстрых подстановок в списках. */
export function useNovelMap() {
  const { data } = useNovels()
  return useMemo(() => new Map((data ?? []).map((n) => [n.id, n])), [data])
}

// ───────────────────────── Личные данные ─────────────────────────

const EMPTY: UserData = { library: [], progress: [], reads: [], ratings: [], bookmarks: [] }

export function useUserData() {
  const user = useUser()
  const query = useQuery({
    queryKey: qk.userData(user?.id),
    queryFn: () => api.getUserData(),
    enabled: Boolean(user),
    staleTime: 30_000,
  })
  return { ...query, data: user ? (query.data ?? EMPTY) : EMPTY, isGuest: !user }
}

function useUpdateUserData() {
  const qc = useQueryClient()
  const user = useUser()
  return (fn: (d: UserData) => UserData) => {
    qc.setQueryData<UserData>(qk.userData(user?.id), (d) => fn(d ?? EMPTY))
  }
}

export function useLibraryEntry(novelId: string | undefined): LibraryEntry | undefined {
  const { data } = useUserData()
  return useMemo(() => data.library.find((l) => l.novelId === novelId), [data.library, novelId])
}

/** Где читатель остановился: с сервера для аккаунта, из браузера — для гостя. */
export function useProgressFor(novelId: string | undefined) {
  const { data, isGuest } = useUserData()
  const guest = usePositions((s) => (novelId ? s.guest[novelId] : undefined))
  return useMemo(() => {
    if (!novelId) return undefined
    if (isGuest) return guest ? { novelId, ...guest } : undefined
    return data.progress.find((p) => p.novelId === novelId)
  }, [data.progress, novelId, isGuest, guest])
}

export function useAllProgress() {
  const { data, isGuest } = useUserData()
  const guest = usePositions((s) => s.guest)
  return useMemo(
    () => (isGuest ? Object.entries(guest).map(([novelId, g]) => ({ novelId, ...g })) : data.progress),
    [isGuest, guest, data.progress]
  )
}

export function useReadSet(novelId?: string) {
  const { data } = useUserData()
  return useMemo(
    () => new Set(data.reads.filter((r) => !novelId || r.novelId === novelId).map((r) => r.chapterId)),
    [data.reads, novelId]
  )
}

export function useMyRating(novelId: string | undefined) {
  const { data } = useUserData()
  return data.ratings.find((r) => r.novelId === novelId)?.score ?? null
}

function patchNovelCaches(qc: QC, novelId: string, fn: (n: Novel) => Novel) {
  qc.setQueriesData<Novel[]>({ queryKey: ['novels'] }, (list) =>
    list?.map((n) => (n.id === novelId ? fn(n) : n))
  )
  qc.setQueriesData<Novel | null>({ queryKey: ['novel'] }, (n) => (n && n.id === novelId ? fn(n) : n))
}

export function useSetLibrary() {
  const qc = useQueryClient()
  const update = useUpdateUserData()
  return useMutation({
    mutationFn: (v: { novelId: string; shelf?: Shelf | null; favorite?: boolean }) =>
      api.setLibrary(v.novelId, { shelf: v.shelf, favorite: v.favorite }),
    onMutate: (v) => {
      let wasIn = false
      let isIn = false
      update((d) => {
        const cur = d.library.find((l) => l.novelId === v.novelId)
        wasIn = Boolean(cur)
        const next: LibraryEntry = {
          novelId: v.novelId,
          shelf: v.shelf !== undefined ? v.shelf : (cur?.shelf ?? null),
          favorite: v.favorite !== undefined ? v.favorite : (cur?.favorite ?? false),
          updatedAt: new Date().toISOString(),
        }
        isIn = Boolean(next.shelf || next.favorite)
        const rest = d.library.filter((l) => l.novelId !== v.novelId)
        return { ...d, library: isIn ? [next, ...rest] : rest }
      })
      if (wasIn !== isIn) {
        patchNovelCaches(qc, v.novelId, (n) => ({ ...n, libraryCount: Math.max(0, n.libraryCount + (isIn ? 1 : -1)) }))
      }
    },
    onError: (e) => {
      toast.error('Не удалось обновить библиотеку', errorMessage(e))
      qc.invalidateQueries({ queryKey: ['user-data'] })
    },
  })
}

export function useRate() {
  const qc = useQueryClient()
  const update = useUpdateUserData()
  return useMutation({
    mutationFn: (v: { novelId: string; score: number | null }) => api.rate(v.novelId, v.score),
    onMutate: (v) => {
      let prev: number | null = null
      update((d) => {
        prev = d.ratings.find((r) => r.novelId === v.novelId)?.score ?? null
        const rest = d.ratings.filter((r) => r.novelId !== v.novelId)
        return {
          ...d,
          ratings: v.score === null ? rest : [...rest, { novelId: v.novelId, score: v.score, updatedAt: new Date().toISOString() }],
        }
      })
      patchNovelCaches(qc, v.novelId, (n) => {
        let { ratingSum, ratingCount } = n
        if (prev !== null) {
          ratingSum -= prev
          ratingCount -= 1
        }
        if (v.score !== null) {
          ratingSum += v.score
          ratingCount += 1
        }
        return { ...n, ratingSum, ratingCount: Math.max(0, ratingCount) }
      })
    },
    onError: (e) => {
      toast.error('Оценка не сохранилась', errorMessage(e))
      qc.invalidateQueries({ queryKey: ['user-data'] })
      qc.invalidateQueries({ queryKey: ['novels'] })
    },
  })
}

export function useMarkRead() {
  const update = useUpdateUserData()
  return useMutation({
    mutationFn: (v: { novelId: string; chapterId: string; words: number }) => api.markRead(v),
    onSuccess: (row) => {
      if (row) update((d) => ({ ...d, reads: [...d.reads.filter((r) => r.chapterId !== row.chapterId), row] }))
    },
  })
}

export function useSaveProgress() {
  const update = useUpdateUserData()
  return useMutation({
    mutationFn: (v: { novelId: string; chapterId: string; position: number }) => api.saveProgress(v),
    onMutate: (v) =>
      update((d) => ({
        ...d,
        progress: [
          { ...v, updatedAt: new Date().toISOString() },
          ...d.progress.filter((p) => p.novelId !== v.novelId),
        ],
      })),
  })
}

export function useBookmarks() {
  const update = useUpdateUserData()
  const add = useMutation({
    mutationFn: (input: BookmarkInput) => api.addBookmark(input),
    onSuccess: (b: Bookmark) => update((d) => ({ ...d, bookmarks: [b, ...d.bookmarks] })),
    onError: (e) => toast.error('Закладка не сохранилась', errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.removeBookmark(id),
    onMutate: (id) => update((d) => ({ ...d, bookmarks: d.bookmarks.filter((b) => b.id !== id) })),
  })
  const edit = useMutation({
    mutationFn: (v: { id: string; note: string }) => api.updateBookmark(v.id, v.note),
    onMutate: (v) =>
      update((d) => ({ ...d, bookmarks: d.bookmarks.map((b) => (b.id === v.id ? { ...b, note: v.note } : b)) })),
  })
  return { add, remove, edit }
}
