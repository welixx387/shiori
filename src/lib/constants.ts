import {
  Biohazard,
  Brain,
  Castle,
  CircleCheck,
  CircleX,
  CalendarClock,
  Coffee,
  Compass,
  Drama,
  Flame,
  Gamepad2,
  Ghost,
  GraduationCap,
  Heart,
  HeartCrack,
  Hourglass,
  BookOpen,
  MoonStar,
  Mountain,
  Orbit,
  PartyPopper,
  Rocket,
  ScanSearch,
  Skull,
  Sparkles,
  Swords,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import type { CoverPattern, NovelStatus, Shelf } from '../types'

export const SITE = {
  name: import.meta.env.VITE_SITE_NAME || 'Shiori',
  kanji: '栞',
  tagline: 'Ранобэ, от которых не уснуть',
}

export interface GenreInfo {
  name: string
  icon: LucideIcon
  /** Оттенок плитки жанра, HSL hue */
  hue: number
}

export const GENRES: GenreInfo[] = [
  { name: 'Фэнтези', icon: Sparkles, hue: 268 },
  { name: 'Исекай', icon: Orbit, hue: 198 },
  { name: 'Романтика', icon: Heart, hue: 340 },
  { name: 'Комедия', icon: PartyPopper, hue: 42 },
  { name: 'Драма', icon: Drama, hue: 4 },
  { name: 'Приключения', icon: Compass, hue: 168 },
  { name: 'Повседневность', icon: Coffee, hue: 26 },
  { name: 'Школа', icon: GraduationCap, hue: 218 },
  { name: 'Мистика', icon: Ghost, hue: 248 },
  { name: 'Детектив', icon: ScanSearch, hue: 210 },
  { name: 'Ужасы', icon: Skull, hue: 352 },
  { name: 'Научная фантастика', icon: Rocket, hue: 186 },
  { name: 'Боевик', icon: Swords, hue: 18 },
  { name: 'Психология', icon: Brain, hue: 288 },
  { name: 'Сверхъестественное', icon: MoonStar, hue: 258 },
  { name: 'Магия', icon: WandSparkles, hue: 312 },
  { name: 'VRMMO', icon: Gamepad2, hue: 142 },
  { name: 'Гарем', icon: Users, hue: 326 },
  { name: 'Трагедия', icon: HeartCrack, hue: 356 },
  { name: 'Сёнэн', icon: Flame, hue: 14 },
  { name: 'Сэйнэн', icon: Mountain, hue: 200 },
  { name: 'Исторический', icon: Castle, hue: 34 },
  { name: 'Постапокалипсис', icon: Biohazard, hue: 82 },
]

export const GENRE_MAP: Record<string, GenreInfo> = Object.fromEntries(
  GENRES.map((g) => [g.name, g])
)

export function genreInfo(name: string): GenreInfo {
  return GENRE_MAP[name] ?? { name, icon: Sparkles, hue: 20 }
}

export const STATUSES: Record<NovelStatus, { label: string; tone: string; dot: string }> = {
  ongoing: { label: 'Выходит', tone: 'text-ok', dot: 'bg-ok' },
  completed: { label: 'Завершён', tone: 'text-accent-3', dot: 'bg-accent-3' },
  hiatus: { label: 'Заморожен', tone: 'text-warn', dot: 'bg-warn' },
  announced: { label: 'Анонс', tone: 'text-accent', dot: 'bg-accent' },
}

export const STATUS_ORDER: NovelStatus[] = ['ongoing', 'completed', 'hiatus', 'announced']

export const SHELVES: Record<Shelf, { label: string; icon: LucideIcon; tone: string; bg: string }> = {
  reading: { label: 'Читаю', icon: BookOpen, tone: 'text-accent', bg: 'bg-accent' },
  planned: { label: 'В планах', icon: CalendarClock, tone: 'text-accent-3', bg: 'bg-accent-3' },
  completed: { label: 'Прочитано', icon: CircleCheck, tone: 'text-ok', bg: 'bg-ok' },
  onhold: { label: 'Отложено', icon: Hourglass, tone: 'text-warn', bg: 'bg-warn' },
  dropped: { label: 'Брошено', icon: CircleX, tone: 'text-muted', bg: 'bg-muted' },
}

export const SHELF_ORDER: Shelf[] = ['reading', 'planned', 'completed', 'onhold', 'dropped']

export const COUNTRIES = ['Япония', 'Корея', 'Китай', 'Россия', 'Другое']

export const AGE_RATINGS = ['0+', '6+', '12+', '16+', '18+']

/** Палитры сгенерированных обложек: [тёмный, средний, светлый акцент]. */
export const COVER_PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: 'Уголёк', colors: ['#24091f', '#7a1f3d', '#ff6a4d'] },
  { name: 'Маяк', colors: ['#051c26', '#0f4c5c', '#f2a65a'] },
  { name: 'Фиалка', colors: ['#100a2a', '#3b2a87', '#b58cff'] },
  { name: 'Сакура', colors: ['#330d24', '#c2416b', '#ffc2d1'] },
  { name: 'Матча', colors: ['#0c2014', '#2f6b3f', '#d4e7a1'] },
  { name: 'Тушь', colors: ['#0b0b0f', '#2a2433', '#e8c37a'] },
  { name: 'Иней', colors: ['#0a1a30', '#2f6fa8', '#bfe9ff'] },
  { name: 'Янтарь', colors: ['#281204', '#a8451b', '#ffd36e'] },
  { name: 'Неон', colors: ['#0a0a1f', '#c21e72', '#29e3ff'] },
  { name: 'Ржавчина', colors: ['#2a1712', '#8c3b2c', '#f1dcc0'] },
  { name: 'Лагуна', colors: ['#04161a', '#0d6e6e', '#9ff2e3'] },
  { name: 'Гроза', colors: ['#170e20', '#5c2a6b', '#ff9e7a'] },
]

