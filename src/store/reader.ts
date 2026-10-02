import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ReaderTheme = 'paper' | 'sepia' | 'matcha' | 'dusk' | 'night' | 'oled'
export type ReaderFont = 'literata' | 'ptserif' | 'lora' | 'alegreya' | 'onest' | 'georgia'

export interface ReaderSettings {
  theme: ReaderTheme
  font: ReaderFont
  fontSize: number
  lineHeight: number
  width: number
  paragraphGap: number
  indent: boolean
  justify: boolean
  hyphens: boolean
  mode: 'scroll' | 'paged'
  dim: number
  ttsRate: number
  ttsVoice: string | null
  autoNext: boolean
}

export const READER_DEFAULTS: ReaderSettings = {
  theme: 'night',
  font: 'literata',
  fontSize: 19,
  lineHeight: 1.75,
  width: 700,
  paragraphGap: 0.85,
  indent: false,
  justify: false,
  hyphens: true,
  mode: 'scroll',
  dim: 0,
  ttsRate: 1,
  ttsVoice: null,
  autoNext: true,
}

export const READER_THEMES: { id: ReaderTheme; label: string; bg: string; fg: string; dark: boolean }[] = [
  { id: 'paper', label: 'Бумага', bg: '#f7f3ea', fg: '#23201c', dark: false },
  { id: 'sepia', label: 'Сепия', bg: '#efe2c8', fg: '#3b2f22', dark: false },
  { id: 'matcha', label: 'Матча', bg: '#e2eada', fg: '#1f2a1d', dark: false },
  { id: 'dusk', label: 'Сумерки', bg: '#1d1b26', fg: '#ddd6e6', dark: true },
  { id: 'night', label: 'Ночь', bg: '#0e0e15', fg: '#c9c4d4', dark: true },
  { id: 'oled', label: 'OLED', bg: '#000000', fg: '#b8b3c2', dark: true },
]

export const READER_FONTS: { id: ReaderFont; label: string; family: string; google?: string }[] = [
  { id: 'literata', label: 'Literata', family: "'Literata', Georgia, serif" },
  {
    id: 'ptserif',
    label: 'PT Serif',
    family: "'PT Serif', Georgia, serif",
    google: 'PT+Serif:ital,wght@0,400;0,700;1,400;1,700',
  },
  {
    id: 'lora',
    label: 'Lora',
    family: "'Lora', Georgia, serif",
    google: 'Lora:ital,wght@0,400..700;1,400..700',
  },
  {
    id: 'alegreya',
    label: 'Alegreya',
    family: "'Alegreya', Georgia, serif",
    google: 'Alegreya:ital,wght@0,400..800;1,400..800',
  },
  { id: 'onest', label: 'Onest', family: "'Onest', system-ui, sans-serif" },
  { id: 'georgia', label: 'Georgia', family: "Georgia, 'Times New Roman', serif" },
]

const loadedFonts = new Set<string>()

/** Шрифты читалки подгружаются только когда их выбирают. */
export function ensureReaderFont(id: ReaderFont) {
  const font = READER_FONTS.find((f) => f.id === id)
  if (!font?.google || loadedFonts.has(id)) return
  loadedFonts.add(id)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`
  document.head.appendChild(link)
}

interface ReaderState extends ReaderSettings {
  set: (patch: Partial<ReaderSettings>) => void
  reset: () => void
}

export const useReaderSettings = create<ReaderState>()(
  persist(
    (set) => ({
      ...READER_DEFAULTS,
      set: (patch) => set(patch),
      reset: () => set(READER_DEFAULTS),
    }),
    { name: 'shiori-reader', storage: createJSONStorage(() => localStorage), version: 1 }
  )
)
