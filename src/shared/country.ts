// Определение страны сервера по его названию

const NAMES: Record<string, string> = {
  germany: 'de', германия: 'de', frankfurt: 'de', франкфурт: 'de', berlin: 'de', берлин: 'de',
  netherlands: 'nl', holland: 'nl', нидерланды: 'nl', голландия: 'nl', amsterdam: 'nl', амстердам: 'nl',
  finland: 'fi', финляндия: 'fi', helsinki: 'fi', хельсинки: 'fi',
  sweden: 'se', швеция: 'se', stockholm: 'se', стокгольм: 'se',
  poland: 'pl', польша: 'pl', warsaw: 'pl', варшава: 'pl',
  france: 'fr', франция: 'fr', paris: 'fr', париж: 'fr',
  'united kingdom': 'gb', britain: 'gb', england: 'gb', london: 'gb', великобритания: 'gb', англия: 'gb', лондон: 'gb',
  'united states': 'us', usa: 'us', america: 'us', сша: 'us', америка: 'us', 'new york': 'us',
  turkey: 'tr', turkiye: 'tr', турция: 'tr', istanbul: 'tr', стамбул: 'tr',
  japan: 'jp', япония: 'jp', tokyo: 'jp', токио: 'jp',
  russia: 'ru', россия: 'ru', moscow: 'ru', москва: 'ru',
  kazakhstan: 'kz', казахстан: 'kz', latvia: 'lv', латвия: 'lv', estonia: 'ee', эстония: 'ee',
  lithuania: 'lt', литва: 'lt', switzerland: 'ch', швейцария: 'ch', austria: 'at', австрия: 'at',
  singapore: 'sg', сингапур: 'sg', 'hong kong': 'hk', гонконг: 'hk', canada: 'ca', канада: 'ca',
  spain: 'es', испания: 'es', italy: 'it', италия: 'it', norway: 'no', норвегия: 'no',
  czech: 'cz', чехия: 'cz', romania: 'ro', румыния: 'ro', bulgaria: 'bg', болгария: 'bg',
  moldova: 'md', молдова: 'md', serbia: 'rs', сербия: 'rs', armenia: 'am', армения: 'am',
  georgia: 'ge', грузия: 'ge', uae: 'ae', оаэ: 'ae', dubai: 'ae', дубай: 'ae', india: 'in', индия: 'in',
  korea: 'kr', корея: 'kr', israel: 'il', израиль: 'il', ukraine: 'ua', украина: 'ua', belarus: 'by', беларусь: 'by'
}

/** Код страны из флага-эмодзи (🇩🇪 → de) */
function fromFlag(name: string): string | undefined {
  const m = name.match(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u)
  if (!m) return
  const a = m[1].codePointAt(0)! - 0x1f1e6
  const b = m[2].codePointAt(0)! - 0x1f1e6
  return (String.fromCharCode(97 + a) + String.fromCharCode(97 + b))
}

export function detectCountry(name: string): string | undefined {
  const flag = fromFlag(name)
  if (flag) return flag === 'uk' ? 'gb' : flag
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(NAMES)) {
    if (lower.includes(k)) return v
  }
  // Коды в начале названия: "DE-1", "[NL] Amsterdam"
  const code = name.match(/^\W*([A-Z]{2})(?![A-Za-z])/)
  if (code) {
    const c = code[1].toLowerCase()
    if (Object.values(NAMES).includes(c)) return c
  }
  return undefined
}

/** Название без флага-эмодзи и лишних пробелов */
export function cleanName(name: string): string {
  return name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').replace(/\s+/g, ' ').trim()
}
