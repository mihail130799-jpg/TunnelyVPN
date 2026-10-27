export function formatBytes(n: number): { value: string; unit: string } {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return { value: v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1), unit: units[i] }
}

export const bytesText = (n: number) => {
  const b = formatBytes(n)
  return `${b.value} ${b.unit}`
}

/** байт/с → Мбит/с */
export function mbps(bytesPerSec: number): number {
  return (bytesPerSec * 8) / 1_000_000
}

export function speedText(bytesPerSec: number): { value: string; unit: string } {
  const m = mbps(bytesPerSec)
  if (m < 1) return { value: ((bytesPerSec * 8) / 1000).toFixed(0), unit: 'Кбит/с' }
  return { value: m >= 100 ? m.toFixed(0) : m.toFixed(1), unit: 'Мбит/с' }
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
}

export function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч назад`
  return new Date(t).toLocaleDateString('ru-RU')
}

const regionNames = new Intl.DisplayNames(['ru'], { type: 'region' })
export function countryName(code?: string): string | undefined {
  if (!code) return
  try {
    return regionNames.of(code.toUpperCase())
  } catch {
    return
  }
}

export function protoLabel(type: string): string {
  const map: Record<string, string> = {
    Vless: 'VLESS', VlessReality: 'VLESS · Reality', Vmess: 'VMess', Trojan: 'Trojan', Shadowsocks: 'Shadowsocks', ShadowsocksR: 'ShadowsocksR',
    Hysteria: 'Hysteria', Hysteria2: 'Hysteria2', Tuic: 'TUIC', WireGuard: 'WireGuard', Socks5: 'SOCKS5', Http: 'HTTP',
    AnyTLS: 'AnyTLS', URLTest: 'Автовыбор', Selector: 'Группа', Fallback: 'Резерв', LoadBalance: 'Балансировка'
  }
  return map[type] ?? type
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
