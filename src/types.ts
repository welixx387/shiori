export type Role = 'user' | 'admin'

export type NovelStatus = 'ongoing' | 'completed' | 'hiatus' | 'announced'

export type Shelf = 'reading' | 'planned' | 'completed' | 'onhold' | 'dropped'

export type CoverPattern =
  | 'seigaiha'
  | 'asanoha'
  | 'moon'
  | 'mountains'
  | 'stars'
  | 'rain'
  | 'sakura'
  | 'circuit'

/** Параметры сгенерированной обложки — используется, если картинка не загружена. */
export interface CoverStyle {
  palette: number
  pattern: CoverPattern
  kanji: string
}

export interface Novel {
  id: string
  slug: string
  title: string
  altTitles: string[]
  author: string
  illustrator: string
  description: string
  coverUrl: string | null
  coverStyle: CoverStyle
  genres: string[]
  tags: string[]
  status: NovelStatus
  country: string
  year: number | null
  ageRating: string
  featured: boolean
  published: boolean
  views: number
  ratingSum: number
  ratingCount: number
  chaptersCount: number
  libraryCount: number
  lastChapterAt: string | null
  createdAt: string
  updatedAt: string
}

export type NovelInput = Pick<
  Novel,
  | 'slug'
  | 'title'
  | 'altTitles'
  | 'author'
  | 'illustrator'
  | 'description'
  | 'coverUrl'
  | 'coverStyle'
  | 'genres'
  | 'tags'
  | 'status'
  | 'country'
  | 'year'
  | 'ageRating'
  | 'featured'
  | 'published'
>

export interface ChapterMeta {
  id: string
  novelId: string
  volume: number
  number: number
  title: string
  wordCount: number
  published: boolean
  createdAt: string
  updatedAt: string
}

export interface Chapter extends ChapterMeta {
  content: string
}

export interface ChapterInput {
  novelId: string
  volume: number
  number: number
  title: string
  content: string
  published: boolean
}

export interface Profile {
  id: string
  email: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string | null
  aura: string
  role: Role
  /** Титул, который показывается рядом с ником */
  titleId: string | null
  createdAt: string
}

export type ProfilePatch = Partial<Pick<Profile, 'username' | 'displayName' | 'bio' | 'avatarUrl' | 'aura' | 'titleId'>>

/** Профиль, который видят другие читатели (без email). */
export type PublicProfile = Omit<Profile, 'email'>

export interface LibraryEntry {
  novelId: string
  shelf: Shelf | null
  favorite: boolean
  updatedAt: string
}

export interface ProgressEntry {
  novelId: string
  chapterId: string
  position: number
  updatedAt: string
}

export interface ChapterRead {
  chapterId: string
  novelId: string
  words: number
  readAt: string
}

export interface RatingEntry {
  novelId: string
  score: number
  updatedAt: string
}

export interface Bookmark {
  id: string
  novelId: string
  chapterId: string
  paragraph: number
  excerpt: string
  note: string
  createdAt: string
}

export type BookmarkInput = Omit<Bookmark, 'id' | 'createdAt'>

/** Все личные данные читателя — грузятся одним запросом после входа. */
export interface UserData {
  library: LibraryEntry[]
  progress: ProgressEntry[]
  reads: ChapterRead[]
  ratings: RatingEntry[]
  bookmarks: Bookmark[]
}

export interface AdminUser {
  id: string
  username: string
  displayName: string
  email: string
  avatarUrl: string | null
  aura: string
  role: Role
  createdAt: string
}

// ───────────────────────── Сообщество ─────────────────────────

export type FriendStatus = 'none' | 'outgoing' | 'incoming' | 'friends'

export interface FriendEntry {
  profile: PublicProfile
  status: Exclude<FriendStatus, 'none'>
  since: string
}

export interface Comment {
  id: string
  novelId: string
  chapterId: string | null
  parentId: string | null
  userId: string
  body: string
  createdAt: string
  author: PublicProfile | null
}

export interface CommentInput {
  novelId: string
  chapterId?: string | null
  parentId?: string | null
  body: string
}

export interface Title {
  id: string
  name: string
  description: string
  tone: string
  novelId: string | null
  createdAt: string
}

export type TitleInput = Pick<Title, 'name' | 'description' | 'tone' | 'novelId'>

export interface UserTitle {
  userId: string
  titleId: string
  grantedAt: string
}

// ───────────────────────── Карточки и кейсы ─────────────────────────

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

/** Оформление карточки или кейса без картинки: палитра и иероглиф. */
export interface ArtStyle {
  palette: number
  kanji: string
}

export interface Card {
  id: string
  name: string
  description: string
  rarity: Rarity
  imageUrl: string | null
  style: ArtStyle
  novelId: string | null
  active: boolean
  createdAt: string
}

export type CardInput = Omit<Card, 'id' | 'createdAt'>

export interface CaseType {
  id: string
  name: string
  description: string
  /** 0 — кейс нельзя купить, только получить */
  price: number
  currency: string
  weights: Record<Rarity, number>
  novelId: string | null
  weekly: boolean
  active: boolean
  imageUrl: string | null
  style: ArtStyle
  createdAt: string
}

export type CaseInput = Omit<CaseType, 'id' | 'createdAt'>

export interface OwnedCase {
  id: string
  userId: string
  caseId: string
  source: 'weekly' | 'purchase' | 'admin'
  createdAt: string
  openedAt: string | null
  cardId: string | null
}

export interface OwnedCard {
  id: string
  userId: string
  cardId: string
  source: 'case' | 'admin' | 'trade'
  obtainedAt: string
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export interface Trade {
  id: string
  fromUser: string
  toUser: string
  /** id экземпляров карточек (OwnedCard), которые отдаёт инициатор */
  offer: string[]
  /** id экземпляров карточек, которые инициатор просит взамен */
  request: string[]
  message: string
  status: TradeStatus
  createdAt: string
  resolvedAt: string | null
}

export interface TradeInput {
  toUser: string
  offer: string[]
  request: string[]
  message?: string
}

export interface WeeklyStatus {
  /** Кейс, который выдаётся бесплатно; null — администратор его не настроил */
  caseId: string | null
  /** Когда можно забрать следующий; null — уже можно */
  availableAt: string | null
}

export interface Purchase {
  id: string
  caseId: string | null
  quantity: number
  amount: number
  currency: string
  payUrl: string | null
  status: 'active' | 'credited' | 'expired' | 'failed'
  createdAt: string
  creditedAt: string | null
}

export interface ReadingSummary {
  novelId: string
  chaptersRead: number
  chaptersTotal: number
  lastReadAt: string | null
}
