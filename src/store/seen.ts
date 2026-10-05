import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SeenState {
  /** Время самого нового подарка, который читатель уже видел (по id аккаунта) */
  gifts: Record<string, string>
  markGifts: (userId: string, at: string) => void
}

export const useSeen = create<SeenState>()(
  persist(
    (set) => ({
      gifts: {},
      // Запоминаем время с сервера, а не часы телефона: они могут спешить.
      markGifts: (userId, at) =>
        set((s) => {
          const prev = s.gifts[userId]
          return prev && Date.parse(prev) >= Date.parse(at) ? s : { gifts: { ...s.gifts, [userId]: at } }
        }),
    }),
    { name: 'shiori-seen', storage: createJSONStorage(() => localStorage) }
  )
)
