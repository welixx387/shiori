import { ApiError } from './types'

export const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,24}$/u

export function validateEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ApiError('Похоже, в email опечатка', 'invalid_email')
  }
}

export function validatePassword(password: string) {
  if (password.length < 6) {
    throw new ApiError('Пароль должен быть не короче 6 символов', 'weak_password')
  }
}

export function validateUsername(username: string) {
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(
      'Никнейм: 3–24 символа — буквы, цифры, точка, дефис или подчёркивание',
      'invalid_username'
    )
  }
}

/** Оценка надёжности пароля 0–4 для индикатора на форме регистрации. */
export function passwordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[a-zа-яё]/.test(password) && /[A-ZА-ЯЁ]/.test(password)) score++
  if (/\d/.test(password) && /[^\p{L}\p{N}]/u.test(password)) score++
  else if (/\d/.test(password) || /[^\p{L}\p{N}]/u.test(password)) score += 0.5
  return Math.min(4, Math.floor(score))
}
