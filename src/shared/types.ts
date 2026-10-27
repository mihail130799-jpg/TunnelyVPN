// Общие типы для основного процесса и интерфейса

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting'
/** smart — всё через VPN, кроме исключений; all — весь трафик через VPN */
export type ProxyMode = 'smart' | 'all'
export type ConnectionMethod = 'sysproxy' | 'tun'

export interface UserInfo {
  upload: number
  download: number
  total: number // 0 — без ограничения
  expire: number // unix-время в секундах, 0 — бессрочно
}

export interface ProfileInfo {
  id: string
  name: string
  kind: 'subscription' | 'links' | 'config'
  /** Адрес подписки, скрытый для показа: https://host/…abcd */
  maskedUrl?: string
  updatedAt: number
  userinfo?: UserInfo
  supportUrl?: string
  serverCount: number
  updateIntervalHours?: number
  lastError?: string
}

export interface ServerInfo {
  name: string
  type: string // vless, trojan, ss, URLTest, Selector…
  isGroup: boolean
  country?: string // ISO-код в нижнем регистре: de, nl…
  delay?: number | null // мс; 0/null — недоступен или не проверялся
}

export interface Settings {
  mode: ProxyMode
  /** Российские сайты и сервисы — напрямую (в «умном» режиме) */
  bypassRu: boolean
  /** Свои исключения: сайты (домены) и программы (имя .exe), которые работают в обход VPN */
  bypassDomains: string[]
  bypassApps: string[]
  connection: ConnectionMethod
  autostart: boolean
  connectOnStart: boolean
  startMinimized: boolean
  autoReconnect: boolean
  autoUpdateSubscriptions: boolean
  closeToTray: boolean
  language: 'ru'
}

export interface AppState {
  status: ConnStatus
  error?: string
  connectedAt?: number
  profiles: ProfileInfo[]
  activeProfileId?: string
  groupName?: string
  servers: ServerInfo[]
  selected?: string
  /** Сервер, через который реально идёт трафик (для групп «Авто» — выбранный ими) */
  effectiveServer?: string
  settings: Settings
  isAdmin: boolean
  appVersion: string
  coreVersion?: string
  coreRunning: boolean
  update?: { status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error' | 'disabled'; version?: string; progress?: number; message?: string }
}

export interface TrafficSample {
  up: number // байт/с
  down: number
  upTotal: number // байт за текущую сессию
  downTotal: number
  t: number
}

export interface ConnectionItem {
  id: string
  host: string
  network: string
  chain: string
  rule: string
  upload: number
  download: number
  start: string
}

export interface LogLine {
  t: number
  level: 'info' | 'warning' | 'error' | 'debug'
  source: 'core' | 'app'
  text: string
}

export interface ActionResult<T = unknown> {
  ok: boolean
  error?: string
  data?: T
}
