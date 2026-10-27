// Разбор того, что вставил пользователь, и содержимого подписок. Без побочных эффектов — покрыто тестами.
import { load as yamlLoad } from 'js-yaml'
import type { UserInfo } from '../shared/types'

export const SHARE_SCHEMES = ['vless', 'vmess', 'trojan', 'ss', 'ssr', 'hysteria', 'hysteria2', 'hy2', 'tuic', 'wireguard', 'wg', 'socks', 'socks5', 'http', 'https', 'anytls', 'mieru']
const LINK_RE = new RegExp(`^(${SHARE_SCHEMES.filter(s => s !== 'http' && s !== 'https').join('|')})://`, 'i')

export type UserInput =
  | { kind: 'subscription'; url: string }
  | { kind: 'links'; links: string[] }
  | { kind: 'config'; config: Record<string, unknown> }

export type BodyContent =
  | { kind: 'config'; config: Record<string, unknown> }
  | { kind: 'links'; links: string[] }

function tryBase64(text: string): string | undefined {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return
  try {
    const decoded = Buffer.from(compact.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return decoded.includes('://') ? decoded : undefined
  } catch {
    return
  }
}

function extractLinks(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => LINK_RE.test(l))
}

function tryConfig(text: string): Record<string, unknown> | undefined {
  try {
    const doc = yamlLoad(text)
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      const o = doc as Record<string, unknown>
      if (Array.isArray(o.proxies) || (o['proxy-providers'] && typeof o['proxy-providers'] === 'object')) return o
    }
  } catch {
    /* не YAML */
  }
  return
}

/** Разбор текста, который пользователь вставил из буфера обмена или ввёл вручную */
export function parseUserInput(raw: string): UserInput {
  const text = raw.trim().replace(/^﻿/, '')
  if (!text) throw new Error('Пустой ключ')
  if (/^https?:\/\/\S+$/i.test(text)) {
    const url = new URL(text) // бросит ошибку, если адрес некорректный
    return { kind: 'subscription', url: url.toString() }
  }
  const links = extractLinks(text)
  if (links.length) return { kind: 'links', links }
  const decoded = tryBase64(text)
  if (decoded) {
    const l = extractLinks(decoded)
    if (l.length) return { kind: 'links', links: l }
  }
  const config = tryConfig(text)
  if (config) return { kind: 'config', config }
  throw new Error('Не удалось распознать ключ. Поддерживаются ссылки на подписку (https://…), ключи vless://, trojan://, ss://, vmess:// и др., а также файлы конфигурации Clash/Mihomo.')
}

/** Разбор ответа сервера подписки */
export function parseSubscriptionBody(body: string): BodyContent {
  const text = body.trim().replace(/^﻿/, '')
  const config = tryConfig(text)
  if (config) return { kind: 'config', config }
  const links = extractLinks(text)
  if (links.length) return { kind: 'links', links }
  const decoded = tryBase64(text)
  if (decoded) {
    const l = extractLinks(decoded)
    if (l.length) return { kind: 'links', links: l }
  }
  throw new Error('Сервер подписки вернул данные в неизвестном формате')
}

/** subscription-userinfo: upload=0; download=0; total=0; expire=0 */
export function parseUserInfo(header: string | null | undefined): UserInfo | undefined {
  if (!header) return
  const r: UserInfo = { upload: 0, download: 0, total: 0, expire: 0 }
  let found = false
  for (const part of header.split(';')) {
    const [k, v] = part.split('=').map(s => s.trim())
    if (k in r) {
      const n = Number(v)
      if (Number.isFinite(n)) {
        r[k as keyof UserInfo] = n
        found = true
      }
    }
  }
  return found ? r : undefined
}

/** profile-title может быть в виде "base64:…" */
export function parseTitle(header: string | null | undefined): string | undefined {
  if (!header) return
  const v = header.trim()
  if (v.toLowerCase().startsWith('base64:')) {
    try {
      return Buffer.from(v.slice(7), 'base64').toString('utf8').trim() || undefined
    } catch {
      return
    }
  }
  return v || undefined
}

/** filename из content-disposition (в т.ч. filename*=UTF-8''…) */
export function parseFilename(header: string | null | undefined): string | undefined {
  if (!header) return
  const star = header.match(/filename\*\s*=\s*[^']*''([^;]+)/i)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* пропускаем */
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i)
  return plain?.[1]?.trim()
}

/** Скрывает секретную часть адреса подписки для показа и журналов */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    const tail = (u.pathname + u.search).replace(/\/$/, '')
    const last = tail.slice(-4)
    return `${u.protocol}//${u.host}/…${last}`
  } catch {
    return '…'
  }
}

/** Разбор ссылки vless://… в сервер в формате Mihomo (нужен, чтобы передать серверы Reality в Xray) */
export function parseVlessLink(link: string): Record<string, unknown> | undefined {
  let u: URL
  try {
    u = new URL(link.trim())
  } catch {
    return
  }
  if (u.protocol !== 'vless:' || !u.username || !u.port) return
  const q = u.searchParams
  const get = (k: string) => q.get(k) ?? undefined
  let name = ''
  try {
    name = decodeURIComponent(u.hash.slice(1)).trim()
  } catch {
    name = u.hash.slice(1)
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const security = get('security') ?? 'none'
  const network = get('type') ?? 'tcp'
  const p: Record<string, unknown> = {
    name: name || `${host}:${u.port}`,
    type: 'vless',
    server: host,
    port: Number(u.port),
    uuid: decodeURIComponent(u.username),
    udp: true,
    network
  }
  if (get('flow')) p.flow = get('flow')
  if (get('encryption')) p.encryption = get('encryption')
  if (security === 'tls' || security === 'reality') {
    p.tls = true
    if (get('sni')) p.servername = get('sni')
    if (get('fp')) p['client-fingerprint'] = get('fp')
    if (get('alpn')) p.alpn = get('alpn')!.split(',')
    if (get('allowInsecure') === '1') p['skip-cert-verify'] = true
  }
  if (security === 'reality') {
    p['reality-opts'] = {
      'public-key': get('pbk'),
      'short-id': get('sid') ?? '',
      ...(get('spx') ? { 'spider-x': get('spx') } : {}),
      ...(get('pqv') ? { 'mldsa65-verify': get('pqv') } : {})
    }
  }
  if (network === 'ws') p['ws-opts'] = { path: get('path') ?? '/', ...(get('host') ? { headers: { Host: get('host') } } : {}) }
  if (network === 'grpc') p['grpc-opts'] = { 'grpc-service-name': get('serviceName') ?? '' }
  if (network === 'xhttp') p['xhttp-opts'] = { path: get('path') ?? '/', host: get('host') ?? '', mode: get('mode') ?? 'auto' }
  return p
}

/** Название профиля из ключей: из #имени первой ссылки */
export function nameFromLinks(links: string[]): string {
  const first = links[0]
  const hash = first.indexOf('#')
  if (hash >= 0) {
    try {
      const n = decodeURIComponent(first.slice(hash + 1)).trim()
      if (n) return links.length > 1 ? `${n} и ещё ${links.length - 1}` : n
    } catch {
      /* пропускаем */
    }
  }
  return links.length > 1 ? `Ключи (${links.length})` : 'Мой ключ'
}
