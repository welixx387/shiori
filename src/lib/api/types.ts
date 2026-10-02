import type {
  AdminUser,
  Bookmark,
  BookmarkInput,
  Chapter,
  ChapterInput,
  ChapterMeta,
  ChapterRead,
  LibraryEntry,
  Novel,
  NovelInput,
  Profile,
  ProfilePatch,
  Role,
  Shelf,
  UserData,
} from '../../types'

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface SignUpInput {
  email: string
  password: string
  username: string
}

export interface SignUpResult {
  profile: Profile | null
  /** Сервер требует подтвердить email — пользователь войдёт после перехода по ссылке */
  needsConfirmation: boolean
}

export interface ListOptions {
  includeDrafts?: boolean
}

/**
 * Единый интерфейс данных сайта. Две реализации:
 *   • local — всё хранится в браузере (демо-режим, ничего настраивать не нужно);
 *   • cloud — Supabase: настоящие аккаунты, общий каталог для всех читателей.
 */
export interface Api {
  readonly mode: 'local' | 'cloud'

  // ── Аккаунт ──
  currentUser(): Promise<Profile | null>
  onAuthChange(cb: (profile: Profile | null) => void): () => void
  signUp(input: SignUpInput): Promise<SignUpResult>
  signIn(email: string, password: string): Promise<Profile>
  signOut(): Promise<void>
  updateProfile(patch: ProfilePatch): Promise<Profile>
  changePassword(current: string, next: string): Promise<void>
  changeEmail(email: string): Promise<{ needsConfirmation: boolean }>
  /** Письмо со ссылкой для сброса пароля (только облачный режим) */
  requestPasswordReset(email: string): Promise<void>
  /** Новый пароль после перехода по ссылке из письма */
  setNewPassword(password: string): Promise<void>
  isUsernameTaken(username: string): Promise<boolean>
  uploadImage(kind: 'cover' | 'avatar', file: Blob): Promise<string>
  deleteAccount(): Promise<void>
  /** Данные изменились в другой вкладке (только локальный режим) */
  onExternalChange?(cb: () => void): () => void

  // ── Каталог ──
  listNovels(opts?: ListOptions): Promise<Novel[]>
  getNovel(slugOrId: string, opts?: ListOptions): Promise<Novel | null>
  listChapters(novelId: string, opts?: ListOptions): Promise<ChapterMeta[]>
  getChapter(id: string): Promise<Chapter | null>
  latestChapters(limit: number): Promise<ChapterMeta[]>
  recordView(novelId: string): Promise<void>

  // ── Админка ──
  createNovel(input: NovelInput): Promise<Novel>
  updateNovel(id: string, patch: Partial<NovelInput>): Promise<Novel>
  deleteNovel(id: string): Promise<void>
  createChapter(input: ChapterInput): Promise<ChapterMeta>
  createChapters(inputs: ChapterInput[]): Promise<number>
  updateChapter(id: string, patch: Partial<ChapterInput>): Promise<ChapterMeta>
  deleteChapters(ids: string[]): Promise<void>
  listUsers(): Promise<AdminUser[]>
  setUserRole(userId: string, role: Role): Promise<void>
  importDemo(): Promise<number>

  // ── Личные данные читателя ──
  getUserData(): Promise<UserData>
  setLibrary(
    novelId: string,
    patch: { shelf?: Shelf | null; favorite?: boolean }
  ): Promise<LibraryEntry | null>
  saveProgress(entry: { novelId: string; chapterId: string; position: number }): Promise<void>
  markRead(entry: { novelId: string; chapterId: string; words: number }): Promise<ChapterRead | null>
  rate(novelId: string, score: number | null): Promise<void>
  addBookmark(input: BookmarkInput): Promise<Bookmark>
  updateBookmark(id: string, note: string): Promise<void>
  removeBookmark(id: string): Promise<void>
  clearHistory(): Promise<void>
}
