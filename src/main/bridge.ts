// Мост Mihomo → Xray для серверов VLESS Reality / VLESS с шифрованием (без побочных эффектов, покрыто тестами).
//
// Новые серверы Xray (26.9+) лучше всего работают с официальным клиентом Xray. Поэтому такие серверы
// Tunnely передаёт процессу Xray: для каждого сервера Xray открывает локальный SOCKS-вход на 127.0.0.1
// (с паролем), а в конфигурации Mihomo сервер заменяется на socks5-прокси с тем же именем.
// Группы, режимы, исключения, статистика и проверка задержки остаются в Mihomo без изменений.

export const XRAY_PROCESS = 'tunnely-xray.exe'

type Proxy = Record<string, unknown>

/** Нужен ли серверу Xray: VLESS с Reality или с шифрованием VLESS (mlkem и т.п.) */
export function needsXray(p: Proxy): boolean {
  if (p.type !== 'vless') return false
  const enc = typeof p.encryption === 'string' ? p.encryption : ''
  return !!p['reality-opts'] || (enc !== '' && enc !== 'none')
}

function streamSettings(p: Proxy): Record<string, unknown> {
  const network = (p.network as string) || 'tcp'
  const s: Record<string, unknown> = { network: network === 'http' ? 'tcp' : network }
  const ro = p['reality-opts'] as Proxy | undefined
  const sni = (p.servername as string) || (p.sni as string) || ''
  const fp = (p['client-fingerprint'] as string) || 'chrome'
  if (ro) {
    s.security = 'reality'
    s.realitySettings = {
      serverName: sni,
      fingerprint: fp,
      publicKey: ro['public-key'],
      shortId: ro['short-id'] ?? '',
      spiderX: ro['spider-x'] ?? '',
      ...(ro['mldsa65-verify'] ? { mldsa65Verify: ro['mldsa65-verify'] } : {})
    }
  } else if (p.tls) {
    s.security = 'tls'
    s.tlsSettings = {
      serverName: sni,
      fingerprint: fp,
      allowInsecure: !!p['skip-cert-verify'],
      ...(Array.isArray(p.alpn) ? { alpn: p.alpn } : {})
    }
  }
  const ws = p['ws-opts'] as Proxy | undefined
  if (network === 'ws' && ws) {
    const headers = (ws.headers as Record<string, string>) ?? {}
    s.wsSettings = { path: ws.path ?? '/', ...(headers.Host ? { host: headers.Host } : {}) }
  }
  const grpc = p['grpc-opts'] as Proxy | undefined
  if (network === 'grpc') s.grpcSettings = { serviceName: grpc?.['grpc-service-name'] ?? '' }
  const xh = p['xhttp-opts'] as Proxy | undefined
  if (network === 'xhttp' && xh) s.xhttpSettings = { path: xh.path ?? '/', host: xh.host ?? '', mode: xh.mode ?? 'auto' }
  const h2 = p['h2-opts'] as Proxy | undefined
  if (network === 'h2' && h2) s.httpSettings = { path: h2.path ?? '/', host: h2.host ?? [] }
  return s
}

/** Исходящее подключение Xray для сервера VLESS из конфигурации Mihomo */
export function xrayOutbound(p: Proxy, tag: string): Record<string, unknown> {
  return {
    tag,
    protocol: 'vless',
    settings: {
      vnext: [
        {
          address: p.server,
          port: Number(p.port),
          users: [{ id: p.uuid, encryption: (p.encryption as string) || 'none', flow: (p.flow as string) || '' }]
        }
      ]
    },
    streamSettings: streamSettings(p)
  }
}

export interface BridgeResult {
  /** Конфигурация Mihomo, где серверы для Xray заменены на socks5-прокси */
  config: Record<string, unknown>
  /** Конфигурация Xray или null, если таких серверов нет */
  xray: Record<string, unknown> | null
  /** Адреса серверов, которые обслуживает Xray (в режиме TUN им нужен прямой выход, без петли) */
  servers: string[]
}

/**
 * @param ports свободные локальные порты: по одному на каждый сервер для Xray
 * @param user  логин/пароль для локальных SOCKS-входов
 */
export function bridgeToXray(cfg: Record<string, unknown>, ports: number[], user: { name: string; pass: string }): BridgeResult {
  const proxies = Array.isArray(cfg.proxies) ? (cfg.proxies as Proxy[]) : []
  const inbounds: Record<string, unknown>[] = []
  const outbounds: Record<string, unknown>[] = []
  const rules: Record<string, unknown>[] = []
  const servers: string[] = []
  let n = 0
  const newProxies = proxies.map(p => {
    if (!needsXray(p) || n >= ports.length) return p
    const port = ports[n]
    const tag = `p${n++}`
    inbounds.push({
      tag: `in-${tag}`,
      listen: '127.0.0.1',
      port,
      protocol: 'socks',
      settings: { auth: 'password', accounts: [{ user: user.name, pass: user.pass }], udp: true, ip: '127.0.0.1' }
    })
    outbounds.push(xrayOutbound(p, tag))
    rules.push({ type: 'field', inboundTag: [`in-${tag}`], outboundTag: tag })
    servers.push(String(p.server))
    return { name: p.name, type: 'socks5', server: '127.0.0.1', port, username: user.name, password: user.pass, udp: true }
  })
  if (!inbounds.length) return { config: cfg, xray: null, servers: [] }
  return {
    config: { ...cfg, proxies: newProxies },
    xray: {
      log: { loglevel: 'warning' },
      inbounds,
      outbounds: [...outbounds, { tag: 'block', protocol: 'blackhole' }],
      routing: { domainStrategy: 'AsIs', rules }
    },
    servers
  }
}

/** Сколько серверов в конфигурации пойдут через Xray */
export function countXrayProxies(cfg: Record<string, unknown>): number {
  return (Array.isArray(cfg.proxies) ? (cfg.proxies as Proxy[]) : []).filter(needsXray).length
}

/** Правила для TUN: исходящие подключения самого Xray к серверам — напрямую, иначе получится петля */
export function tunLoopGuardRules(servers: string[]): string[] {
  const rules = [`PROCESS-NAME,${XRAY_PROCESS},DIRECT`]
  for (const s of new Set(servers)) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) rules.push(`IP-CIDR,${s}/32,DIRECT,no-resolve`)
    else if (s.includes(':')) rules.push(`IP-CIDR6,${s}/128,DIRECT,no-resolve`)
    else rules.push(`DOMAIN,${s},DIRECT`)
  }
  return rules
}
