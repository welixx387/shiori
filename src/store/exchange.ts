import { create } from 'zustand'
import type { PublicProfile } from '../types'

export type ExchangeMode = 'gift' | 'trade'

export interface ExchangeRequest {
  mode: ExchangeMode
  /** С кем дарим или меняемся; если не указан — сначала выбираем читателя */
  partner?: PublicProfile | null
  /** Карточки (Card.id), отмеченные заранее: свои — give, собеседника — take */
  give?: string[]
  take?: string[]
}

interface ExchangeState {
  request: ExchangeRequest | null
  open: (request: ExchangeRequest) => void
  close: () => void
}

/** Окно «Подарить / Обменяться» открывается из любого места сайта. */
export const useExchange = create<ExchangeState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}))

export const openExchange = (request: ExchangeRequest) => useExchange.getState().open(request)
