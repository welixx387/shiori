import { LocalApi } from './local'
import { SupabaseApi } from './supabase'
import type { Api } from './types'

export { ApiError } from './types'
export type { Api } from './types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Облачный режим включается, когда заданы ключи Supabase (см. .env.example). */
export const isCloud = Boolean(url && anonKey)

export const api: Api = isCloud ? new SupabaseApi(url!, anonKey!) : new LocalApi()

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Что-то пошло не так. Попробуйте ещё раз'
}
