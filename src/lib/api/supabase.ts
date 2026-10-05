import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
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
  CoverStyle,
  FriendEntry,
  FriendStatus,
  LibraryEntry,
  Novel,
  NovelInput,
  NovelStatus,
  OwnedCard,
  OwnedCase,
  Profile,
  ProfilePatch,
  PublicProfile,
  Purchase,
  Rarity,
  Role,
  Shelf,
  Title,
  TitleInput,
  Trade,
  TradeInput,
  UserData,
  WeeklyStatus,
} from '../../types'
import { shortId } from '../id'
import { slugify } from '../translit'
import { DEFAULT_WEIGHTS, nextWeekly } from '../collect'
import { ApiError, type Api, type ImageKind, type ListOptions, type SignUpInput, type SignUpResult } from './types'
import { validateEmail, validatePassword, validateUsername } from './validation'

/**
 * Облачный режим на Supabase. Схема БД, политики доступа (RLS) и триггеры —
 * в supabase/schema.sql. Права администратора проверяются на сервере,
 * поэтому подменить их из браузера нельзя.
 */

type Row = Record<string, any>

const NOVEL_COLUMNS =
  'id, slug, title, alt_titles, author, illustrator, description, cover_url, cover_style, genres, tags, status, country, year, age_rating, featured, published, views, rating_sum, rating_count, chapters_count, library_count, last_chapter_at, created_at, updated_at'

const CHAPTER_META_COLUMNS =
  'id, novel_id, volume, number, title, word_count, published, created_at, updated_at'

const DEFAULT_COVER: CoverStyle = { palette: 0, pattern: 'seigaiha', kanji: '夜' }

function toNovel(r: Row): Novel {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    altTitles: r.alt_titles ?? [],
    author: r.author ?? '',
    illustrator: r.illustrator ?? '',
    description: r.description ?? '',
    coverUrl: r.cover_url,
    coverStyle: { ...DEFAULT_COVER, ...(r.cover_style ?? {}) },
    genres: r.genres ?? [],
    tags: r.tags ?? [],
    status: (r.status ?? 'ongoing') as NovelStatus,
    country: r.country ?? '',
    year: r.year,
    ageRating: r.age_rating ?? '16+',
    featured: Boolean(r.featured),
    published: Boolean(r.published),
    views: Number(r.views ?? 0),
    ratingSum: Number(r.rating_sum ?? 0),
    ratingCount: Number(r.rating_count ?? 0),
    chaptersCount: Number(r.chapters_count ?? 0),
    libraryCount: Number(r.library_count ?? 0),
    lastChapterAt: r.last_chapter_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function fromNovelInput(input: Partial<NovelInput>): Row {
  const map: Record<string, string> = {
    slug: 'slug',
    title: 'title',
    altTitles: 'alt_titles',
    author: 'author',
    illustrator: 'illustrator',
    description: 'description',
    coverUrl: 'cover_url',
    coverStyle: 'cover_style',
    genres: 'genres',
    tags: 'tags',
    status: 'status',
    country: 'country',
    year: 'year',
    ageRating: 'age_rating',
    featured: 'featured',
    published: 'published',
  }
  const out: Row = {}
  for (const [k, v] of Object.entries(input)) if (map[k] && v !== undefined) out[map[k]] = v
  return out
}

function toChapterMeta(r: Row): ChapterMeta {
  return {
    id: r.id,
    novelId: r.novel_id,
    volume: Number(r.volume),
    number: Number(r.number),
    title: r.title ?? '',
    wordCount: Number(r.word_count ?? 0),
    published: Boolean(r.published),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function fromChapterInput(input: Partial<ChapterInput>): Row {
  const out: Row = {}
  if (input.novelId !== undefined) out.novel_id = input.novelId
  if (input.volume !== undefined) out.volume = input.volume
  if (input.number !== undefined) out.number = input.number
  if (input.title !== undefined) out.title = input.title.trim()
  if (input.content !== undefined) out.content = input.content
  if (input.published !== undefined) out.published = input.published
  return out
}

function toProfile(r: Row, user?: User | null): Profile {
  return {
    id: r.id,
    email: user?.email ?? r.email ?? '',
    username: r.username,
    displayName: r.display_name || r.username,
    bio: r.bio ?? '',
    avatarUrl: r.avatar_url,
    aura: r.aura ?? 'ember',
    role: (r.role ?? 'user') as Role,
    titleId: r.title_id ?? null,
    createdAt: r.created_at,
  }
}

const PROFILE_COLUMNS = 'id, username, display_name, bio, avatar_url, aura, role, title_id, created_at'
const COMMENT_COLUMNS = `id, novel_id, chapter_id, parent_id, user_id, body, created_at, author:profiles(${PROFILE_COLUMNS})`

function toPublicProfile(r: Row): PublicProfile {
  const { email: _e, ...rest } = toProfile(r)
  return rest
}

/** Поля профиля → строка таблицы profiles (с проверкой ника). */
function profileRow(patch: ProfilePatch): Row {
  const row: Row = {}
  if (patch.username !== undefined) {
    const username = patch.username.trim()
    validateUsername(username)
    row.username = username
  }
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim().slice(0, 40)
  if (patch.bio !== undefined) row.bio = patch.bio.trim().slice(0, 280)
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl
  if (patch.aura !== undefined) row.aura = patch.aura
  if (patch.titleId !== undefined) row.title_id = patch.titleId
  return row
}

function toComment(r: Row): Comment {
  return {
    id: r.id,
    novelId: r.novel_id,
    chapterId: r.chapter_id,
    parentId: r.parent_id,
    userId: r.user_id,
    body: r.body,
    createdAt: r.created_at,
    author: r.author ? toPublicProfile(r.author) : null,
  }
}

function toTitle(r: Row): Title {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    tone: r.tone ?? 'ember',
    novelId: r.novel_id,
    createdAt: r.created_at,
  }
}

function toCard(r: Row): Card {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    rarity: (r.rarity ?? 'common') as Rarity,
    imageUrl: r.image_url,
    style: { palette: 2, kanji: '札', ...(r.style ?? {}) },
    novelId: r.novel_id,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }
}

function toCase(r: Row): CaseType {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    price: Number(r.price ?? 0),
    currency: r.currency ?? 'USDT',
    weights: { ...DEFAULT_WEIGHTS, ...(r.weights ?? {}) },
    novelId: r.novel_id,
    weekly: Boolean(r.weekly),
    active: Boolean(r.active),
    imageUrl: r.image_url,
    style: { palette: 8, kanji: '運', ...(r.style ?? {}) },
    createdAt: r.created_at,
  }
}

