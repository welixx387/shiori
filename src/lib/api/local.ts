import type {
  AdminUser,
  Bookmark,
  BookmarkInput,
  Card,
  CardInput,
  CaseInput,
  CaseType,
  Chapter,
  ChapterInput,
  ChapterMeta,
  ChapterRead,
  Comment,
  CommentInput,
  FriendEntry,
  FriendStatus,
  LibraryEntry,
  Novel,
  NovelInput,
  OwnedCard,
  OwnedCase,
  Profile,
  ProfilePatch,
  ProgressEntry,
  PublicProfile,
  Purchase,
  RatingEntry,
  ReadingSummary,
  Role,
  Shelf,
  Title,
  TitleInput,
  Trade,
  TradeInput,
  UserData,
  UserTitle,
  WeeklyStatus,
} from '../../types'
import { nextWeekly, rollCard } from '../collect'
import { hashString, shortId } from '../id'
import { blobToDataUrl } from '../image'
import { kvDel, kvGet, kvSet, safeStorage } from '../kv'
import { countWords } from '../text'
import { slugify } from '../translit'
import { ApiError, type Api, type ImageKind, type ListOptions, type SignUpInput, type SignUpResult } from './types'
import { validateEmail, validatePassword, validateUsername } from './validation'

/**
 * Локальный режим: «сервер» живёт прямо в браузере (IndexedDB).
 * Повторяет правила облачной версии: первый зарегистрированный аккаунт —
 * администратор, черновики видит только админ, личные данные — только владелец.
 */

interface LocalUser extends Profile {
  passwordHash: string
  salt: string
}

type Owned<T> = T & { userId: string }

interface LocalFriendship {
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
  createdAt: string
}

interface Tables {
  users: LocalUser[]
  novels: Novel[]
  chapters: ChapterMeta[]
  library: Owned<LibraryEntry>[]
  progress: Owned<ProgressEntry>[]
  reads: Owned<ChapterRead>[]
  ratings: Owned<RatingEntry>[]
  bookmarks: Owned<Bookmark>[]
  friendships: LocalFriendship[]
  comments: Omit<Comment, 'author'>[]
  titles: Title[]
  userTitles: UserTitle[]
  cards: Card[]
  cases: CaseType[]
  userCases: OwnedCase[]
  userCards: OwnedCard[]
  trades: Trade[]
}

const TABLES: (keyof Tables)[] = [
  'users',
  'novels',
  'chapters',
  'library',
  'progress',
  'reads',
  'ratings',
  'bookmarks',
  'friendships',
  'comments',
  'titles',
  'userTitles',
  'cards',
  'cases',
  'userCases',
  'userCards',
  'trades',
]

const SESSION_KEY = 'shiori-session'
const contentKey = (id: string) => `content:${id}`
const now = () => new Date().toISOString()

function toProfile(u: LocalUser): Profile {
  const { passwordHash: _h, salt: _s, ...profile } = u
  return { ...profile, titleId: profile.titleId ?? null }
}

function toPublic(u: LocalUser): PublicProfile {
  const { email: _e, ...rest } = toProfile(u)
  return rest
}

function strip<T extends { userId: string }>(row: T): Omit<T, 'userId'> {
  const { userId: _u, ...rest } = row
  return rest
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (subtle) {
    const enc = new TextEncoder()
    const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: 120_000, hash: 'SHA-256' },
      key,
      256
    )
    return bufferToHex(bits)
  }
  // Небезопасный контекст (http по IP в локальной сети) — WebCrypto недоступен.
  return 'weak:' + hashString(salt + ':' + password).toString(16)
}

export class LocalApi implements Api {
  readonly mode = 'local' as const

  private t: Tables = {
    users: [],
    novels: [],
    chapters: [],
    library: [],
    progress: [],
    reads: [],
    ratings: [],
    bookmarks: [],
    friendships: [],
    comments: [],
    titles: [],
    userTitles: [],
    cards: [],
    cases: [],
    userCases: [],
    userCards: [],
    trades: [],
  }
  private ready: Promise<void>
  private authListeners = new Set<(p: Profile | null) => void>()
  private externalListeners = new Set<() => void>()
  private sessionUserId: string | null = safeStorage.get(SESSION_KEY)
  private channel: BroadcastChannel | null = null

  constructor() {
    this.ready = this.load(true)
    try {
      this.channel = new BroadcastChannel('shiori-local')
      this.channel.onmessage = () => {
        // Другая вкладка что-то изменила — перечитываем таблицы.
        this.sessionUserId = safeStorage.get(SESSION_KEY)
        this.ready = this.load(false).then(() => {
          this.externalListeners.forEach((cb) => cb())
          this.emitAuth()
        })
      }
    } catch {
      this.channel = null
    }
  }

  onExternalChange(cb: () => void) {
    this.externalListeners.add(cb)
    return () => this.externalListeners.delete(cb)
  }

  private async load(allowSeed: boolean) {
    const rows = await Promise.all(TABLES.map((k) => kvGet<unknown[]>(k)))
    TABLES.forEach((k, i) => {
      ;(this.t[k] as unknown[]) = rows[i] ?? []
    })
    if (!allowSeed) return
    const meta = await kvGet<{ seeded?: boolean; version?: number }>('meta')
    if (!meta?.seeded || (meta.version ?? 1) < 2) {
      // Версия 2: вместо прежних демо-тайтлов — стартовый каталог.
      if (meta?.seeded) await this.removeRetiredDemo()
      await this.seedDemo()
      await kvSet('meta', { seeded: true, version: 2 })
    }
  }

