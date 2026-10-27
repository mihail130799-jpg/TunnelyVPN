// Локальное хранение настроек и профилей.
// Адреса подписок шифруются средствами Windows (DPAPI через safeStorage) и привязаны к учётной записи пользователя.
import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, UserInfo } from '../shared/types'
import { dataDir } from './paths'
import { log } from './logger'

export interface StoredProfile {
  id: string
  name: string
  kind: 'subscription' | 'links' | 'config'
  urlEnc?: string // зашифрованный адрес подписки (base64)
  maskedUrl?: string
  updatedAt: number
  userinfo?: UserInfo
  supportUrl?: string
  updateIntervalHours?: number
  serverCount: number
  lastError?: string
}

export interface ProxyBackup {
  enabled: boolean
  server: string
  bypass: string
}

export interface PersistedState {
  settings: Settings
  profiles: StoredProfile[]
  activeProfileId?: string
  /** Выбранный сервер для каждого профиля */
  selection: Record<string, string>
  /** Настройки прокси Windows до подключения. Если запись есть при старте — прошлый сеанс завершился аварийно */
  proxyBackup?: ProxyBackup
  /** PID запущенного ядра — чтобы завершить «зависшее» ядро после сбоя */
  corePid?: number
  wasConnected?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'smart',
  bypassRu: true,
  bypassDomains: [],
  bypassApps: [],
  connection: 'sysproxy',
  autostart: false,
  connectOnStart: false,
  startMinimized: false,
  autoReconnect: true,
  autoUpdateSubscriptions: true,
  closeToTray: true,
  language: 'ru'
}

function normalizeSettings(s: Settings): Settings {
  if (s.mode !== 'smart' && s.mode !== 'all') s.mode = 'smart'
  if (!Array.isArray(s.bypassDomains)) s.bypassDomains = []
  if (!Array.isArray(s.bypassApps)) s.bypassApps = []
  return s
}

const file = () => join(dataDir(), 'state.json')

function load(): PersistedState {
  const empty: PersistedState = { settings: { ...DEFAULT_SETTINGS }, profiles: [], selection: {} }
  try {
    if (!existsSync(file())) return empty
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<PersistedState>
    return {
      ...empty,
      ...raw,
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }),
      profiles: raw.profiles ?? [],
      selection: raw.selection ?? {}
    }
  } catch (e) {
    log.error(`Не удалось прочитать настройки: ${(e as Error).message}`)
    return empty
  }
}

export const store = {
  state: undefined as unknown as PersistedState,
  init() {
    this.state = load()
  },
  save() {
    const tmp = file() + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.state, null, 2))
    renameSync(tmp, file())
  },
  update(fn: (s: PersistedState) => void) {
    fn(this.state)
    this.save()
  }
}

export function encryptSecret(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(plain).toString('base64')
  return 'raw:' + Buffer.from(plain).toString('base64')
}

export function decryptSecret(value: string | undefined): string | undefined {
  if (!value) return
  if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
  if (value.startsWith('raw:')) return Buffer.from(value.slice(4), 'base64').toString('utf8')
  return
}
