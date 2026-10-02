import type { NovelInput } from '../types'

/**
 * Стартовый каталог: карточки тайтлов без текста глав. Описания и обложки
 * (сгенерированные кодом) сделаны для этого проекта; главы администратор
 * загружает сам в «Админке» → тайтл → «Импорт и разбивка».
 * Карточки добавляются автоматически в локальном режиме и по кнопке
 * «Стартовые тайтлы» в админке.
 */

export interface StarterNovel {
  novel: NovelInput
  addedDaysAgo: number
}

export const STARTER_NOVELS: StarterNovel[] = [
  {
    novel: {
      slug: 'dobro-pozhalovat-v-klass-prevoskhodstva',
      title: 'Добро пожаловать в класс превосходства',
      altTitles: [
        'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e',
        'ようこそ実力至上主義の教室へ',
        'Classroom of the Elite',
        'Класс превосходства',
        'COTE',
      ],
      author: 'Сёго Кинугаса',
      illustrator: 'Сюнсаку Томосэ',
      description:
        'Старшая школа Кодо Икусэй — элитная государственная школа, выпускникам которой обещают любой университет и любую работу. Три года ученики живут в закрытом кампусе и каждый месяц получают баллы, на которые можно купить что угодно. Но щедрость оказывается проверкой: здесь всех оценивают по реальным способностям, и класс D, куда собрали самых неудобных учеников, быстро понимает, что оказался на самом дне.\n\nКиётака Аянокодзи старается не выделяться: пишет тесты ровно на средний балл, держится в стороне и ни во что не вмешивается. Но когда классы начинают борьбу за место наверху, становится ясно, что у тихого парня есть собственный расчёт.',
      coverUrl: null,
      coverStyle: { palette: 6, pattern: 'circuit', kanji: '実' },
      genres: ['Школа', 'Психология', 'Драма', 'Повседневность'],
      tags: ['элитная школа', 'интриги', 'экзамены', 'соперничество классов', 'стратегия', 'расчётливый герой'],
      status: 'completed',
      country: 'Япония',
      year: 2015,
      ageRating: '16+',
      featured: true,
      published: true,
    },
    addedDaysAgo: 2,
  },
  {
    novel: {
      slug: 'dobro-pozhalovat-v-klass-prevoskhodstva-2-god',
      title: 'Добро пожаловать в класс превосходства: 2-й год',
      altTitles: [
        'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e: 2-nensei-hen',
        'ようこそ実力至上主義の教室へ 2年生編',
        'Classroom of the Elite: Year 2',
        'Класс превосходства 2',
        'COTE 2',
      ],
      author: 'Сёго Кинугаса',
      illustrator: 'Сюнсаку Томосэ',
      description:
        'Второй год в школе Кодо Икусэй. Класс Аянокодзи поднялся выше, чем от него кто-либо ждал, но правила становятся жёстче: в школу приходят первогодки, особые экзамены всё чаще грозят исключением, а среди новичков может оказаться тот, кого прислали специально за Киётакой.\n\nПродолжение «Добро пожаловать в класс превосходства» — новые союзы, новые соперники и игра, в которой на кону уже не баллы класса, а место в школе.',
      coverUrl: null,
      coverStyle: { palette: 11, pattern: 'asanoha', kanji: '策' },
      genres: ['Школа', 'Психология', 'Драма', 'Повседневность'],
      tags: ['элитная школа', 'интриги', 'экзамены', 'соперничество классов', 'стратегия', 'первогодки'],
      status: 'completed',
      country: 'Япония',
      year: 2020,
      ageRating: '16+',
      featured: true,
      published: true,
    },
    addedDaysAgo: 1,
  },
]

/** Адреса прежних демо-тайтлов: убираем их из каталога, который уже сохранён в браузере. */
export const RETIRED_DEMO_SLUGS = [
  'bibliotekar-poslednego-mayaka',
  'prognoz-na-zavtra-mestami-drakony',
  'gorod-kotoryy-zabyvaet-po-nocham',
  'sto-pervyy-ponedelnik',
  'pochtalon-dalnih-orbit',
  'sdayotsya-komnata-yokayam-ne-bespokoit',
  'teorema-nevozmozhnoy-magii',
  'gildiya-pensionnyy-fond',
  'klinok-davshiy-obet-molchaniya',
]