  private async removeRetiredDemo() {
    const { RETIRED_DEMO_SLUGS } = await import('../seed')
    const retired = new Set(RETIRED_DEMO_SLUGS)
    const ids = new Set(this.t.novels.filter((n) => retired.has(n.slug)).map((n) => n.id))
    if (!ids.size) return
    const chapterIds = this.t.chapters.filter((c) => ids.has(c.novelId)).map((c) => c.id)
    this.t.novels = this.t.novels.filter((n) => !ids.has(n.id))
    this.t.chapters = this.t.chapters.filter((c) => !ids.has(c.novelId))
    this.t.library = this.t.library.filter((r) => !ids.has(r.novelId))
    this.t.progress = this.t.progress.filter((r) => !ids.has(r.novelId))
    this.t.reads = this.t.reads.filter((r) => !ids.has(r.novelId))
    this.t.ratings = this.t.ratings.filter((r) => !ids.has(r.novelId))
    this.t.bookmarks = this.t.bookmarks.filter((r) => !ids.has(r.novelId))
    await Promise.all(chapterIds.map((cid) => kvDel(contentKey(cid))))
    await this.save(...TABLES.filter((t) => t !== 'users'))
  }

  private async save(...tables: (keyof Tables)[]) {
    await Promise.all(tables.map((k) => kvSet(k, this.t[k])))
    this.channel?.postMessage({ tables })
  }

  private me(): LocalUser | null {
    if (!this.sessionUserId) return null
    return this.t.users.find((u) => u.id === this.sessionUserId) ?? null
  }

  private isAdmin() {
    return this.me()?.role === 'admin'
  }

  private requireUser(): LocalUser {
    const user = this.me()
    if (!user) throw new ApiError('Войдите в аккаунт, чтобы продолжить', 'auth')
    return user
  }

  private requireAdmin(): LocalUser {
    const user = this.requireUser()
    if (user.role !== 'admin') throw new ApiError('Это действие доступно только администратору', 'forbidden')
    return user
  }

  private emitAuth() {
    const user = this.me()
    const profile = user ? toProfile(user) : null
    this.authListeners.forEach((cb) => cb(profile))
  }

  private setSession(userId: string | null) {
    this.sessionUserId = userId
    if (userId) safeStorage.set(SESSION_KEY, userId)
    else safeStorage.remove(SESSION_KEY)
    this.emitAuth()
  }

  // ───────────────────────── Аккаунт ─────────────────────────

  async currentUser() {
    await this.ready
    const user = this.me()
    if (!user && this.sessionUserId) this.setSession(null)
    return user ? toProfile(user) : null
  }

  onAuthChange(cb: (p: Profile | null) => void) {
    this.authListeners.add(cb)
    return () => {
      this.authListeners.delete(cb)
    }
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    await this.ready
    const email = input.email.trim().toLowerCase()
    const username = input.username.trim()
    validateEmail(email)
    validatePassword(input.password)
    validateUsername(username)
    if (this.t.users.some((u) => u.email === email)) {
      throw new ApiError('Пользователь с таким email уже зарегистрирован', 'email_taken')
    }
    if (await this.isUsernameTaken(username)) {
      throw new ApiError('Этот никнейм уже занят', 'username_taken')
    }
    const salt = shortId(16)
    const user: LocalUser = {
      id: shortId(16),
      email,
      username,
      displayName: username,
      bio: '',
      avatarUrl: null,
      aura: 'ember',
      role: this.t.users.some((u) => u.role === 'admin') ? 'user' : 'admin',
      titleId: null,
      createdAt: now(),
      salt,
      passwordHash: await hashPassword(input.password, salt),
    }
    this.t.users.push(user)
    await this.save('users')
    this.setSession(user.id)
    return { profile: toProfile(user), needsConfirmation: false }
  }

  async signIn(emailRaw: string, password: string) {
    await this.ready
    const email = emailRaw.trim().toLowerCase()
    const user = this.t.users.find((u) => u.email === email)
    if (!user || (await hashPassword(password, user.salt)) !== user.passwordHash) {
      throw new ApiError('Неверный email или пароль', 'invalid_credentials')
    }
    this.setSession(user.id)
    return toProfile(user)
  }

  async signOut() {
    this.setSession(null)
  }

  async updateProfile(patch: ProfilePatch) {
    await this.ready
    const user = this.requireUser()
    if (patch.username !== undefined) {
      const username = patch.username.trim()
      validateUsername(username)
      const taken = this.t.users.some(
        (u) => u.id !== user.id && u.username.toLowerCase() === username.toLowerCase()
      )
      if (taken) throw new ApiError('Этот никнейм уже занят', 'username_taken')
      user.username = username
    }
    if (patch.displayName !== undefined) user.displayName = patch.displayName.trim().slice(0, 40)
    if (patch.bio !== undefined) user.bio = patch.bio.trim().slice(0, 280)
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl
    if (patch.aura !== undefined) user.aura = patch.aura
    if (patch.titleId !== undefined) {
      const owns = !patch.titleId || this.t.userTitles.some((t) => t.userId === user.id && t.titleId === patch.titleId)
      if (!owns) throw new ApiError('Этот титул вам ещё не выдан', 'forbidden')
      user.titleId = patch.titleId
    }
    await this.save('users')
    this.emitAuth()
    return toProfile(user)
  }

  async changePassword(current: string, next: string) {
    await this.ready
    const user = this.requireUser()
    if ((await hashPassword(current, user.salt)) !== user.passwordHash) {
      throw new ApiError('Неверный текущий пароль', 'invalid_credentials')
    }
    validatePassword(next)
    user.salt = shortId(16)
    user.passwordHash = await hashPassword(next, user.salt)
    await this.save('users')
  }

  async changeEmail(emailRaw: string) {
    await this.ready
    const user = this.requireUser()
    const email = emailRaw.trim().toLowerCase()
    validateEmail(email)
    if (this.t.users.some((u) => u.id !== user.id && u.email === email)) {
      throw new ApiError('Пользователь с таким email уже зарегистрирован', 'email_taken')
    }
    user.email = email
    await this.save('users')
    this.emitAuth()
    return { needsConfirmation: false }
  }

