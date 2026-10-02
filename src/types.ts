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
  createdAt: string
}

export type ProfilePatch = Partial<Pick<Profile, 'username' | 'displayName' | 'bio' | 'avatarUrl' | 'aura'>>

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