export const COVER_PATTERNS: { id: CoverPattern; label: string }[] = [
  { id: 'seigaiha', label: 'Волны' },
  { id: 'asanoha', label: 'Асаноха' },
  { id: 'moon', label: 'Луна' },
  { id: 'mountains', label: 'Горы' },
  { id: 'stars', label: 'Звёзды' },
  { id: 'rain', label: 'Дождь' },
  { id: 'sakura', label: 'Лепестки' },
  { id: 'circuit', label: 'Схема' },
]

export const COVER_KANJI = [
  '夜', '灯', '月', '星', '竜', '狐', '魔', '剣', '夢', '光', '風', '雨', '花', '海',
  '空', '雪', '火', '心', '時', '影', '鍵', '猫', '桜', '森', '嵐', '雷', '鬼', '神',
  '恋', '謎', '旅', '城', '魂', '刃', '翼', '声', '紙', '墨', '書', '茶', '忘', '道',
]

/** Ауры — градиенты баннера в личном кабинете. */
export const AURAS: { id: string; name: string; gradient: string; glow: string }[] = [
  {
    id: 'ember',
    name: 'Уголёк',
    gradient: 'linear-gradient(120deg, #ff5e52 0%, #ffb84d 45%, #9280ff 100%)',
    glow: '#ff5e52',
  },
  {
    id: 'ocean',
    name: 'Глубина',
    gradient: 'linear-gradient(120deg, #0f4c5c 0%, #1fa2a6 45%, #f2a65a 100%)',
    glow: '#1fa2a6',
  },
  {
    id: 'violet',
    name: 'Фиалка',
    gradient: 'linear-gradient(120deg, #3b2a87 0%, #8b5cf6 50%, #f472b6 100%)',
    glow: '#8b5cf6',
  },
  {
    id: 'sakura',
    name: 'Сакура',
    gradient: 'linear-gradient(120deg, #c2416b 0%, #ff8fab 50%, #ffd6a5 100%)',
    glow: '#ff8fab',
  },
  {
    id: 'matcha',
    name: 'Матча',
    gradient: 'linear-gradient(120deg, #2f6b3f 0%, #84cc16 50%, #fde68a 100%)',
    glow: '#84cc16',
  },
  {
    id: 'aurora',
    name: 'Полярное',
    gradient: 'linear-gradient(120deg, #0ea5e9 0%, #22d3ee 35%, #a78bfa 70%, #f0abfc 100%)',
    glow: '#22d3ee',
  },
  {
    id: 'ink',
    name: 'Тушь',
    gradient: 'linear-gradient(120deg, #18181b 0%, #3f3f46 50%, #e8c37a 100%)',
    glow: '#e8c37a',
  },
]

export function auraInfo(id: string) {
  return AURAS.find((a) => a.id === id) ?? AURAS[0]
}

/** Средняя скорость чтения художественного текста на русском, слов в минуту. */
export const WORDS_PER_MINUTE = 190
