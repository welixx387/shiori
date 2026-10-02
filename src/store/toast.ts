import { create } from 'zustand'

export type ToastTone = 'default' | 'success' | 'error' | 'info'

export interface Toast {
  id: number
  title: string
  description?: string
  tone: ToastTone
  action?: { label: string; onClick: () => void }
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>) => number
  dismiss: (id: number) => void
}

let seq = 1

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++
    const toast: Toast = { tone: 'default', duration: 4200, ...t, id }
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }))
    if (toast.duration > 0) setTimeout(() => useToasts.getState().dismiss(id), toast.duration)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  show: (title: string, description?: string) => useToasts.getState().push({ title, description }),
  success: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: 'success' }),
  error: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: 'error', duration: 6000 }),
  info: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: 'info' }),
  action: (title: string, action: Toast['action'], description?: string) =>
    useToasts.getState().push({ title, description, action, duration: 7000 }),
}
