// Сборка итоговой конфигурации ядра Mihomo из профиля и настроек приложения. Без побочных эффектов — покрыто тестами.
import { domainToASCII } from 'node:url'
import type { ProxyMode } from '../shared/types'

export const TEST_URL = 'https://www.gstatic.com/generate_204'
export const MAIN_GROUP = 'PROXY'
export const AUTO_GROUP = 'Самый быстрый'
export const LINKS_PROVIDER = 'tunnely'

const LAN_RULES = [
  'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
  'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,169.254.0.0/16,DIRECT,no-resolve',
  'IP-CIDR6,fe80::/10,DIRECT,no-resolve',
  'DOMAIN-SUFFIX,local,DIRECT'
]

// Ключи, которыми управляет только приложение (из подписки они удаляются)
const APP_KEYS = [
  'port', 'socks-port', 'redir-port', 'tproxy-port', 'mixed-port', 'allow-lan', 'bind-address', 'lan-allowed-ips',
  'external-controller', 'external-controller-tls', 'external-controller-unix', 'external-controller-pipe',
  'external-controller-cors', 'external-ui', 'external-ui-url', 'external-ui-name', 'secret', 'authentication',
  'skip-auth-prefixes', 'tun', 'listeners', 'log-level', 'mode', 'profile', 'interface-name', 'routing-mark'
]

// Российские доменные зоны и популярные сервисы РФ на других доменах
export const RU_DOMAINS = [
  'ru', 'xn--p1ai', 'su', 'xn--d1acj3b', 'xn--80adxhks', 'xn--80asehdb', 'xn--c1avg', 'xn--p1acf',
  'yandex.com', 'yandex.net', 'yastatic.net', 'yandexcloud.net', 'ya.cc', 'vk.com', 'vk.me', 'vkuser.net', 'userapi.com', 'vk-cdn.net', 'vkuseraudio.net',
  'mail.ru', 'ok.ru', 'mycdn.me', 'odnoklassniki.ru', 'avito.st', 'wbbasket.ru', 'wb.ru', 'ozone.ru', 'ozonusercontent.com',
  'sberbank.com', 'tinkoff.com', 'tbank.com', 'alfabank.com', 'kaspersky.com', 'rutube.ru', 'dzen.ru', 'kinopoisk.ru', 'ivi.tv', 'okko.tv',
  'gosuslugi.ru', 'nalog.gov.ru', 'mos.ru', 'max.ru', 'oneme.ru'
]

export interface Bypass {
  ru: boolean
  domains: string[]
  apps: string[]
}

export interface RuntimeOptions {
  mixedPort: number
  controllerPort: number
  secret: string
  mode: ProxyMode
  tun: boolean
  bypass: Bypass
}

/** Приводит ввод пользователя к домену: «https://www.Сайт.рф/путь» → «xn--80aswg.xn--p1ai» */
export function normalizeDomain(input: string): string | undefined {
  let s = input.trim().toLowerCase()
  if (!s) return
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\*\.|^\.|^www\./, '')
  const ascii = domainToASCII(s)
  if (!ascii || !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(ascii)) return
  return ascii
}

