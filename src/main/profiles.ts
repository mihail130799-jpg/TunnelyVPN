// Профили: подписки, наборы ключей и файлы конфигурации.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import type { ProfileInfo } from '../shared/types'
import { store, encryptSecret, decryptSecret, type StoredProfile } from './store'
import { profilesDir } from './paths'
import { log } from './logger'
import { linksBaseConfig } from './config'
import { parseUserInput, parseSubscriptionBody, parseUserInfo, parseTitle, parseFilename, maskUrl, nameFromLinks, parseVlessLink } from './parse'
import { needsXray } from './bridge'

const baseFile = (id: string) => join(profilesDir(), `${id}.yaml`)
const linksFile = (id: string) => join(profilesDir(), `${id}.links.txt`)

function userAgent() {
  // Панели (Marzban, Remnawave, 3x-ui и др.) по «clash.meta» отдают полную конфигурацию для Mihomo
  return `clash.meta (Tunnely/${app.getVersion()})`
}

async function download(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) throw new Error(`Сервер подписки ответил ошибкой ${res.status}`)
  const body = await res.text()
  const h = res.headers
  return {
    body,
    userinfo: parseUserInfo(h.get('subscription-userinfo')),
    title: parseTitle(h.get('profile-title')) ?? parseFilename(h.get('content-disposition')),
    supportUrl: h.get('support-url') ?? undefined,
    interval: Number(h.get('profile-update-interval')) || undefined
  }
}

function countServers(config: Record<string, unknown>, links?: string[]): number {
  if (links) return links.length
  return Array.isArray(config.proxies) ? config.proxies.length : 0
}

/** Записывает базовую конфигурацию профиля на диск (папка пользователя) */
function writeContent(id: string, content: { kind: 'config'; config: Record<string, unknown> } | { kind: 'links'; links: string[] }): number {
  if (content.kind === 'links') {
    // VLESS Reality разбираем сами (их обслуживает Xray), остальное оставляем ядру Mihomo
    const own: Record<string, unknown>[] = []
    const rest: string[] = []
    const used = new Set<string>()
    for (const l of content.links) {
      const p = parseVlessLink(l)
      if (p && needsXray(p)) {
        let name = String(p.name)
        for (let k = 2; used.has(name); k++) name = `${p.name} ${k}`
        used.add(name)
        own.push({ ...p, name })
      } else rest.push(l)
    }
    if (rest.length) writeFileSync(linksFile(id), rest.join('\n'))
    else rmSync(linksFile(id), { force: true })
    writeFileSync(baseFile(id), yamlDump(linksBaseConfig(rest.length ? `./profiles/${id}.links.txt` : undefined, own), { lineWidth: -1 }))
    return content.links.length
  }
  rmSync(linksFile(id), { force: true })
  writeFileSync(baseFile(id), yamlDump(content.config, { lineWidth: -1 }))
  return countServers(content.config)
}

export function loadBaseConfig(id: string): Record<string, unknown> {
  const f = baseFile(id)
  if (!existsSync(f)) throw new Error('Файл профиля не найден — обновите подписку или добавьте ключ заново')
  return yamlLoad(readFileSync(f, 'utf8')) as Record<string, unknown>
}

export function toInfo(p: StoredProfile): ProfileInfo {
  const { urlEnc: _u, ...rest } = p
  return rest
}

/** Добавление профиля из текста: адрес подписки, ключи или YAML */
export async function addProfile(raw: string, nameHint?: string): Promise<StoredProfile> {
  const input = parseUserInput(raw)
  const id = randomUUID()
  let profile: StoredProfile

  if (input.kind === 'subscription') {
    const existing = store.state.profiles.find(p => p.kind === 'subscription' && decryptSecret(p.urlEnc) === input.url)
    if (existing) {
      await updateProfile(existing.id)
      return existing
    }
    const d = await download(input.url)
    const content = parseSubscriptionBody(d.body)
    const count = writeContent(id, content)
    profile = {
      id,
      name: d.title ?? nameHint ?? new URL(input.url).hostname,
      kind: 'subscription',
      urlEnc: encryptSecret(input.url),
      maskedUrl: maskUrl(input.url),
      updatedAt: Date.now(),
      userinfo: d.userinfo,
      supportUrl: d.supportUrl,
      updateIntervalHours: d.interval,
      serverCount: count
    }
  } else if (input.kind === 'links') {
    const count = writeContent(id, input)
    profile = { id, name: nameHint ?? nameFromLinks(input.links), kind: 'links', updatedAt: Date.now(), serverCount: count }
  } else {
    const count = writeContent(id, input)
    profile = { id, name: nameHint ?? 'Конфигурация', kind: 'config', updatedAt: Date.now(), serverCount: count }
  }

  if (!profile.serverCount) {
    rmSync(baseFile(id), { force: true })
    rmSync(linksFile(id), { force: true })
    throw new Error('В ключе не найдено ни одного сервера')
  }

  store.update(s => {
    s.profiles.push(profile)
    if (!s.activeProfileId) s.activeProfileId = id
  })
  log.info(`Добавлен профиль «${profile.name}» (${profile.kind}, серверов: ${profile.serverCount})`)
  return profile
}

export async function updateProfile(id: string): Promise<StoredProfile> {
  const p = store.state.profiles.find(x => x.id === id)
  if (!p) throw new Error('Профиль не найден')
  if (p.kind !== 'subscription') return p
  const url = decryptSecret(p.urlEnc)
  if (!url) throw new Error('Не удалось прочитать адрес подписки')
  try {
    const d = await download(url)
    const content = parseSubscriptionBody(d.body)
    const count = writeContent(id, content)
    store.update(() => {
      p.updatedAt = Date.now()
      p.userinfo = d.userinfo ?? p.userinfo
      p.supportUrl = d.supportUrl ?? p.supportUrl
      p.updateIntervalHours = d.interval ?? p.updateIntervalHours
      p.serverCount = count
      if (d.title) p.name = d.title
      delete p.lastError
    })
    log.info(`Подписка «${p.name}» обновлена (серверов: ${count})`)
  } catch (e) {
    store.update(() => {
      p.lastError = (e as Error).message
    })
    throw e
  }
  return p
}

export function removeProfile(id: string) {
  rmSync(baseFile(id), { force: true })
  rmSync(linksFile(id), { force: true })
  store.update(s => {
    s.profiles = s.profiles.filter(p => p.id !== id)
    delete s.selection[id]
    if (s.activeProfileId === id) s.activeProfileId = s.profiles[0]?.id
  })
}

export function renameProfile(id: string, name: string) {
  const p = store.state.profiles.find(x => x.id === id)
  if (!p) return
  store.update(() => {
    p.name = name.trim().slice(0, 60) || p.name
  })
}

/** Профили, которые пора обновить */
export function dueSubscriptions(): StoredProfile[] {
  const now = Date.now()
  return store.state.profiles.filter(p => {
    if (p.kind !== 'subscription') return false
    const hours = Math.min(Math.max(p.updateIntervalHours ?? 12, 1), 72)
    return now - p.updatedAt > hours * 3600_000
  })
}