function toOwnedCase(r: Row): OwnedCase {
  return {
    id: r.id,
    userId: r.user_id,
    caseId: r.case_id,
    source: r.source,
    createdAt: r.created_at,
    openedAt: r.opened_at,
    cardId: r.card_id,
  }
}

function toOwnedCard(r: Row): OwnedCard {
  return { id: r.id, userId: r.user_id, cardId: r.card_id, source: r.source, obtainedAt: r.obtained_at }
}

function toTrade(r: Row): Trade {
  return {
    id: r.id,
    fromUser: r.from_user,
    toUser: r.to_user,
    offer: r.offer ?? [],
    request: r.request ?? [],
    message: r.message ?? '',
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }
}

function toPurchase(r: Row): Purchase {
  return {
    id: r.id,
    caseId: r.case_id,
    quantity: Number(r.quantity ?? 1),
    amount: Number(r.amount ?? 0),
    currency: r.currency,
    payUrl: r.pay_url,
    status: r.status,
    createdAt: r.created_at,
    creditedAt: r.credited_at,
  }
}

const AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'Неверный email или пароль'],
  [/user already registered/i, 'Пользователь с таким email уже зарегистрирован'],
  [/email not confirmed/i, 'Email не подтверждён — проверьте почту и перейдите по ссылке'],
  [/password should be at least/i, 'Пароль должен быть не короче 6 символов'],
  [/unable to validate email|invalid format|email address .* is invalid/i, 'Некорректный email'],
  [/auth session missing|jwt expired/i, 'Сессия истекла — войдите заново'],
  [/should be different from the old/i, 'Новый пароль должен отличаться от старого'],
  [/rate limit|too many requests/i, 'Слишком много попыток — подождите минуту'],
  [/duplicate key.*username|profiles_username/i, 'Этот никнейм уже занят'],
  [/duplicate key.*slug/i, 'Тайтл с таким адресом (slug) уже есть'],
  [/row-level security|permission denied|not allowed/i, 'Недостаточно прав для этого действия'],
  [/failed to fetch|network/i, 'Нет связи с сервером. Проверьте интернет-соединение'],
  [/bucket not found/i, 'Хранилище картинок не настроено — выполните supabase/schema.sql'],
]

function fail(error: { message: string; code?: string } | null | undefined): never {
  const message = error?.message ?? 'Неизвестная ошибка'
  const match = AUTH_ERRORS.find(([re]) => re.test(message))
  throw new ApiError(match ? match[1] : message, error?.code)
}