  async requestPasswordReset(_email: string) {
    throw new ApiError(
      'В демо-режиме письма не отправляются: аккаунты живут только в этом браузере. Зарегистрируйтесь заново или подключите Supabase.',
      'not_supported'
    )
  }

  async setNewPassword(password: string) {
    await this.ready
    const user = this.requireUser()
    validatePassword(password)
    user.salt = shortId(16)
    user.passwordHash = await hashPassword(password, user.salt)
    await this.save('users')
  }

  async isUsernameTaken(username: string) {
    await this.ready
    const name = username.trim().toLowerCase()
    const me = this.sessionUserId
    return this.t.users.some((u) => u.id !== me && u.username.toLowerCase() === name)
  }

  async uploadImage(_kind: ImageKind, file: Blob) {
    return blobToDataUrl(file)
  }

  async deleteAccount() {
    await this.ready
    const user = this.requireUser()
    const admins = this.t.users.filter((u) => u.role === 'admin')
    if (user.role === 'admin' && admins.length === 1 && this.t.users.length > 1) {
      throw new ApiError('Сначала назначьте другого администратора', 'last_admin')
    }
    for (const entry of this.t.library.filter((l) => l.userId === user.id)) {
      const novel = this.t.novels.find((n) => n.id === entry.novelId)
      if (novel) novel.libraryCount = Math.max(0, novel.libraryCount - 1)
    }
    for (const r of this.t.ratings.filter((x) => x.userId === user.id)) {
      const novel = this.t.novels.find((n) => n.id === r.novelId)
      if (novel) {
        novel.ratingSum -= r.score
        novel.ratingCount = Math.max(0, novel.ratingCount - 1)
      }
    }
    const mine = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId !== user.id)
    this.t.library = mine(this.t.library)
    this.t.progress = mine(this.t.progress)
    this.t.reads = mine(this.t.reads)
    this.t.ratings = mine(this.t.ratings)
    this.t.bookmarks = mine(this.t.bookmarks)
    this.t.userTitles = mine(this.t.userTitles)
    this.t.userCases = mine(this.t.userCases)
    this.t.userCards = mine(this.t.userCards)
    this.t.comments = mine(this.t.comments)
    this.t.friendships = this.t.friendships.filter((f) => f.requester !== user.id && f.addressee !== user.id)
    this.t.trades = this.t.trades.filter((t) => t.fromUser !== user.id && t.toUser !== user.id)
    this.t.users = this.t.users.filter((u) => u.id !== user.id)
    await this.save(...TABLES)
    this.setSession(null)
  }

  // ───────────────────────── Каталог ─────────────────────────

  private visibleNovel(n: Novel | undefined, opts?: ListOptions): n is Novel {
    if (!n) return false
    return n.published || (Boolean(opts?.includeDrafts) && this.isAdmin())
  }

  async listNovels(opts?: ListOptions) {
    await this.ready
    return this.t.novels
      .filter((n) => this.visibleNovel(n, opts))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ ...n }))
  }

  async getNovel(slugOrId: string, opts?: ListOptions) {
    await this.ready
    const n = this.t.novels.find((x) => x.slug === slugOrId || x.id === slugOrId)
    // Админ видит черновик и без флага — так работает предпросмотр из админки.
    const visible = n && (n.published || this.isAdmin() || opts?.includeDrafts)
    return visible && n ? { ...n } : null
  }

  async listChapters(novelId: string, opts?: ListOptions) {
    await this.ready
    const novel = this.t.novels.find((n) => n.id === novelId)
    const admin = this.isAdmin()
    if (!novel || (!novel.published && !admin)) return []
    const drafts = admin && opts?.includeDrafts
    return this.t.chapters
      .filter((c) => c.novelId === novelId && (c.published || drafts))
      .sort((a, b) => a.volume - b.volume || a.number - b.number)
      .map((c) => ({ ...c }))
  }

  async getChapter(id: string): Promise<Chapter | null> {
    await this.ready
    const meta = this.t.chapters.find((c) => c.id === id)
    if (!meta) return null
    const novel = this.t.novels.find((n) => n.id === meta.novelId)
    if (!this.isAdmin() && (!meta.published || !novel?.published)) return null
    const content = (await kvGet<string>(contentKey(id))) ?? ''
    return { ...meta, content }
  }

  async latestChapters(limit: number) {
    await this.ready
    const published = new Set(this.t.novels.filter((n) => n.published).map((n) => n.id))
    return this.t.chapters
      .filter((c) => c.published && published.has(c.novelId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((c) => ({ ...c }))
  }

  async recordView(novelId: string) {
    await this.ready
    const n = this.t.novels.find((x) => x.id === novelId)
    if (!n) return
    n.views += 1
    await this.save('novels')
  }

  // ───────────────────────── Админка ─────────────────────────

  private uniqueSlug(base: string, exceptId?: string) {
    const root = slugify(base)
    let slug = root
    let i = 2
    while (this.t.novels.some((n) => n.slug === slug && n.id !== exceptId)) slug = `${root}-${i++}`
    return slug
  }

  private recompute(novelId: string) {
    const novel = this.t.novels.find((n) => n.id === novelId)
    if (!novel) return
    const published = this.t.chapters.filter((c) => c.novelId === novelId && c.published)
    novel.chaptersCount = published.length
    novel.lastChapterAt = published.reduce<string | null>(
      (max, c) => (!max || c.createdAt > max ? c.createdAt : max),
      null
    )
  }

  async createNovel(input: NovelInput) {
    await this.ready
    this.requireAdmin()
    const ts = now()
    const novel: Novel = {
      ...input,
      id: shortId(14),
      slug: this.uniqueSlug(input.slug || input.title),
      views: 0,
      ratingSum: 0,
      ratingCount: 0,
      chaptersCount: 0,
      libraryCount: 0,
      lastChapterAt: null,
      createdAt: ts,
      updatedAt: ts,
    }
    this.t.novels.push(novel)
    await this.save('novels')
    return { ...novel }
  }

  async updateNovel(id: string, patch: Partial<NovelInput>) {
    await this.ready
    this.requireAdmin()
    const novel = this.t.novels.find((n) => n.id === id)
    if (!novel) throw new ApiError('Тайтл не найден', 'not_found')
    Object.assign(novel, patch)
    if (patch.slug !== undefined) novel.slug = this.uniqueSlug(patch.slug || novel.title, id)
    novel.updatedAt = now()
    await this.save('novels')
    return { ...novel }
  }

  async deleteNovel(id: string) {
    await this.ready
    this.requireAdmin()
    const chapterIds = this.t.chapters.filter((c) => c.novelId === id).map((c) => c.id)
    this.t.novels = this.t.novels.filter((n) => n.id !== id)
    this.t.chapters = this.t.chapters.filter((c) => c.novelId !== id)
    this.t.library = this.t.library.filter((r) => r.novelId !== id)
    this.t.progress = this.t.progress.filter((r) => r.novelId !== id)
    this.t.reads = this.t.reads.filter((r) => r.novelId !== id)
    this.t.ratings = this.t.ratings.filter((r) => r.novelId !== id)
    this.t.bookmarks = this.t.bookmarks.filter((r) => r.novelId !== id)
    await Promise.all(chapterIds.map((cid) => kvDel(contentKey(cid))))
    await this.save(...TABLES.filter((t) => t !== 'users'))
  }

  private buildChapter(input: ChapterInput, createdAt = now()): ChapterMeta {
    return {
      id: shortId(14),
      novelId: input.novelId,
      volume: input.volume,
      number: input.number,
      title: input.title.trim(),
      wordCount: countWords(input.content),
      published: input.published,
      createdAt,
      updatedAt: createdAt,
    }
  }

  async createChapter(input: ChapterInput) {
    await this.ready
    this.requireAdmin()
    if (!this.t.novels.some((n) => n.id === input.novelId)) throw new ApiError('Тайтл не найден', 'not_found')
    const meta = this.buildChapter(input)
    await kvSet(contentKey(meta.id), input.content)
    this.t.chapters.push(meta)
    this.recompute(input.novelId)
    this.touch(input.novelId)
    await this.save('chapters', 'novels')
    return { ...meta }
  }

  async createChapters(inputs: ChapterInput[]) {
    await this.ready
    this.requireAdmin()
    const base = Date.now()
    const touched = new Set<string>()
    for (const [i, input] of inputs.entries()) {
      // Сохраняем порядок «свежести»: последняя глава — самая новая.
      const meta = this.buildChapter(input, new Date(base + i).toISOString())
      await kvSet(contentKey(meta.id), input.content)
      this.t.chapters.push(meta)
      touched.add(input.novelId)
    }
    touched.forEach((id) => {
      this.recompute(id)
      this.touch(id)
    })
    await this.save('chapters', 'novels')
    return inputs.length
  }

  private touch(novelId: string) {
    const novel = this.t.novels.find((n) => n.id === novelId)
    if (novel) novel.updatedAt = now()
  }

  async updateChapter(id: string, patch: Partial<ChapterInput>) {
    await this.ready
    this.requireAdmin()
    const meta = this.t.chapters.find((c) => c.id === id)
    if (!meta) throw new ApiError('Глава не найдена', 'not_found')
    if (patch.volume !== undefined) meta.volume = patch.volume
    if (patch.number !== undefined) meta.number = patch.number
    if (patch.title !== undefined) meta.title = patch.title.trim()
    if (patch.published !== undefined) {
      // Глава, впервые опубликованная из черновика, поднимается в «Свежих главах».
      if (patch.published && !meta.published) meta.createdAt = now()
      meta.published = patch.published
    }
    if (patch.content !== undefined) {
      meta.wordCount = countWords(patch.content)
      await kvSet(contentKey(id), patch.content)
    }
    meta.updatedAt = now()
    this.recompute(meta.novelId)
    await this.save('chapters', 'novels')
    return { ...meta }
  }

  async deleteChapters(ids: string[]) {
    await this.ready
    this.requireAdmin()
    const set = new Set(ids)
    const novels = new Set(this.t.chapters.filter((c) => set.has(c.id)).map((c) => c.novelId))
    this.t.chapters = this.t.chapters.filter((c) => !set.has(c.id))
    this.t.reads = this.t.reads.filter((r) => !set.has(r.chapterId))
    this.t.progress = this.t.progress.filter((r) => !set.has(r.chapterId))
    this.t.bookmarks = this.t.bookmarks.filter((r) => !set.has(r.chapterId))
    await Promise.all(ids.map((id) => kvDel(contentKey(id))))
    novels.forEach((id) => this.recompute(id))
    await this.save('chapters', 'novels', 'reads', 'progress', 'bookmarks')
  }

  async listUsers(): Promise<AdminUser[]> {
    await this.ready
    this.requireAdmin()
    return this.t.users
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        aura: u.aura,
        role: u.role,
        createdAt: u.createdAt,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async setUserRole(userId: string, role: Role) {
    await this.ready
    this.requireAdmin()
    const user = this.t.users.find((u) => u.id === userId)
    if (!user) throw new ApiError('Пользователь не найден', 'not_found')
    if (user.role === 'admin' && role !== 'admin') {
      const admins = this.t.users.filter((u) => u.role === 'admin')
      if (admins.length <= 1) throw new ApiError('Нельзя снять права с последнего администратора', 'last_admin')
    }
    user.role = role
    await this.save('users')
    this.emitAuth()
  }

  async importDemo() {
    await this.ready
    this.requireAdmin()
    return this.seedDemo()
  }

  private async seedDemo() {
    const { STARTER_NOVELS } = await import('../seed')
    const day = 86_400_000
    const base = Date.now()
    let added = 0
    for (const starter of STARTER_NOVELS) {
      if (this.t.novels.some((n) => n.slug === starter.novel.slug)) continue
      const createdAt = new Date(base - starter.addedDaysAgo * day).toISOString()
      const novel: Novel = {
        ...starter.novel,
        id: shortId(14),
        views: 0,
        ratingSum: 0,
        ratingCount: 0,
        libraryCount: 0,
        chaptersCount: 0,
        lastChapterAt: null,
        createdAt,
        updatedAt: createdAt,
      }
      this.t.novels.push(novel)
      added++
    }
    await this.save('novels')
    return added
  }

  // ───────────────────────── Личные данные ─────────────────────────

  async getUserData(): Promise<UserData> {
    await this.ready
    const user = this.me()
    if (!user) return { library: [], progress: [], reads: [], ratings: [], bookmarks: [] }
    const own = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId === user.id).map(strip)
    return {
      library: own(this.t.library),
      progress: own(this.t.progress),
      reads: own(this.t.reads),
      ratings: own(this.t.ratings),
      bookmarks: own(this.t.bookmarks),
    }
  }

  async setLibrary(novelId: string, patch: { shelf?: Shelf | null; favorite?: boolean }) {
    await this.ready
    const user = this.requireUser()
    const novel = this.t.novels.find((n) => n.id === novelId)
    const idx = this.t.library.findIndex((r) => r.userId === user.id && r.novelId === novelId)
    const current = idx >= 0 ? this.t.library[idx] : null
    const next: Owned<LibraryEntry> = {
      userId: user.id,
      novelId,
      shelf: patch.shelf !== undefined ? patch.shelf : (current?.shelf ?? null),
      favorite: patch.favorite !== undefined ? patch.favorite : (current?.favorite ?? false),
      updatedAt: now(),
    }
    const empty = !next.shelf && !next.favorite
    if (empty) {
      if (current) {
        this.t.library.splice(idx, 1)
        if (novel) novel.libraryCount = Math.max(0, novel.libraryCount - 1)
      }
    } else if (current) {
      this.t.library[idx] = next
    } else {
      this.t.library.push(next)
      if (novel) novel.libraryCount += 1
    }
    await this.save('library', 'novels')
    return empty ? null : strip(next)
  }

  async saveProgress(entry: { novelId: string; chapterId: string; position: number }) {
    await this.ready
    const user = this.me()
    if (!user) return
    const row: Owned<ProgressEntry> = { ...entry, userId: user.id, updatedAt: now() }
    const idx = this.t.progress.findIndex((r) => r.userId === user.id && r.novelId === entry.novelId)
    if (idx >= 0) this.t.progress[idx] = row
    else this.t.progress.push(row)
    await this.save('progress')
  }

  async markRead(entry: { novelId: string; chapterId: string; words: number }) {
    await this.ready
    const user = this.me()
    if (!user) return null
    if (this.t.reads.some((r) => r.userId === user.id && r.chapterId === entry.chapterId)) return null
    const row: Owned<ChapterRead> = { ...entry, userId: user.id, readAt: now() }
    this.t.reads.push(row)
    await this.save('reads')
    return strip(row)
  }

  async rate(novelId: string, score: number | null) {
    await this.ready
    const user = this.requireUser()
    const novel = this.t.novels.find((n) => n.id === novelId)
    const idx = this.t.ratings.findIndex((r) => r.userId === user.id && r.novelId === novelId)
    const prev = idx >= 0 ? this.t.ratings[idx] : null
    if (score === null) {
      if (prev) {
        this.t.ratings.splice(idx, 1)
        if (novel) {
          novel.ratingSum -= prev.score
          novel.ratingCount = Math.max(0, novel.ratingCount - 1)
        }
      }
    } else {
      const value = Math.min(10, Math.max(1, Math.round(score)))
      const row: Owned<RatingEntry> = { userId: user.id, novelId, score: value, updatedAt: now() }
      if (prev) {
        this.t.ratings[idx] = row
        if (novel) novel.ratingSum += value - prev.score
      } else {
        this.t.ratings.push(row)
        if (novel) {
          novel.ratingSum += value
          novel.ratingCount += 1
        }
      }
    }
    await this.save('ratings', 'novels')
  }

  async addBookmark(input: BookmarkInput) {
    await this.ready
    const user = this.requireUser()
    const row: Owned<Bookmark> = { ...input, id: shortId(14), userId: user.id, createdAt: now() }
    this.t.bookmarks.push(row)
    await this.save('bookmarks')
    return strip(row)
  }

  async updateBookmark(id: string, note: string) {
    await this.ready
    const user = this.requireUser()
    const row = this.t.bookmarks.find((b) => b.id === id && b.userId === user.id)
    if (!row) return
    row.note = note.slice(0, 500)
    await this.save('bookmarks')
  }

  async removeBookmark(id: string) {
    await this.ready
    const user = this.requireUser()
    this.t.bookmarks = this.t.bookmarks.filter((b) => !(b.id === id && b.userId === user.id))
    await this.save('bookmarks')
  }

  async clearHistory() {
    await this.ready
    const user = this.requireUser()
    this.t.reads = this.t.reads.filter((r) => r.userId !== user.id)
    this.t.progress = this.t.progress.filter((r) => r.userId !== user.id)
    await this.save('reads', 'progress')
  }

  // ───────────────────────── Читатели и друзья ─────────────────────────

  private userById(id: string) {
    return this.t.users.find((u) => u.id === id)
  }

  async searchUsers(query: string) {
    await this.ready
    const q = query.trim().toLowerCase()
    if (!q) return []
    return this.t.users
      .filter((u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.username.toLowerCase() === q) - Number(a.username.toLowerCase() === q) ||
          a.username.length - b.username.length
      )
      .slice(0, 30)
      .map(toPublic)
  }

  async getPublicProfile(username: string) {
    await this.ready
    const name = username.trim().toLowerCase()
    const user = this.t.users.find((u) => u.username.toLowerCase() === name)
    return user ? toPublic(user) : null
  }

  async getProfileById(id: string) {
    await this.ready
    const user = this.userById(id)
    return user ? toPublic(user) : null
  }

  async listFriends(): Promise<FriendEntry[]> {
    await this.ready
    const me = this.requireUser()
    const out: FriendEntry[] = []
    for (const f of this.t.friendships) {
      if (f.requester !== me.id && f.addressee !== me.id) continue
      const other = this.userById(f.requester === me.id ? f.addressee : f.requester)
      if (!other) continue
      out.push({
        profile: toPublic(other),
        status: f.status === 'accepted' ? 'friends' : f.requester === me.id ? 'outgoing' : 'incoming',
        since: f.createdAt,
      })
    }
    return out
  }

  private pair(a: string, b: string) {
    return this.t.friendships.find(
      (f) => (f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a)
    )
  }

  async sendFriendRequest(userId: string): Promise<FriendStatus> {
    await this.ready
    const me = this.requireUser()
    if (userId === me.id) throw new ApiError('Нельзя добавить в друзья самого себя')
    if (!this.userById(userId)) throw new ApiError('Пользователь не найден', 'not_found')
    const existing = this.pair(me.id, userId)
    if (existing) {
      if (existing.status === 'accepted') return 'friends'
      if (existing.requester === userId) {
        existing.status = 'accepted'
        existing.createdAt = now()
        await this.save('friendships')
        return 'friends'
      }
      return 'outgoing'
    }
    this.t.friendships.push({ requester: me.id, addressee: userId, status: 'pending', createdAt: now() })
    await this.save('friendships')
    return 'outgoing'
  }

  async respondFriendRequest(userId: string, accept: boolean) {
    await this.ready
    const me = this.requireUser()
    const f = this.t.friendships.find((x) => x.requester === userId && x.addressee === me.id && x.status === 'pending')
    if (!f) return
    if (accept) {
      f.status = 'accepted'
      f.createdAt = now()
    } else {
      this.t.friendships = this.t.friendships.filter((x) => x !== f)
    }
    await this.save('friendships')
  }

  async removeFriend(userId: string) {
    await this.ready
    const me = this.requireUser()
    this.t.friendships = this.t.friendships.filter((f) => f !== this.pair(me.id, userId))
    await this.save('friendships')
  }

  // ───────────────────────── Комментарии ─────────────────────────

  private withAuthor(c: Omit<Comment, 'author'>): Comment {
    const author = this.userById(c.userId)
    return { ...c, author: author ? toPublic(author) : null }
  }

  async listComments(novelId: string, chapterId: string | null) {
    await this.ready
    const novel = this.t.novels.find((n) => n.id === novelId)
    if (!novel || (!novel.published && !this.isAdmin())) return []
    return this.t.comments
      .filter((c) => c.novelId === novelId && (c.chapterId ?? null) === chapterId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => this.withAuthor(c))
  }

  async addComment(input: CommentInput) {
    await this.ready
    const me = this.requireUser()
    const body = input.body.trim()
    if (!body) throw new ApiError('Напишите что-нибудь')
    if (body.length > 2000) throw new ApiError('Комментарий длиннее 2000 символов')
    let { novelId } = input
    let chapterId = input.chapterId ?? null
    let parentId = input.parentId ?? null
    if (parentId) {
      const parent = this.t.comments.find((c) => c.id === parentId)
      if (!parent) throw new ApiError('Комментарий, на который вы отвечаете, удалён')
      parentId = parent.parentId ?? parent.id
      novelId = parent.novelId
      chapterId = parent.chapterId
    }
    const row = { id: shortId(14), novelId, chapterId, parentId, userId: me.id, body, createdAt: now() }
    this.t.comments.push(row)
    await this.save('comments')
    return this.withAuthor(row)
  }

  async deleteComment(id: string) {
    await this.ready
    const me = this.requireUser()
    const c = this.t.comments.find((x) => x.id === id)
    if (!c) return
    if (c.userId !== me.id && me.role !== 'admin') throw new ApiError('Можно удалять только свои комментарии', 'forbidden')
    this.t.comments = this.t.comments.filter((x) => x.id !== id && x.parentId !== id)
    await this.save('comments')
  }

  // ───────────────────────── Титулы ─────────────────────────

  async listTitles() {
    await this.ready
    return [...this.t.titles]
  }

  async listUserTitles(userId: string) {
    await this.ready
    return this.t.userTitles.filter((t) => t.userId === userId)
  }

  async saveTitle(input: TitleInput, id?: string) {
    await this.ready
    this.requireAdmin()
    const name = input.name.trim()
    if (!name) throw new ApiError('Укажите название титула')
    const data = { name, description: input.description.trim(), tone: input.tone, novelId: input.novelId }
    if (id) {
      const title = this.t.titles.find((t) => t.id === id)
      if (!title) throw new ApiError('Титул не найден', 'not_found')
      Object.assign(title, data)
      await this.save('titles')
      return { ...title }
    }
    const title: Title = { id: shortId(14), ...data, createdAt: now() }
    this.t.titles.push(title)
    await this.save('titles')
    return title
  }

  async deleteTitle(id: string) {
    await this.ready
    this.requireAdmin()
    this.t.titles = this.t.titles.filter((t) => t.id !== id)
    this.t.userTitles = this.t.userTitles.filter((t) => t.titleId !== id)
    for (const u of this.t.users) if (u.titleId === id) u.titleId = null
    await this.save('titles', 'userTitles', 'users')
    this.emitAuth()
  }

  async grantTitle(userId: string, titleId: string) {
    await this.ready
    this.requireAdmin()
    if (this.t.userTitles.some((t) => t.userId === userId && t.titleId === titleId)) return
    this.t.userTitles.push({ userId, titleId, grantedAt: now() })
    await this.save('userTitles')
  }

  async revokeTitle(userId: string, titleId: string) {
    await this.ready
    this.requireAdmin()
    this.t.userTitles = this.t.userTitles.filter((t) => !(t.userId === userId && t.titleId === titleId))
    const user = this.userById(userId)
    if (user?.titleId === titleId) user.titleId = null
    await this.save('userTitles', 'users')
    this.emitAuth()
  }

  // ───────────────────────── Карточки и кейсы ─────────────────────────

  async listCards() {
    await this.ready
    return [...this.t.cards]
  }

  async saveCard(input: CardInput, id?: string) {
    await this.ready
    this.requireAdmin()
    const data = { ...input, name: input.name.trim(), description: input.description.trim() }
    if (!data.name) throw new ApiError('Укажите имя персонажа')
    if (id) {
      const card = this.t.cards.find((c) => c.id === id)
      if (!card) throw new ApiError('Карточка не найдена', 'not_found')
      Object.assign(card, data)
      await this.save('cards')
      return { ...card }
    }
    const card: Card = { id: shortId(14), ...data, createdAt: now() }
    this.t.cards.push(card)
    await this.save('cards')
    return card
  }

  async deleteCard(id: string) {
    await this.ready
    this.requireAdmin()
    this.t.cards = this.t.cards.filter((c) => c.id !== id)
    this.t.userCards = this.t.userCards.filter((c) => c.cardId !== id)
    await this.save('cards', 'userCards')
  }

  async listCases() {
    await this.ready
    return this.t.cases.filter((c) => c.active || this.isAdmin())
  }

  async saveCase(input: CaseInput, id?: string) {
    await this.ready
    this.requireAdmin()
    const data = { ...input, name: input.name.trim(), description: input.description.trim(), price: Math.max(0, input.price) }
    if (!data.name) throw new ApiError('Укажите название кейса')
    if (id) {
      const box = this.t.cases.find((c) => c.id === id)
      if (!box) throw new ApiError('Кейс не найден', 'not_found')
      Object.assign(box, data)
      await this.save('cases')
      return { ...box }
    }
    const box: CaseType = { id: shortId(14), ...data, createdAt: now() }
    this.t.cases.push(box)
    await this.save('cases')
    return box
  }

  async deleteCase(id: string) {
    await this.ready
    this.requireAdmin()
    this.t.cases = this.t.cases.filter((c) => c.id !== id)
    this.t.userCases = this.t.userCases.filter((c) => c.caseId !== id)
    await this.save('cases', 'userCases')
  }

  async listUserCards(userId: string) {
    await this.ready
    return this.t.userCards
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.obtainedAt.localeCompare(a.obtainedAt))
  }

  async getOwnedCards(ids: string[]) {
    await this.ready
    const set = new Set(ids)
    return this.t.userCards.filter((c) => set.has(c.id))
  }

  async listMyCases() {
    await this.ready
    return this.listCasesOf(this.requireUser().id)
  }

  async listCasesOf(userId: string) {
    await this.ready
    const me = this.requireUser()
    if (me.id !== userId && me.role !== 'admin') throw new ApiError('Недостаточно прав', 'forbidden')
    return this.t.userCases
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private weeklyCase() {
    return this.t.cases.filter((c) => c.weekly && c.active).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  }

  async weeklyStatus(): Promise<WeeklyStatus> {
    await this.ready
    const box = this.weeklyCase()
    const me = this.me()
    if (!box || !me) return { caseId: box?.id ?? null, availableAt: null }
    const last = this.t.userCases
      .filter((c) => c.userId === me.id && c.source === 'weekly')
      .reduce<string | null>((m, c) => (!m || c.createdAt > m ? c.createdAt : m), null)
    return { caseId: box.id, availableAt: nextWeekly(last) }
  }

  async claimWeeklyCase() {
    await this.ready
    const me = this.requireUser()
    const box = this.weeklyCase()
    if (!box) throw new ApiError('Еженедельный кейс пока не настроен')
    const status = await this.weeklyStatus()
    if (status.availableAt) {
      const when = new Date(status.availableAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      throw new ApiError(`Следующий бесплатный кейс будет доступен ${when}`)
    }
    const owned: OwnedCase = {
      id: shortId(14),
      userId: me.id,
      caseId: box.id,
      source: 'weekly',
      createdAt: now(),
      openedAt: null,
      cardId: null,
    }
    this.t.userCases.push(owned)
    await this.save('userCases')
    return owned
  }

  async openCase(ownedCaseId: string) {
    await this.ready
    const me = this.requireUser()
    const owned = this.t.userCases.find((c) => c.id === ownedCaseId && c.userId === me.id)
    if (!owned) throw new ApiError('Кейс не найден', 'not_found')
    if (owned.openedAt) throw new ApiError('Этот кейс уже открыт')
    const box = this.t.cases.find((c) => c.id === owned.caseId)
    const card = box ? rollCard(box, this.t.cards) : null
    if (!card) throw new ApiError('В этом кейсе пока нет карточек')
    const result: OwnedCard = { id: shortId(14), userId: me.id, cardId: card.id, source: 'case', obtainedAt: now() }
    this.t.userCards.push(result)
    owned.openedAt = now()
    owned.cardId = card.id
    await this.save('userCards', 'userCases')
    return result
  }

  async grantCase(userId: string, caseId: string, quantity: number) {
    await this.ready
    this.requireAdmin()
    if (quantity < 1 || quantity > 100) throw new ApiError('Можно выдать от 1 до 100 кейсов за раз')
    for (let i = 0; i < quantity; i++) {
      this.t.userCases.push({ id: shortId(14), userId, caseId, source: 'admin', createdAt: now(), openedAt: null, cardId: null })
    }
    await this.save('userCases')
  }

  async grantCard(userId: string, cardId: string) {
    await this.ready
    this.requireAdmin()
    this.t.userCards.push({ id: shortId(14), userId, cardId, source: 'admin', obtainedAt: now() })
    await this.save('userCards')
  }

  async removeUserCard(ownedCardId: string) {
    await this.ready
    this.requireAdmin()
    this.t.userCards = this.t.userCards.filter((c) => c.id !== ownedCardId)
    await this.save('userCards')
  }

  // ───────────────────────── Обмены ─────────────────────────

  async listTrades() {
    await this.ready
    const me = this.requireUser()
    return this.t.trades
      .filter((t) => t.fromUser === me.id || t.toUser === me.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private owns(userId: string, ids: string[]) {
    return ids.every((id) => this.t.userCards.some((c) => c.id === id && c.userId === userId))
  }

  async createTrade(input: TradeInput) {
    await this.ready
    const me = this.requireUser()
    if (input.toUser === me.id) throw new ApiError('Нельзя обменяться с самим собой')
    if (!input.offer.length && !input.request.length) throw new ApiError('Выберите хотя бы одну карточку')
    if (input.offer.length > 10 || input.request.length > 10) throw new ApiError('Не больше 10 карточек с каждой стороны')
    if (!this.owns(me.id, input.offer)) throw new ApiError('Часть ваших карточек уже не у вас')
    if (!this.owns(input.toUser, input.request)) throw new ApiError('Часть карточек собеседника уже не у него')
    const trade: Trade = {
      id: shortId(14),
      fromUser: me.id,
      toUser: input.toUser,
      offer: [...new Set(input.offer)],
      request: [...new Set(input.request)],
      message: (input.message ?? '').slice(0, 300),
      status: 'pending',
      createdAt: now(),
      resolvedAt: null,
    }
    this.t.trades.push(trade)
    await this.save('trades')
    return trade
  }

  async respondTrade(id: string, accept: boolean) {
    await this.ready
    const me = this.requireUser()
    const trade = this.t.trades.find((t) => t.id === id && t.toUser === me.id && t.status === 'pending')
    if (!trade) throw new ApiError('Предложение обмена не найдено или уже закрыто')
    trade.resolvedAt = now()
    if (!accept) {
      trade.status = 'declined'
      await this.save('trades')
      return
    }
    if (!this.owns(trade.fromUser, trade.offer) || !this.owns(trade.toUser, trade.request)) {
      trade.status = 'cancelled'
      await this.save('trades')
      throw new ApiError('Обмен невозможен: часть карточек уже сменила владельца')
    }
    for (const c of this.t.userCards) {
      if (trade.offer.includes(c.id)) Object.assign(c, { userId: trade.toUser, source: 'trade', obtainedAt: now() })
      else if (trade.request.includes(c.id)) Object.assign(c, { userId: trade.fromUser, source: 'trade', obtainedAt: now() })
    }
    trade.status = 'accepted'
    await this.save('trades', 'userCards')
  }

  async cancelTrade(id: string) {
    await this.ready
    const me = this.requireUser()
    const trade = this.t.trades.find((t) => t.id === id && t.fromUser === me.id && t.status === 'pending')
    if (!trade) return
    trade.status = 'cancelled'
    trade.resolvedAt = now()
    await this.save('trades')
  }

  // ───────────────────────── Покупки ─────────────────────────

  readonly paymentsEnabled = false

  async buyCase(_caseId: string, _quantity: number): Promise<{ purchaseId: string; payUrl: string }> {
    throw new ApiError('Покупка кейсов работает, когда сайт подключён к Supabase и размещён на Vercel')
  }

  async checkPurchases() {
    return 0
  }

  async listPurchases(): Promise<Purchase[]> {
    return []
  }

  // ───────────────────────── Админка: читатели ─────────────────────────

  async adminUpdateProfile(userId: string, patch: ProfilePatch) {
    await this.ready
    this.requireAdmin()
    const user = this.userById(userId)
    if (!user) throw new ApiError('Пользователь не найден', 'not_found')
    if (patch.username !== undefined) {
      const username = patch.username.trim()
      validateUsername(username)
      if (this.t.users.some((u) => u.id !== userId && u.username.toLowerCase() === username.toLowerCase())) {
        throw new ApiError('Этот никнейм уже занят', 'username_taken')
      }
      user.username = username
    }
    if (patch.displayName !== undefined) user.displayName = patch.displayName.trim().slice(0, 40)
    if (patch.bio !== undefined) user.bio = patch.bio.trim().slice(0, 280)
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl
    if (patch.aura !== undefined) user.aura = patch.aura
    if (patch.titleId !== undefined) user.titleId = patch.titleId
    await this.save('users')
    this.emitAuth()
    return toPublic(user)
  }

  async userReading(userId: string): Promise<ReadingSummary[]> {
    await this.ready
    this.requireAdmin()
    const byNovel = new Map<string, { count: number; last: string }>()
    for (const r of this.t.reads.filter((x) => x.userId === userId)) {
      const cur = byNovel.get(r.novelId) ?? { count: 0, last: r.readAt }
      byNovel.set(r.novelId, { count: cur.count + 1, last: r.readAt > cur.last ? r.readAt : cur.last })
    }
    return [...byNovel.entries()]
      .map(([novelId, v]) => ({
        novelId,
        chaptersRead: v.count,
        chaptersTotal: this.t.novels.find((n) => n.id === novelId)?.chaptersCount ?? 0,
        lastReadAt: v.last,
      }))
      .sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))
  }
}
