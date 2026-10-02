const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/** Транслитерация кириллицы в латиницу (упрощённая, для поиска и slug). */
export function transliterate(input: string): string {
  let out = ''
  for (const ch of input.toLowerCase()) {
    out += CYR_TO_LAT[ch] ?? ch
  }
  return out
}

/** «Библиотекарь последнего маяка» → «bibliotekar-poslednego-mayaka» */
export function slugify(input: string): string {
  return (
    transliterate(input)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'title'
  )
}

const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
const RU_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбюё'

const EN_TO_RU: Record<string, string> = {}
const RU_TO_EN: Record<string, string> = {}
for (let i = 0; i < EN_LAYOUT.length; i++) {
  EN_TO_RU[EN_LAYOUT[i]] = RU_LAYOUT[i]
  RU_TO_EN[RU_LAYOUT[i]] = EN_LAYOUT[i]
}

/** Исправляет текст, набранный не в той раскладке: «vfzr» → «маяк». */
export function switchLayout(input: string): string | null {
  const lower = input.toLowerCase()
  const latin = (lower.match(/[a-z[\];',.`]/g) || []).length
  const cyr = (lower.match(/[а-яё]/g) || []).length
  if (latin === 0 && cyr === 0) return null
  const map = latin >= cyr ? EN_TO_RU : RU_TO_EN
  let out = ''
  for (const ch of lower) out += map[ch] ?? ch
  return out === lower ? null : out
}
