import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePref = 'dark' | 'light' | 'system'

interface PrefsState {
  theme: ThemePref
  reduceMotion: boolean
  recentSearches: string[]
  catalogView: 'grid' | 'list'
  setTheme: (theme: ThemePref) => void
  setReduceMotion: (v: boolean) => void
  addRecentSearch: (q: string) => void
  clearRecentSearches: () => void
  setCatalogView: (v: 'grid' | 'list') => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      reduceMotion: false,
      recentSearches: [],
      catalogView: 'grid',
      setTheme: (theme) => set({ theme }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      addRecentSearch: (q) =>
        set((s) => {
          const query = q.trim()
          if (query.length < 2) return s
          const rest = s.recentSearches.filter((x) => x.toLowerCase() !== query.toLowerCase())
          return { recentSearches: [query, ...rest].slice(0, 8) }
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
      setCatalogView: (catalogView) => set({ catalogView }),
    }),
    { name: 'shiori-prefs', storage: createJSONStorage(() => localStorage) }
  )
)

export function resolveTheme(theme: ThemePref): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Применяет тему и режим анимаций к <html> и следит за системной темой. */
export function bindPrefsToDocument() {
  const apply = () => {
    const { theme, reduceMotion } = usePrefs.getState()
    const resolved = resolveTheme(theme)
    document.documentElement.setAttribute('data-theme', resolved)
    if (reduceMotion) document.documentElement.setAttribute('data-motion', 'reduce')
    else document.documentElement.removeAttribute('data-motion')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#09090f' : '#f6f1e9')
  }
  apply()
  usePrefs.subscribe(apply)
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply)
}