/** Имя программы: «C:\Games\Game.exe» → «Game.exe» */
export function normalizeApp(input: string): string | undefined {
  const name = input.trim().split(/[\\/]/).pop()?.trim()
  if (!name || /[<>:"|?*]/.test(name)) return
  return /\.exe$/i.test(name) ? name : `${name}.exe`
}

function bypassRules(b: Bypass): string[] {
  const domains = new Set<string>()
  if (b.ru) RU_DOMAINS.forEach(d => domains.add(d))
  for (const d of b.domains) {
    const n = normalizeDomain(d)
    if (n) domains.add(n)
  }
  const rules = [...domains].map(d => `DOMAIN-SUFFIX,${d},DIRECT`)
  for (const a of b.apps) {
    const n = normalizeApp(a)
    if (n) rules.push(`PROCESS-NAME,${n},DIRECT`)
  }
  return rules
}

/** Главная группа выбора сервера в файле конфигурации */
export function mainGroupFromConfig(cfg: Record<string, unknown>): string {
  const groups = Array.isArray(cfg['proxy-groups']) ? (cfg['proxy-groups'] as { name: string; type: string }[]) : []
  return pickMainGroup(groups.map(g => ({ name: g.name, type: g.type === 'select' ? 'Selector' : g.type })))
}

/** Конфигурация для профиля из набора ключей (vless://…): ядро само разберёт ссылки из файла-провайдера */
export function linksBaseConfig(providerPath: string): Record<string, unknown> {
  return {
    'proxy-providers': {
      [LINKS_PROVIDER]: {
        type: 'file',
        path: providerPath,
        'health-check': { enable: true, url: TEST_URL, interval: 600, lazy: true }
      }
    },
    'proxy-groups': [
      { name: MAIN_GROUP, type: 'select', proxies: [AUTO_GROUP], use: [LINKS_PROVIDER] },
      { name: AUTO_GROUP, type: 'url-test', use: [LINKS_PROVIDER], url: TEST_URL, interval: 300, tolerance: 50, lazy: false }
    ],
    rules: [...LAN_RULES, `MATCH,${MAIN_GROUP}`]
  }
}

function defaultDns(): Record<string, unknown> {
  return {
    enable: true,
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': ['*.lan', '*.local', '+.msftconnecttest.com', '+.msftncsi.com', 'localhost.ptlogin2.qq.com', 'time.windows.com', '+.ntp.org'],
    'default-nameserver': ['1.1.1.1', '8.8.8.8'],
    nameserver: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
    'proxy-server-nameserver': ['https://1.1.1.1/dns-query', '8.8.8.8']
  }
}

/** Итоговая конфигурация: берём профиль, убираем всё, чем управляет приложение, и подставляем свои параметры */
export function buildRuntimeConfig(base: Record<string, unknown>, opt: RuntimeOptions): Record<string, unknown> {
  const cfg: Record<string, unknown> = structuredClone(base)
  for (const k of APP_KEYS) delete cfg[k]

  const dns = cfg.dns && typeof cfg.dns === 'object' ? (cfg.dns as Record<string, unknown>) : undefined
  if (dns && dns.enable !== false) {
    // Своё DNS-прослушивание не нужно: в режиме TUN DNS перехватывается через dns-hijack
    delete dns.listen
  } else {
    cfg.dns = defaultDns()
  }
  if (opt.tun) (cfg.dns as Record<string, unknown>).enable = true

  // Режимы: «умный» — исключения напрямую, затем правила подписки; «весь трафик» — всё через выбранный сервер
  const main = mainGroupFromConfig(cfg)
  const baseRules = Array.isArray(cfg.rules) && cfg.rules.length ? (cfg.rules as string[]) : [`MATCH,${main}`]
  cfg.rules = opt.mode === 'smart' ? [...LAN_RULES, ...bypassRules(opt.bypass), ...baseRules] : [...LAN_RULES, `MATCH,${main}`]
  const needProcess = opt.mode === 'smart' && opt.bypass.apps.length > 0

  return {
    ...cfg,
    'mixed-port': opt.mixedPort,
    'allow-lan': false,
    'bind-address': '127.0.0.1',
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'tcp-concurrent': true,
    'find-process-mode': needProcess ? 'strict' : 'off',
    'external-controller': `127.0.0.1:${opt.controllerPort}`,
    secret: opt.secret,
    profile: { 'store-selected': true, 'store-fake-ip': true },
    tun: {
      enable: opt.tun,
      stack: 'mixed',
      'auto-route': true,
      'auto-detect-interface': true,
      'strict-route': true,
      'dns-hijack': ['any:53']
    }
  }
}

/** Главная группа выбора сервера в профиле */
export function pickMainGroup(groups: { name: string; type: string }[]): string {
  const selectors = groups.filter(g => g.type === 'Selector' && g.name !== 'GLOBAL')
  const named = selectors.find(g => /^(proxy|proxies|🚀.*|выбор.*|select.*)$/i.test(g.name))
  return (named ?? selectors[0])?.name ?? 'GLOBAL'
}
