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
  PublicProfile,
  Purchase,
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

export type ImageKind = 'cover' | 'avatar' | 'card' | 'case'

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
  uploadImage(kind: ImageKind, file: Blob): Promise<string>
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

  // ── Читатели и друзья ──
  searchUsers(query: string): Promise<PublicProfile[]>
  getPublicProfile(username: string): Promise<PublicProfile | null>
  getProfileById(id: string): Promise<PublicProfile | null>
  /** Мои друзья, входящие и исходящие заявки */
  listFriends(): Promise<FriendEntry[]>
  sendFriendRequest(userId: string): Promise<FriendStatus>
  respondFriendRequest(userId: string, accept: boolean): Promise<void>
  /** Удалить из друзей, отменить свою заявку или отклонить чужую */
  removeFriend(userId: string): Promise<void>

  // ── Комментарии ──
  /** chapterId = null — обсуждение тайтла, иначе — комментарии к главе */
  listComments(novelId: string, chapterId: string | null): Promise<Comment[]>
  addComment(input: CommentInput): Promise<Comment>
  deleteComment(id: string): Promise<void>

  // ── Титулы ──
  listTitles(): Promise<Title[]>
  listUserTitles(userId: string): Promise<UserTitle[]>
  saveTitle(input: TitleInput, id?: string): Promise<Title>
  deleteTitle(id: string): Promise<void>
  grantTitle(userId: string, titleId: string): Promise<void>
  revokeTitle(userId: string, titleId: string): Promise<void>

  // ── Карточки и кейсы ──
  listCards(): Promise<Card[]>
  saveCard(input: CardInput, id?: string): Promise<Card>
  deleteCard(id: string): Promise<void>
  /** Активные кейсы; администратор видит и выключенные */
  listCases(): Promise<CaseType[]>
  saveCase(input: CaseInput, id?: string): Promise<CaseType>
  deleteCase(id: string): Promise<void>
  /** Коллекция любого читателя — она открыта всем */
  listUserCards(userId: string): Promise<OwnedCard[]>
  /** Экземпляры карточек по id — для показа обменов */
  getOwnedCards(ids: string[]): Promise<OwnedCard[]>
  /** Мои кейсы: закрытые и история открытых */
  listMyCases(): Promise<OwnedCase[]>
  weeklyStatus(): Promise<WeeklyStatus>
  claimWeeklyCase(): Promise<OwnedCase>
  openCase(ownedCaseId: string): Promise<OwnedCard>

  // ── Обмены ──
  listTrades(): Promise<Trade[]>
  createTrade(input: TradeInput): Promise<Trade>
  respondTrade(id: string, accept: boolean): Promise<void>
  cancelTrade(id: string): Promise<void>

  // ── Покупка кейсов (@CryptoBot, только облачный режим) ──
  readonly paymentsEnabled: boolean
  buyCase(caseId: string, quantity: number): Promise<{ purchaseId: string; payUrl: string }>
  /** Проверить неоплаченные счета и зачислить оплаченные; возвращает число новых кейсов */
  checkPurchases(): Promise<number>
  listPurchases(): Promise<Purchase[]>

  // ── Админка: читатели ──
  adminUpdateProfile(userId: string, patch: ProfilePatch): Promise<PublicProfile>
  userReading(userId: string): Promise<ReadingSummary[]>
  listCasesOf(userId: string): Promise<OwnedCase[]>
  grantCase(userId: string, caseId: string, quantity: number): Promise<void>
  grantCard(userId: string, cardId: string): Promise<void>
  removeUserCard(ownedCardId: string): Promise<void>
}
