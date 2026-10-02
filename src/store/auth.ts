import { create } from 'zustand'
import { api } from '../lib/api'
import type { Profile } from '../types'

interface AuthState {
  status: 'loading' | 'ready'
  user: Profile | null
  init: () => void
}

let initialized = false

export const useAuth = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  init: () => {
    if (initialized) return
    initialized = true
    api.onAuthChange((user) => set({ user, status: 'ready' }))
    api
      .currentUser()
      .then((user) => set({ user, status: 'ready' }))
      .catch(() => set({ user: null, status: 'ready' }))
  },
}))

export const useUser = () => useAuth((s) => s.user)
export const useIsAdmin = () => useAuth((s) => s.user?.role === 'admin')