export class SupabaseApi implements Api {
  readonly mode = 'cloud' as const
  private sb: SupabaseClient
  private user: User | null = null
  private profile: Profile | null = null
  private ready: Promise<void>
  private listeners = new Set<(p: Profile | null) => void>()

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    this.ready = this.sb.auth.getSession().then(async ({ data }) => {
      this.user = data.session?.user ?? null
      this.profile = this.user ? await this.fetchProfile(this.user) : null
    })
    this.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      const next = session?.user ?? null
      // Supabase вызывает обработчик внутри своей блокировки — запросы делаем после неё.
      setTimeout(async () => {
        const changedUser = next?.id !== this.user?.id
        this.user = next
        if (!next) this.profile = null
        else if (changedUser || event === 'USER_UPDATED') this.profile = await this.fetchProfile(next)
        this.emit()
      }, 0)
    })
  }

  private emit() {
    this.listeners.forEach((cb) => cb(this.profile))
  }

  private async fetchProfile(user: User): Promise<Profile | null> {
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (error) {
      console.error('profile', error)
      return null
    }
    return data ? toProfile(data, user) : null
  }

  private async requireUser(): Promise<User> {
    await this.ready
    if (!this.user) throw new ApiError('Войдите в аккаунт, чтобы продолжить', 'auth')
    return this.user
  }

  // ───────────────────────── Аккаунт ─────────────────────────

  async currentUser() {
    await this.ready
    return this.profile
  }

  onAuthChange(cb: (p: Profile | null) => void) {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const email = input.email.trim().toLowerCase()
    const username = input.username.trim()
    validateEmail(email)
    validatePassword(input.password)
    validateUsername(username)
    if (await this.isUsernameTaken(username)) throw new ApiError('Этот никнейм уже занят', 'username_taken')
    const { data, error } = await this.sb.auth.signUp({
      email,
      password: input.password,
      options: {
        data: { username },
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    if (error) fail(error)
    // Если email уже занят и включено подтверждение, Supabase возвращает «пустого» пользователя.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new ApiError('Пользователь с таким email уже зарегистрирован', 'email_taken')
    }
    if (!data.session || !data.user) return { profile: null, needsConfirmation: true }
    this.user = data.user
    this.profile = await this.fetchProfile(data.user)
    this.emit()
    return { profile: this.profile, needsConfirmation: false }
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) fail(error)
    this.user = data.user
    this.profile = await this.fetchProfile(data.user)
    if (!this.profile) {
      throw new ApiError('Профиль не найден. Убедитесь, что supabase/schema.sql выполнен целиком', 'no_profile')
    }
    this.emit()
    return this.profile
  }

  async signOut() {
    const { error } = await this.sb.auth.signOut()
    if (error) fail(error)
    this.user = null
    this.profile = null
    this.emit()
  }

  async updateProfile(patch: ProfilePatch) {
    const user = await this.requireUser()
    const row = profileRow(patch)
    const { data, error } = await this.sb.from('profiles').update(row).eq('id', user.id).select('*').single()
    if (error) fail(error)
    this.profile = toProfile(data, user)
    this.emit()
    return this.profile
  }

  async changePassword(current: string, next: string) {
    const user = await this.requireUser()
    validatePassword(next)
    const { error: reauth } = await this.sb.auth.signInWithPassword({ email: user.email!, password: current })
    if (reauth) throw new ApiError('Неверный текущий пароль', 'invalid_credentials')
    const { error } = await this.sb.auth.updateUser({ password: next })
    if (error) fail(error)
  }

  async changeEmail(email: string) {
    await this.requireUser()
    validateEmail(email.trim())
    const { error } = await this.sb.auth.updateUser({ email: email.trim().toLowerCase() })
    if (error) fail(error)
    return { needsConfirmation: true }
  }

  async requestPasswordReset(email: string) {
    validateEmail(email.trim())
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
    })
    if (error) fail(error)
  }

  async setNewPassword(password: string) {
    await this.requireUser()
    validatePassword(password)
    const { error } = await this.sb.auth.updateUser({ password })
    if (error) fail(error)
  }

  async isUsernameTaken(username: string) {
    await this.ready
    let query = this.sb.from('profiles').select('id').ilike('username', username.trim().replace(/[%_]/g, '\\$&'))
    if (this.user) query = query.neq('id', this.user.id)
    const { data, error } = await query.limit(1)
    if (error) return false
    return (data?.length ?? 0) > 0
  }

  async uploadImage(kind: ImageKind, file: Blob) {
    const user = await this.requireUser()
    // Картинки карточек и кейсов загружает администратор — в то же хранилище, что и обложки.
    const bucket = kind === 'avatar' ? 'avatars' : 'covers'
    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
    const folder = kind === 'card' ? 'cards/' : kind === 'case' ? 'cases/' : ''
    const path = kind === 'avatar' ? `${user.id}/${Date.now()}.${ext}` : `${folder}${Date.now()}-${shortId(8)}.${ext}`
    const { error } = await this.sb.storage.from(bucket).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) fail(error)
    return this.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }

  async deleteAccount() {
    await this.requireUser()
    const { error } = await this.sb.rpc('delete_my_account')
    if (error) fail(error)
    await this.sb.auth.signOut()
    this.user = null
    this.profile = null
    this.emit()
  }

  // ───────────────────────── Каталог ─────────────────────────

  async listNovels(opts?: ListOptions) {
    await this.ready
    let query = this.sb.from('novels').select(NOVEL_COLUMNS).order('created_at', { ascending: false })
    if (!opts?.includeDrafts || this.profile?.role !== 'admin') query = query.eq('published', true)
    const { data, error } = await query
    if (error) fail(error)
    return (data ?? []).map(toNovel)
  }

  async getNovel(slugOrId: string) {
    await this.ready
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
    const { data, error } = await this.sb
      .from('novels')
      .select(NOVEL_COLUMNS)
      .eq(isUuid ? 'id' : 'slug', slugOrId)
      .maybeSingle()
    if (error) fail(error)
    return data ? toNovel(data) : null
  }

  async listChapters(novelId: string, opts?: ListOptions) {
    await this.ready
    let query = this.sb
      .from('chapters')
      .select(CHAPTER_META_COLUMNS)
      .eq('novel_id', novelId)
      .order('volume')
      .order('number')
    if (!opts?.includeDrafts || this.profile?.role !== 'admin') query = query.eq('published', true)
    const { data, error } = await query
    if (error) fail(error)
    return (data ?? []).map(toChapterMeta)
  }

  async getChapter(id: string): Promise<Chapter | null> {
    await this.ready
    const { data, error } = await this.sb
      .from('chapters')
      .select(CHAPTER_META_COLUMNS + ', content')
      .eq('id', id)
      .maybeSingle()
    if (error) fail(error)
    if (!data) return null
    const row = data as Row
    return { ...toChapterMeta(row), content: row.content ?? '' }
  }

  async latestChapters(limit: number) {
    await this.ready
    const { data, error } = await this.sb
      .from('chapters')
      .select(CHAPTER_META_COLUMNS)
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error)
    return (data ?? []).map(toChapterMeta)
  }

  async recordView(novelId: string) {
    await this.sb.rpc('increment_views', { novel: novelId })
  }

  // ───────────────────────── Админка ─────────────────────────

  async createNovel(input: NovelInput) {
    await this.requireUser()
    const row = fromNovelInput({ ...input, slug: slugify(input.slug || input.title) })
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await this.sb.from('novels').insert(row).select(NOVEL_COLUMNS).single()
      if (!error) return toNovel(data)
      if (!/duplicate key.*slug/i.test(error.message)) fail(error)
      row.slug = `${slugify(input.slug || input.title)}-${attempt + 2}`
    }
    throw new ApiError('Не удалось подобрать свободный адрес (slug)')
  }

  async updateNovel(id: string, patch: Partial<NovelInput>) {
    await this.requireUser()
    const row = fromNovelInput(patch)
    if (row.slug !== undefined) row.slug = slugify(row.slug)
    const { data, error } = await this.sb.from('novels').update(row).eq('id', id).select(NOVEL_COLUMNS).single()
    if (error) fail(error)
    return toNovel(data)
  }

  async deleteNovel(id: string) {
    await this.requireUser()
    const { error } = await this.sb.from('novels').delete().eq('id', id)
    if (error) fail(error)
  }

  async createChapter(input: ChapterInput) {
    await this.requireUser()
    const { data, error } = await this.sb
      .from('chapters')
      .insert(fromChapterInput(input))
      .select(CHAPTER_META_COLUMNS)
      .single()
    if (error) fail(error)
    return toChapterMeta(data)
  }

  async createChapters(inputs: ChapterInput[]) {
    await this.requireUser()
    // Порциями, чтобы не упереться в лимит размера запроса.
    for (let i = 0; i < inputs.length; i += 25) {
      const { error } = await this.sb.from('chapters').insert(inputs.slice(i, i + 25).map(fromChapterInput))
      if (error) fail(error)
    }
    return inputs.length
  }

  async updateChapter(id: string, patch: Partial<ChapterInput>) {
    await this.requireUser()
    const { data, error } = await this.sb
      .from('chapters')
      .update(fromChapterInput(patch))
      .eq('id', id)
      .select(CHAPTER_META_COLUMNS)
      .single()
    if (error) fail(error)
    return toChapterMeta(data)
  }

  async deleteChapters(ids: string[]) {
    await this.requireUser()
    const { error } = await this.sb.from('chapters').delete().in('id', ids)
    if (error) fail(error)
  }

  async listUsers(): Promise<AdminUser[]> {
    await this.requireUser()
    const { data, error } = await this.sb.rpc('admin_list_users')
    if (error) fail(error)
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.username,
      email: r.email ?? '',
      avatarUrl: r.avatar_url,
      aura: r.aura ?? 'ember',
      role: r.role,
      createdAt: r.created_at,
    }))
  }

  async setUserRole(userId: string, role: Role) {
    await this.requireUser()
    const { error } = await this.sb.rpc('set_user_role', { target: userId, new_role: role })
    if (error) fail(error)
    if (userId === this.user?.id && this.user) {
      this.profile = await this.fetchProfile(this.user)
      this.emit()
    }
  }

  async importDemo() {
    await this.requireUser()
    const { STARTER_NOVELS } = await import('../seed')
    const { data: existing } = await this.sb.from('novels').select('slug')
    const slugs = new Set((existing ?? []).map((r: Row) => r.slug))
    let added = 0
    for (const starter of STARTER_NOVELS) {
      if (slugs.has(starter.novel.slug)) continue
      await this.createNovel(starter.novel)
      added++
    }
    return added
  }

  // ───────────────────────── Личные данные ─────────────────────────

  async getUserData(): Promise<UserData> {
    await this.ready
    if (!this.user) return { library: [], progress: [], reads: [], ratings: [], bookmarks: [] }
    const [library, progress, reads, ratings, bookmarks] = await Promise.all([
      this.sb.from('library').select('novel_id, shelf, favorite, updated_at'),
      this.sb.from('progress').select('novel_id, chapter_id, position, updated_at'),
      this.sb.from('chapter_reads').select('chapter_id, novel_id, words, read_at'),
      this.sb.from('ratings').select('novel_id, score, updated_at'),
      this.sb
        .from('bookmarks')
        .select('*')
        .order('created_at', { ascending: false }),
    ])
    for (const r of [library, progress, reads, ratings, bookmarks]) if (r.error) fail(r.error)
    return {
      library: (library.data ?? []).map((r: Row) => ({
        novelId: r.novel_id,
        shelf: r.shelf as Shelf | null,
        favorite: r.favorite,
        updatedAt: r.updated_at,
      })),
      progress: (progress.data ?? []).map((r: Row) => ({
        novelId: r.novel_id,
        chapterId: r.chapter_id,
        position: Number(r.position),
        updatedAt: r.updated_at,
      })),
      reads: (reads.data ?? []).map((r: Row) => ({
        chapterId: r.chapter_id,
        novelId: r.novel_id,
        words: r.words,
        readAt: r.read_at,
      })),
      ratings: (ratings.data ?? []).map((r: Row) => ({
        novelId: r.novel_id,
        score: r.score,
        updatedAt: r.updated_at,
      })),
      bookmarks: (bookmarks.data ?? []).map(
        (r: Row): Bookmark => ({
          id: r.id,
          novelId: r.novel_id,
          chapterId: r.chapter_id,
          paragraph: r.paragraph,
          charOffset: Number(r.char_offset ?? 0),
          excerpt: r.excerpt,
          note: r.note ?? '',
          createdAt: r.created_at,
        })
      ),
    }
  }

  async setLibrary(novelId: string, patch: { shelf?: Shelf | null; favorite?: boolean }) {
    const user = await this.requireUser()
    const { data: current } = await this.sb
      .from('library')
      .select('shelf, favorite')
      .eq('novel_id', novelId)
      .maybeSingle()
    const shelf = patch.shelf !== undefined ? patch.shelf : (current?.shelf ?? null)
    const favorite = patch.favorite !== undefined ? patch.favorite : (current?.favorite ?? false)
    if (!shelf && !favorite) {
      const { error } = await this.sb.from('library').delete().eq('novel_id', novelId).eq('user_id', user.id)
      if (error) fail(error)
      return null
    }
    const row = { user_id: user.id, novel_id: novelId, shelf, favorite, updated_at: new Date().toISOString() }
    const { error } = await this.sb.from('library').upsert(row)
    if (error) fail(error)
    return { novelId, shelf, favorite, updatedAt: row.updated_at } as LibraryEntry
  }

  async saveProgress(entry: { novelId: string; chapterId: string; position: number }) {
    await this.ready
    if (!this.user) return
    await this.sb.from('progress').upsert({
      user_id: this.user.id,
      novel_id: entry.novelId,
      chapter_id: entry.chapterId,
      position: entry.position,
      updated_at: new Date().toISOString(),
    })
  }

  async markRead(entry: { novelId: string; chapterId: string; words: number }): Promise<ChapterRead | null> {
    await this.ready
    if (!this.user) return null
    const row = {
      user_id: this.user.id,
      chapter_id: entry.chapterId,
      novel_id: entry.novelId,
      words: entry.words,
      read_at: new Date().toISOString(),
    }
    const { data, error } = await this.sb
      .from('chapter_reads')
      .upsert(row, { onConflict: 'user_id,chapter_id', ignoreDuplicates: true })
      .select('chapter_id')
    if (error) fail(error)
    if (!data?.length) return null
    return { chapterId: row.chapter_id, novelId: row.novel_id, words: row.words, readAt: row.read_at }
  }

  async rate(novelId: string, score: number | null) {
    const user = await this.requireUser()
    if (score === null) {
      const { error } = await this.sb.from('ratings').delete().eq('novel_id', novelId).eq('user_id', user.id)
      if (error) fail(error)
      return
    }
    const { error } = await this.sb.from('ratings').upsert({
      user_id: user.id,
      novel_id: novelId,
      score: Math.min(10, Math.max(1, Math.round(score))),
      updated_at: new Date().toISOString(),
    })
    if (error) fail(error)
  }

  async addBookmark(input: BookmarkInput) {
    const user = await this.requireUser()
    const row = {
      user_id: user.id,
      novel_id: input.novelId,
      chapter_id: input.chapterId,
      paragraph: input.paragraph,
      excerpt: input.excerpt,
      note: input.note,
    }
    const insert = (values: Row) => this.sb.from('bookmarks').insert(values).select('id, created_at').single()
    let { data, error } = await insert({ ...row, char_offset: Math.max(0, Math.round(input.charOffset ?? 0)) })
    // База ещё без колонки char_offset (schema.sql не обновлён) — сохраняем закладку с точностью до абзаца.
    if (error && (error.code === 'PGRST204' || /char_offset/.test(error.message))) {
      ;({ data, error } = await insert(row))
      if (!error) input = { ...input, charOffset: 0 }
    }
    if (error) fail(error)
    return { ...input, id: data!.id, createdAt: data!.created_at }
  }

  async updateBookmark(id: string, note: string) {
    await this.requireUser()
    const { error } = await this.sb.from('bookmarks').update({ note: note.slice(0, 500) }).eq('id', id)
    if (error) fail(error)
  }

  async removeBookmark(id: string) {
    await this.requireUser()
    const { error } = await this.sb.from('bookmarks').delete().eq('id', id)
    if (error) fail(error)
  }

  async clearHistory() {
    const user = await this.requireUser()
    const [a, b] = await Promise.all([
      this.sb.from('chapter_reads').delete().eq('user_id', user.id),
      this.sb.from('progress').delete().eq('user_id', user.id),
    ])
    if (a.error) fail(a.error)
    if (b.error) fail(b.error)
  }

  // ───────────────────────── Читатели и друзья ─────────────────────────

  async searchUsers(query: string) {
    await this.ready
    const q = query.trim()
    if (!q) return []
    const { data, error } = await this.sb.rpc('search_profiles', { q, lim: 30 })
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toPublicProfile)
  }

  async getPublicProfile(username: string) {
    await this.ready
    const { data, error } = await this.sb
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .ilike('username', username.trim().replace(/[\\%_]/g, '\\$&'))
      .maybeSingle()
    if (error) fail(error)
    return data ? toPublicProfile(data) : null
  }

  async getProfileById(id: string) {
    await this.ready
    const { data, error } = await this.sb.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()
    if (error) fail(error)
    return data ? toPublicProfile(data) : null
  }

  async listFriends(): Promise<FriendEntry[]> {
    const user = await this.requireUser()
    const { data, error } = await this.sb.from('friendships').select('requester, addressee, status, created_at')
    if (error) fail(error)
    const rows = (data ?? []) as Row[]
    const otherOf = (r: Row) => (r.requester === user.id ? r.addressee : r.requester)
    const ids = rows.map(otherOf)
    if (!ids.length) return []
    const { data: people, error: e2 } = await this.sb.from('profiles').select(PROFILE_COLUMNS).in('id', ids)
    if (e2) fail(e2)
    const byId = new Map(((people ?? []) as Row[]).map((p) => [p.id, toPublicProfile(p)]))
    return rows
      .filter((r) => byId.has(otherOf(r)))
      .map((r) => ({
        profile: byId.get(otherOf(r))!,
        status: r.status === 'accepted' ? 'friends' : r.requester === user.id ? 'outgoing' : 'incoming',
        since: r.created_at,
      }))
  }

  async sendFriendRequest(userId: string) {
    await this.requireUser()
    const { data, error } = await this.sb.rpc('send_friend_request', { target: userId })
    if (error) fail(error)
    return data as FriendStatus
  }

  async respondFriendRequest(userId: string, accept: boolean) {
    await this.requireUser()
    const { error } = await this.sb.rpc('respond_friend_request', { other: userId, accept })
    if (error) fail(error)
  }

  async removeFriend(userId: string) {
    await this.requireUser()
    const { error } = await this.sb.rpc('remove_friend', { other: userId })
    if (error) fail(error)
  }

  // ───────────────────────── Комментарии ─────────────────────────

  async listComments(novelId: string, chapterId: string | null) {
    await this.ready
    let query = this.sb.from('comments').select(COMMENT_COLUMNS).eq('novel_id', novelId)
    query = chapterId ? query.eq('chapter_id', chapterId) : query.is('chapter_id', null)
    const { data, error } = await query.order('created_at', { ascending: true }).limit(500)
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toComment)
  }

  async addComment(input: CommentInput) {
    await this.requireUser()
    const body = input.body.trim()
    if (!body) throw new ApiError('Напишите что-нибудь')
    if (body.length > 2000) throw new ApiError('Комментарий длиннее 2000 символов')
    const { data, error } = await this.sb
      .from('comments')
      .insert({ novel_id: input.novelId, chapter_id: input.chapterId ?? null, parent_id: input.parentId ?? null, body })
      .select(COMMENT_COLUMNS)
      .single()
    if (error) fail(error)
    return toComment(data)
  }

  async deleteComment(id: string) {
    await this.requireUser()
    const { error } = await this.sb.from('comments').delete().eq('id', id)
    if (error) fail(error)
  }

  // ───────────────────────── Титулы ─────────────────────────

  async listTitles() {
    await this.ready
    const { data, error } = await this.sb.from('titles').select('*').order('created_at')
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toTitle)
  }

  async listUserTitles(userId: string) {
    await this.ready
    const { data, error } = await this.sb.from('user_titles').select('*').eq('user_id', userId).order('granted_at')
    if (error) fail(error)
    return ((data ?? []) as Row[]).map((r) => ({ userId: r.user_id, titleId: r.title_id, grantedAt: r.granted_at }))
  }

  async saveTitle(input: TitleInput, id?: string) {
    await this.requireUser()
    const row = { name: input.name.trim(), description: input.description.trim(), tone: input.tone, novel_id: input.novelId }
    if (!row.name) throw new ApiError('Укажите название титула')
    const { data, error } = id
      ? await this.sb.from('titles').update(row).eq('id', id).select('*').single()
      : await this.sb.from('titles').insert(row).select('*').single()
    if (error) fail(error)
    return toTitle(data)
  }

  async deleteTitle(id: string) {
    await this.requireUser()
    const { error } = await this.sb.from('titles').delete().eq('id', id)
    if (error) fail(error)
  }

  async grantTitle(userId: string, titleId: string) {
    await this.requireUser()
    const { error } = await this.sb
      .from('user_titles')
      .upsert({ user_id: userId, title_id: titleId }, { onConflict: 'user_id,title_id', ignoreDuplicates: true })
    if (error) fail(error)
  }

  async revokeTitle(userId: string, titleId: string) {
    await this.requireUser()
    const { error } = await this.sb.from('user_titles').delete().eq('user_id', userId).eq('title_id', titleId)
    if (error) fail(error)
  }

  // ───────────────────────── Карточки и кейсы ─────────────────────────

  async listCards() {
    await this.ready
    const { data, error } = await this.sb.from('cards').select('*').order('created_at')
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toCard)
  }

  async saveCard(input: CardInput, id?: string) {
    await this.requireUser()
    const row = {
      name: input.name.trim(),
      description: input.description.trim(),
      rarity: input.rarity,
      image_url: input.imageUrl,
      style: input.style,
      novel_id: input.novelId,
      active: input.active,
    }
    if (!row.name) throw new ApiError('Укажите имя персонажа')
    const { data, error } = id
      ? await this.sb.from('cards').update(row).eq('id', id).select('*').single()
      : await this.sb.from('cards').insert(row).select('*').single()
    if (error) fail(error)
    return toCard(data)
  }

  async deleteCard(id: string) {
    await this.requireUser()
    const { error } = await this.sb.from('cards').delete().eq('id', id)
    if (error) fail(error)
  }

  async listCases() {
    await this.ready
    const { data, error } = await this.sb.from('cases').select('*').order('created_at')
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toCase)
  }

  async saveCase(input: CaseInput, id?: string) {
    await this.requireUser()
    const row = {
      name: input.name.trim(),
      description: input.description.trim(),
      price: Math.max(0, input.price),
      currency: input.currency,
      weights: input.weights,
      novel_id: input.novelId,
      weekly: input.weekly,
      active: input.active,
      image_url: input.imageUrl,
      style: input.style,
    }
    if (!row.name) throw new ApiError('Укажите название кейса')
    const { data, error } = id
      ? await this.sb.from('cases').update(row).eq('id', id).select('*').single()
      : await this.sb.from('cases').insert(row).select('*').single()
    if (error) fail(error)
    return toCase(data)
  }

  async deleteCase(id: string) {
    await this.requireUser()
    const { error } = await this.sb.from('cases').delete().eq('id', id)
    if (error) fail(error)
  }

  async listUserCards(userId: string) {
    await this.ready
    const { data, error } = await this.sb
      .from('user_cards')
      .select('*')
      .eq('user_id', userId)
      .order('obtained_at', { ascending: false })
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toOwnedCard)
  }

  async getOwnedCards(ids: string[]) {
    await this.ready
    if (!ids.length) return []
    const { data, error } = await this.sb.from('user_cards').select('*').in('id', ids)
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toOwnedCard)
  }

  async listMyCases() {
    const user = await this.requireUser()
    return this.listCasesOf(user.id)
  }

  async listCasesOf(userId: string) {
    await this.requireUser()
    const { data, error } = await this.sb
      .from('user_cases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toOwnedCase)
  }

  async weeklyStatus(): Promise<WeeklyStatus> {
    await this.ready
    const { data: box } = await this.sb
      .from('cases')
      .select('id')
      .eq('weekly', true)
      .eq('active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (!box || !this.user) return { caseId: box?.id ?? null, availableAt: null }
    const { data: last } = await this.sb
      .from('user_cases')
      .select('created_at')
      .eq('user_id', this.user.id)
      .eq('source', 'weekly')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { caseId: box.id, availableAt: nextWeekly(last?.created_at ?? null) }
  }

  async claimWeeklyCase() {
    await this.requireUser()
    const { data, error } = await this.sb.rpc('claim_weekly_case')
    if (error) fail(error)
    return toOwnedCase(data as Row)
  }

  async openCase(ownedCaseId: string) {
    await this.requireUser()
    const { data, error } = await this.sb.rpc('open_case', { p_id: ownedCaseId })
    if (error) fail(error)
    return toOwnedCard(data as Row)
  }

  async grantCase(userId: string, caseId: string, quantity: number) {
    await this.requireUser()
    const { error } = await this.sb.rpc('grant_case', { p_user: userId, p_case: caseId, p_quantity: quantity })
    if (error) fail(error)
  }

  async grantCard(userId: string, cardId: string) {
    await this.requireUser()
    const { error } = await this.sb.rpc('grant_card', { p_user: userId, p_card: cardId })
    if (error) fail(error)
  }

  async removeUserCard(ownedCardId: string) {
    await this.requireUser()
    const { error } = await this.sb.from('user_cards').delete().eq('id', ownedCardId)
    if (error) fail(error)
  }

  // ───────────────────────── Обмены ─────────────────────────

  async listTrades() {
    await this.requireUser()
    const { data, error } = await this.sb.from('trades').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toTrade)
  }

  async createTrade(input: TradeInput) {
    await this.requireUser()
    const { data, error } = await this.sb.rpc('create_trade', {
      p_to: input.toUser,
      p_offer: input.offer,
      p_request: input.request,
      p_message: input.message ?? '',
    })
    if (error) fail(error)
    return toTrade(data as Row)
  }

  async respondTrade(id: string, accept: boolean) {
    await this.requireUser()
    const { error } = await this.sb.rpc('respond_trade', { p_id: id, p_accept: accept })
    if (error) fail(error)
  }

  async cancelTrade(id: string) {
    await this.requireUser()
    const { error } = await this.sb.rpc('cancel_trade', { p_id: id })
    if (error) fail(error)
  }

  // ───────────────────────── Покупки ─────────────────────────

  readonly paymentsEnabled = true

  private async callPayments<T>(body: Record<string, unknown>): Promise<T> {
    await this.requireUser()
    const { data } = await this.sb.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new ApiError('Сессия истекла — войдите заново', 'auth')
    let res: Response
    try {
      res = await fetch(`${import.meta.env.BASE_URL}api/cryptobot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ApiError('Нет связи с сервером оплаты. Проверьте интернет-соединение')
    }
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    if (!res.ok || !json) {
      if (res.status === 404) throw new ApiError('Оплата ещё не настроена на сервере (нет функции /api/cryptobot)')
      throw new ApiError(json?.error || `Сервер оплаты ответил ошибкой ${res.status}`)
    }
    return json
  }

  async buyCase(caseId: string, quantity: number) {
    return this.callPayments<{ purchaseId: string; payUrl: string }>({ action: 'create', caseId, quantity })
  }

  async checkPurchases() {
    const res = await this.callPayments<{ credited: number }>({ action: 'check' })
    return res.credited ?? 0
  }

  async listPurchases() {
    await this.requireUser()
    const { data, error } = await this.sb.from('purchases').select('*').order('created_at', { ascending: false }).limit(50)
    if (error) fail(error)
    return ((data ?? []) as Row[]).map(toPurchase)
  }

  // ───────────────────────── Админка: читатели ─────────────────────────

  async adminUpdateProfile(userId: string, patch: ProfilePatch) {
    await this.requireUser()
    const row = profileRow(patch)
    const { data, error } = await this.sb.from('profiles').update(row).eq('id', userId).select(PROFILE_COLUMNS).single()
    if (error) fail(error)
    if (userId === this.user?.id && this.user) {
      this.profile = await this.fetchProfile(this.user)
      this.emit()
    }
    return toPublicProfile(data)
  }

  async userReading(userId: string) {
    await this.requireUser()
    const { data, error } = await this.sb.rpc('admin_user_reading', { p_user: userId })
    if (error) fail(error)
    return ((data ?? []) as Row[]).map((r) => ({
      novelId: r.novel_id,
      chaptersRead: Number(r.chapters_read ?? 0),
      chaptersTotal: Number(r.chapters_total ?? 0),
      lastReadAt: r.last_read_at,
    }))
  }
}
