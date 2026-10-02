import { create } from 'zustand'

interface UIState {
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
}

export const useUI = create<UIState>()((set) => ({
  paletteOpen: false,
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
}))
