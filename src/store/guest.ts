import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface GuestProgress {
  chapterId: string
  position: number
  updatedAt: string
}

interface PositionsState {
  /** Позиция внутри каждой главы (0–1) — для всех, кто читает в этом браузере */
  positions: Record<string, number>
  /** Последняя глава каждого тайтла для гостей без аккаунта */
  guest: Record<string, GuestProgress>
  setPosition: (chapterId: string, value: number) => void
  setGuest: (novelId: string, chapterId: string, position: number) => void
}

const LIMIT = 400

export const usePositions = create<PositionsState>()(
  persist(
    (set) => ({
      positions: {},
      guest: {},
      setPosition: (chapterId, value) =>
        set((s) => {
          const positions = { ...s.positions, [chapterId]: Math.round(value * 1000) / 1000 }
          const keys = Object.keys(positions)
          if (keys.length > LIMIT) delete positions[keys[0]]
          return { positions }
        }),
      setGuest: (novelId, chapterId, position) =>
        set((s) => ({
          guest: { ...s.guest, [novelId]: { chapterId, position, updatedAt: new Date().toISOString() } },
        })),
    }),
    { name: 'shiori-positions', storage: createJSONStorage(() => localStorage) }
  )
)
