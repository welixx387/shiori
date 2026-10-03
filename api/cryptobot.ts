/**
 * Покупка кейсов через @CryptoBot (Crypto Pay API) — серверная функция Vercel.
 *
 *   POST /api/cryptobot  { action: 'create', caseId, quantity }  → счёт в @CryptoBot
 *   POST /api/cryptobot  { action: 'check' }                      → зачислить оплаченные счета
 *   POST /api/cryptobot  (вебхук от @CryptoBot с подписью)          → зачислить оплату сразу
 *   GET  /api/cryptobot                                             → настроена ли оплата
 *
 * Переменные окружения в Vercel (Settings → Environment Variables):
 *   CRYPTOBOT_TOKEN            токен приложения из @CryptoBot → Crypto Pay → My Apps
 *   CRYPTOBOT_NETWORK          testnet — для тестового бота @CryptoTestnetBot (необязательно)
 *   SUPABASE_SERVICE_ROLE_KEY  служебный ключ Supabase (или SUPABASE_SECRET_KEY)
 *   SUPABASE_URL               адрес проекта (или NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL)
 *
 * Токен и служебный ключ живут только здесь, на сервере: в браузер они не попадают.
 * Цена берётся из базы, а не из запроса, поэтому подменить сумму нельзя.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const CRYPTO_ASSETS = ['USDT', 'TON', 'BTC', 'ETH', 'LTC', 'BNB', 'TRX', 'USDC']

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value.trim()
  }
  return ''
}

const SUPABASE_URL = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
const TOKEN = env('CRYPTOBOT_TOKEN')
const API = env('CRYPTOBOT_NETWORK').toLowerCase() === 'testnet' ? 'https://testnet-pay.crypt.bot/api' : 'https://pay.crypt.bot/api'

interface Invoice {
  invoice_id: number
  status: 'active' | 'paid' | 'expired'
  payload?: string
  bot_invoice_url?: string
  mini_app_invoice_url?: string
  web_app_invoice_url?: string
  pay_url?: string
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

async function cryptoPay<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Crypto-Pay-API-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error?: { name?: string } } | null
  if (!data?.ok) {
    const name = data?.error?.name ?? `HTTP ${res.status}`
    if (/UNAUTHORIZED|EXPIRED_TOKEN/i.test(name)) throw new Error('@CryptoBot не принял токен. Проверьте CRYPTOBOT_TOKEN и сеть (CRYPTOBOT_NETWORK)')
    throw new Error(`@CryptoBot вернул ошибку: ${name}`)
  }
  return data.result as T
}

function signatureValid(raw: string, signature: string) {
  const secret = createHash('sha256').update(TOKEN).digest()
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function credit(db: SupabaseClient, purchaseId: string) {
  const { data, error } = await db.rpc('credit_purchase', { p_id: purchaseId })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

async function createInvoice(db: SupabaseClient, userId: string, body: Record<string, unknown>, origin: string) {
  const caseId = String(body.caseId ?? '')
  const quantity = Math.floor(Number(body.quantity ?? 1))
  if (!caseId || !Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
    return reply(400, { error: 'Можно купить от 1 до 20 кейсов за раз' })
  }
  const { data: box, error } = await db
    .from('cases')
    .select('id, name, price, currency, active, weekly')
    .eq('id', caseId)
    .maybeSingle()
  if (error) return reply(500, { error: error.message })
  if (!box || !box.active || box.weekly || Number(box.price) <= 0) return reply(400, { error: 'Этот кейс сейчас не продаётся' })

  const currency = String(box.currency || 'USDT').toUpperCase()
  const crypto = CRYPTO_ASSETS.includes(currency)
  const amount = Number((Number(box.price) * quantity).toFixed(crypto ? 8 : 2))

  const { data: purchase, error: insertError } = await db
    .from('purchases')
    .insert({ user_id: userId, case_id: box.id, quantity, amount, currency, status: 'active' })
    .select('id')
    .single()
  if (insertError) return reply(500, { error: insertError.message })

  try {
    const invoice = await cryptoPay<Invoice>('createInvoice', {
      ...(crypto ? { currency_type: 'crypto', asset: currency } : { currency_type: 'fiat', fiat: currency }),
      amount: String(amount),
      description: `Shiori: ${quantity} × «${box.name}»`.slice(0, 1024),
      payload: purchase.id,
      expires_in: 3600,
      allow_comments: false,
      ...(origin.startsWith('https://') ? { paid_btn_name: 'callback', paid_btn_url: `${origin}/cases?paid=1` } : {}),
    })
    const payUrl = invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.web_app_invoice_url || invoice.pay_url || ''
    await db.from('purchases').update({ invoice_id: invoice.invoice_id, pay_url: payUrl }).eq('id', purchase.id)
    return reply(200, { purchaseId: purchase.id, payUrl })
  } catch (e) {
    await db.from('purchases').update({ status: 'failed' }).eq('id', purchase.id)
    return reply(502, { error: e instanceof Error ? e.message : 'Не удалось выставить счёт' })
  }
}

async function checkInvoices(db: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  const { data: pending, error } = await db
    .from('purchases')
    .select('id, invoice_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('invoice_id', 'is', null)
    .gte('created_at', since)
    .limit(50)
  if (error) return reply(500, { error: error.message })
  if (!pending?.length) return reply(200, { credited: 0 })

  const result = await cryptoPay<{ items?: Invoice[] } | Invoice[]>('getInvoices', {
    invoice_ids: pending.map((p) => p.invoice_id).join(','),
  })
  const invoices = Array.isArray(result) ? result : (result.items ?? [])
  let credited = 0
  for (const invoice of invoices) {
    const purchase = pending.find((p) => Number(p.invoice_id) === Number(invoice.invoice_id))
    if (!purchase) continue
    if (invoice.status === 'paid') credited += await credit(db, purchase.id)
    else if (invoice.status === 'expired') await db.from('purchases').update({ status: 'expired' }).eq('id', purchase.id).eq('status', 'active')
  }
  return reply(200, { credited })
}

async function webhook(db: SupabaseClient, raw: string, signature: string) {
  if (!signatureValid(raw, signature)) return reply(401, { error: 'bad signature' })
  const update = JSON.parse(raw) as { update_type?: string; payload?: Invoice }
  const invoice = update.payload
  if (update.update_type !== 'invoice_paid' || !invoice?.payload) return reply(200, { ok: true })
  const { data: purchase } = await db
    .from('purchases')
    .select('id, invoice_id')
    .eq('id', invoice.payload)
    .maybeSingle()
  if (purchase && Number(purchase.invoice_id) === Number(invoice.invoice_id)) await credit(db, purchase.id)
  return reply(200, { ok: true })
}

export async function GET() {
  return reply(200, {
    ok: true,
    configured: Boolean(TOKEN && SERVICE_KEY && SUPABASE_URL),
    missing: [!TOKEN && 'CRYPTOBOT_TOKEN', !SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY', !SUPABASE_URL && 'SUPABASE_URL'].filter(Boolean),
    network: API.includes('testnet') ? 'testnet' : 'mainnet',
  })
}

export async function POST(request: Request) {
  if (!TOKEN || !SERVICE_KEY || !SUPABASE_URL) {
    return reply(503, { error: 'Оплата не настроена: в Vercel нужны переменные CRYPTOBOT_TOKEN и SUPABASE_SERVICE_ROLE_KEY' })
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const raw = await request.text()

  try {
    const signature = request.headers.get('crypto-pay-api-signature')
    if (signature) return await webhook(db, raw, signature)

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      return reply(400, { error: 'Некорректный запрос' })
    }
    const jwt = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return reply(401, { error: 'Войдите в аккаунт' })
    const { data, error } = await db.auth.getUser(jwt)
    if (error || !data.user) return reply(401, { error: 'Сессия истекла — войдите заново' })

    const origin = request.headers.get('origin') || env('SITE_URL')
    if (body.action === 'create') return await createInvoice(db, data.user.id, body, origin.replace(/\/$/, ''))
    if (body.action === 'check') return await checkInvoices(db, data.user.id)
    return reply(400, { error: 'Неизвестное действие' })
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Ошибка сервера оплаты' })
  }
}
