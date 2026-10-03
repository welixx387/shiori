import type { Card, CaseType, Rarity } from '../types'

/** Редкости карточек — от частых к редким. */
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']

export const RARITIES: Record<
  Rarity,
  { label: string; short: string; color: string; glow: string; text: string; ring: string }
> = {
  common: {
    label: 'Обычная',
    short: 'Обычн.',
    color: '#9aa3b2',
    glow: 'rgba(154,163,178,0.35)',
    text: 'text-[#b8c0cc]',
    ring: 'ring-[#9aa3b2]/50',
  },
  rare: {
    label: 'Редкая',
    short: 'Редк.',
    color: '#4ea8ff',
    glow: 'rgba(78,168,255,0.45)',
    text: 'text-[#6fb8ff]',
    ring: 'ring-[#4ea8ff]/60',
  },
  epic: {
    label: 'Эпическая',
    short: 'Эпич.',
    color: '#b064ff',
    glow: 'rgba(176,100,255,0.5)',
    text: 'text-[#c48cff]',
    ring: 'ring-[#b064ff]/60',
  },
  legendary: {
    label: 'Легендарная',
    short: 'Легенд.',
    color: '#ffb547',
    glow: 'rgba(255,181,71,0.55)',
    text: 'text-[#ffc76e]',
    ring: 'ring-[#ffb547]/70',
  },
  mythic: {
    label: 'Мифическая',
    short: 'Миф.',
    color: '#ff4d6d',
    glow: 'rgba(255,77,109,0.6)',
    text: 'text-[#ff7a92]',
    ring: 'ring-[#ff4d6d]/70',
  },
}

export const DEFAULT_WEIGHTS: Record<Rarity, number> = { common: 60, rare: 25, epic: 10, legendary: 4, mythic: 1 }

/** Валюты счёта в @CryptoBot: криптовалюты и фиатные (сумма пересчитывается в крипту при оплате). */
export const CRYPTO_ASSETS = ['USDT', 'TON', 'BTC', 'ETH', 'LTC', 'BNB', 'TRX', 'USDC']
export const FIAT_CURRENCIES = ['RUB', 'USD', 'EUR']
export const CASE_CURRENCIES = [...CRYPTO_ASSETS, ...FIAT_CURRENCIES]

export const WEEKLY_MS = 7 * 24 * 3600 * 1000

/** Когда можно забрать следующий бесплатный кейс; null — уже можно. */
export function nextWeekly(lastClaimIso: string | null, now = Date.now()): string | null {
  if (!lastClaimIso) return null
  const next = new Date(lastClaimIso).getTime() + WEEKLY_MS
  return next > now ? new Date(next).toISOString() : null
}

/** Карточки, которые могут выпасть из кейса. */
export function casePool(box: Pick<CaseType, 'novelId'>, cards: Card[]) {
  return cards.filter((c) => c.active && (!box.novelId || c.novelId === box.novelId))
}

/** Шансы редкостей с учётом того, каких карточек в кейсе нет (в процентах). */
export function caseOdds(box: Pick<CaseType, 'novelId' | 'weights'>, cards: Card[]): Record<Rarity, number> {
  const pool = casePool(box, cards)
  const present = new Set(pool.map((c) => c.rarity))
  const total = RARITY_ORDER.reduce((s, r) => s + (present.has(r) ? Math.max(0, box.weights[r] ?? 0) : 0), 0)
  const out = {} as Record<Rarity, number>
  for (const r of RARITY_ORDER) out[r] = total > 0 && present.has(r) ? (Math.max(0, box.weights[r] ?? 0) / total) * 100 : 0
  return out
}

/** Выбор карточки по весам кейса (локальный режим; в облаке это делает сервер). */
export function rollCard(box: Pick<CaseType, 'novelId' | 'weights'>, cards: Card[], rnd = Math.random): Card | null {
  const pool = casePool(box, cards)
  const odds = caseOdds(box, cards)
  let roll = rnd() * 100
  let rarity: Rarity | null = null
  for (const r of RARITY_ORDER) {
    if (odds[r] <= 0) continue
    roll -= odds[r]
    rarity = r
    if (roll < 0) break
  }
  if (!rarity) return null
  const options = pool.filter((c) => c.rarity === rarity)
  return options[Math.floor(rnd() * options.length)] ?? null
}

export function formatPrice(amount: number, currency: string) {
  const digits = CRYPTO_ASSETS.includes(currency) && amount < 1 ? 4 : 2
  const value = amount.toLocaleString('ru-RU', { maximumFractionDigits: digits })
  if (currency === 'RUB') return `${value} ₽`
  if (currency === 'USD') return `$${value}`
  if (currency === 'EUR') return `${value} €`
  return `${value} ${currency}`
}

/** Цвета титулов. */
export const TITLE_TONES: Record<string, { label: string; className: string }> = {
  ember: { label: 'Уголёк', className: 'bg-[#ff6a4d]/15 text-[#ff8a70] ring-[#ff6a4d]/30' },
  gold: { label: 'Золото', className: 'bg-[#ffb547]/15 text-[#ffc76e] ring-[#ffb547]/35' },
  violet: { label: 'Фиалка', className: 'bg-[#b064ff]/15 text-[#c48cff] ring-[#b064ff]/30' },
  sky: { label: 'Небо', className: 'bg-[#4ea8ff]/15 text-[#7cbcff] ring-[#4ea8ff]/30' },
  jade: { label: 'Нефрит', className: 'bg-[#2fd4a3]/15 text-[#5fe0b9] ring-[#2fd4a3]/30' },
  sakura: { label: 'Сакура', className: 'bg-[#ff7ab6]/15 text-[#ff9cc8] ring-[#ff7ab6]/30' },
}

export function titleTone(tone: string) {
  return TITLE_TONES[tone] ?? TITLE_TONES.ember
}
