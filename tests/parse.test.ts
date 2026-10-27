import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUserInput, parseSubscriptionBody, parseUserInfo, parseTitle, maskUrl, nameFromLinks, parseFilename } from '../src/main/parse.ts'
import { buildRuntimeConfig, linksBaseConfig, pickMainGroup, normalizeDomain, normalizeApp } from '../src/main/config.ts'
import { detectCountry, cleanName } from '../src/shared/country.ts'

const NOBYPASS = { ru: false, domains: [] as string[], apps: [] as string[], vpnDomains: [] as string[], vpnApps: [] as string[] }
const VLESS = 'vless://00000000-0000-0000-0000-000000000000@example.com:443?security=reality&type=tcp&flow=xtls-rprx-vision&sni=example.com&fp=firefox&pbk=AAAA&sid=01#%F0%9F%87%A9%F0%9F%87%AAFrankfurt%20Vless'

test('ссылка на подписку распознаётся', () => {
  const r = parseUserInput('  https://sub.example.com:8000/sub/abc.def  \n')
  assert.equal(r.kind, 'subscription')
})

test('одиночный ключ vless распознаётся', () => {
  const r = parseUserInput(VLESS)
  assert.equal(r.kind, 'links')
  if (r.kind === 'links') assert.equal(r.links.length, 1)
})

test('base64-подписка из ключей распознаётся', () => {
  const b64 = Buffer.from(`${VLESS}\ntrojan://pass@h.com:443#T\n`).toString('base64')
  const r = parseSubscriptionBody(b64)
  assert.equal(r.kind, 'links')
  if (r.kind === 'links') assert.equal(r.links.length, 2)
})

test('YAML-конфигурация распознаётся', () => {
  const r = parseSubscriptionBody('mode: rule\nproxies:\n  - {name: a, type: ss, server: x, port: 1, cipher: aes-128-gcm, password: p}\n')
  assert.equal(r.kind, 'config')
})

test('мусор даёт понятную ошибку', () => {
  assert.throws(() => parseUserInput('привет'), /Не удалось распознать/)
})

test('subscription-userinfo', () => {
  assert.deepEqual(parseUserInfo('upload=10; download=20; total=1073741824; expire=1790000000'), { upload: 10, download: 20, total: 1073741824, expire: 1790000000 })
  assert.equal(parseUserInfo(''), undefined)
})

test('profile-title в base64', () => {
  assert.equal(parseTitle('base64:4pymIFR1bm5lbHkgVlBOIOKcpg=='), '✦ Tunnely VPN ✦')
  assert.equal(parseTitle('Plain'), 'Plain')
})

test('content-disposition', () => {
  assert.equal(parseFilename(`attachment; filename*=UTF-8''%D0%9C%D0%BE%D0%B9`), 'Мой')
  assert.equal(parseFilename('attachment; filename="abc"'), 'abc')
})

test('адрес подписки скрывается', () => {
  const m = maskUrl('https://sub.example.com:8000/sub/SECRETTOKEN123456')
  assert.ok(!m.includes('SECRETTOKEN'))
  assert.ok(m.startsWith('https://sub.example.com:8000/'))
})

test('имя профиля из ключа', () => {
  assert.equal(nameFromLinks([VLESS]), '🇩🇪Frankfurt Vless')
})

test('страна по флагу и названию', () => {
  assert.equal(detectCountry('🇩🇪Frankfurt Vless'), 'de')
  assert.equal(detectCountry('Finland Vless'), 'fi')
  assert.equal(detectCountry('Нидерланды 1'), 'nl')
  assert.equal(detectCountry('NL-2 fast'), 'nl')
  assert.equal(detectCountry('Server 1'), undefined)
  assert.equal(cleanName('🇩🇪Frankfurt  Vless'), 'Frankfurt Vless')
})

test('итоговая конфигурация убирает чужие порты, контроллер и TUN', () => {
  const base = { mode: 'global', 'mixed-port': 7890, 'external-controller': '0.0.0.0:9090', secret: '', tun: { enable: true }, dns: { enable: true, listen: ':1053', nameserver: ['1.1.1.1'] }, proxies: [], rules: ['MATCH,PROXY'] }
  const cfg = buildRuntimeConfig(base, { mixedPort: 17890, controllerPort: 19090, secret: 's', mode: 'smart', tun: false, bypass: NOBYPASS })
  assert.equal(cfg['mixed-port'], 17890)
  assert.equal(cfg['external-controller'], '127.0.0.1:19090')
  assert.equal(cfg['allow-lan'], false)
  assert.equal(cfg.mode, 'rule')
  assert.equal((cfg.tun as { enable: boolean }).enable, false)
  assert.equal((cfg.dns as Record<string, unknown>).listen, undefined)
  assert.equal((cfg.rules as string[]).at(-1), 'MATCH,PROXY')
  // исходный объект не изменён
  assert.equal((base.dns as Record<string, unknown>).listen, ':1053')
})

test('в режиме TUN включается DNS', () => {
  const cfg = buildRuntimeConfig(linksBaseConfig('./p.txt'), { mixedPort: 1, controllerPort: 2, secret: 's', mode: 'smart', tun: true, bypass: NOBYPASS })
  assert.equal((cfg.tun as { enable: boolean }).enable, true)
  assert.equal((cfg.dns as { enable: boolean }).enable, true)
})

test('выбор главной группы', () => {
  assert.equal(pickMainGroup([{ name: 'GLOBAL', type: 'Selector' }, { name: 'Fastest', type: 'URLTest' }, { name: 'PROXY', type: 'Selector' }]), 'PROXY')
  assert.equal(pickMainGroup([{ name: 'GLOBAL', type: 'Selector' }]), 'GLOBAL')
})

const SUB = { 'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['a'] }], proxies: [], rules: ['DOMAIN,x.com,DIRECT', 'MATCH,PROXY'] }
const opts = (mode: 'smart' | 'all' | 'ru', bypass = NOBYPASS) => ({ mixedPort: 1, controllerPort: 2, secret: 's', mode, tun: false, bypass })

test('умный режим: исключения идут напрямую раньше правил подписки', () => {
  const cfg = buildRuntimeConfig(SUB, opts('smart', { ...NOBYPASS, ru: true, domains: ['https://www.Example.com/path', 'сайт.рф'], apps: [String.raw`C:\Games\Game.exe`, 'telegram'] }))
  const rules = cfg.rules as string[]
  assert.equal(cfg.mode, 'rule')
  assert.ok(rules.includes('DOMAIN-SUFFIX,ru,DIRECT'))
  assert.ok(rules.includes('DOMAIN-SUFFIX,example.com,DIRECT'))
  assert.ok(rules.includes('DOMAIN-SUFFIX,xn--80aswg.xn--p1ai,DIRECT'))
  assert.ok(rules.includes('PROCESS-NAME,Game.exe,DIRECT'))
  assert.ok(rules.includes('PROCESS-NAME,telegram.exe,DIRECT'))
  assert.ok(rules.indexOf('DOMAIN-SUFFIX,example.com,DIRECT') < rules.indexOf('DOMAIN,x.com,DIRECT'))
  assert.equal(rules.at(-1), 'MATCH,PROXY')
  assert.equal(cfg['find-process-mode'], 'strict')
})

test('режим «весь трафик»: никаких исключений, всё через сервер', () => {
  const cfg = buildRuntimeConfig(SUB, opts('all', { ...NOBYPASS, ru: true, domains: ['example.com'], apps: ['a.exe'], vpnApps: ['b.exe'] }))
  const rules = cfg.rules as string[]
  assert.ok(!rules.some(r => r.includes('example.com') || r.startsWith('PROCESS-NAME') || r === 'DOMAIN-SUFFIX,ru,DIRECT'))
  assert.equal(rules.at(-1), 'MATCH,PROXY')
  assert.equal(cfg['find-process-mode'], 'off')
})

test('нормализация доменов и программ', () => {
  assert.equal(normalizeDomain('HTTPS://www.Google.com:443/search?q=1'), 'google.com')
  assert.equal(normalizeDomain('*.vk.com'), 'vk.com')
  assert.equal(normalizeDomain('не домен!'), undefined)
  assert.equal(normalizeApp(String.raw`D:\Steam\steam.exe`), 'steam.exe')
  assert.equal(normalizeApp('discord'), 'discord.exe')
})

test('режим «только РФ через VPN»: российское и выбранное — через сервер, остальное напрямую', () => {
  const cfg = buildRuntimeConfig(SUB, opts('ru', { ...NOBYPASS, domains: ['skip.com'], vpnDomains: ['chatgpt.com'], vpnApps: ['SberBank.exe'] }))
  const rules = cfg.rules as string[]
  assert.ok(rules.includes('DOMAIN-SUFFIX,ru,PROXY'))
  assert.ok(rules.includes('DOMAIN-SUFFIX,gosuslugi.ru,PROXY'))
  assert.ok(rules.includes('DOMAIN-SUFFIX,chatgpt.com,PROXY'))
  assert.ok(rules.includes('PROCESS-NAME,SberBank.exe,PROXY'))
  assert.ok(!rules.some(r => r.includes('skip.com')), 'исключения умного режима здесь не действуют')
  assert.ok(!rules.includes('DOMAIN,x.com,DIRECT'), 'правила подписки в этом режиме не используются')
  assert.equal(rules.at(-1), 'MATCH,DIRECT')
  assert.equal(cfg['find-process-mode'], 'strict')
})

test('DNS через VPN из подписки: в режимах с прямым трафиком идёт напрямую, в «весь трафик» — как в подписке', () => {
  const sub = { ...SUB, dns: { enable: true, nameserver: ['https://1.1.1.1/dns-query#PROXY'], 'nameserver-policy': { '+.ru': '8.8.8.8#PROXY' } } }
  for (const mode of ['smart', 'ru'] as const) {
    const d = buildRuntimeConfig(sub, opts(mode)).dns as Record<string, unknown>
    assert.deepEqual(d.nameserver, ['https://1.1.1.1/dns-query'], mode)
    assert.equal(d['nameserver-policy'], undefined, mode)
  }
  const all = buildRuntimeConfig(sub, opts('all')).dns as Record<string, unknown>
  assert.deepEqual(all.nameserver, ['https://1.1.1.1/dns-query#PROXY'])
})

test('автовыбор получает запас времени на медленных каналах', () => {
  const sub = { ...SUB, 'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['F'] }, { name: 'F', type: 'url-test', proxies: ['a'] }] }
  const groups = buildRuntimeConfig(sub, opts('smart'))['proxy-groups'] as Record<string, unknown>[]
  assert.equal(groups[1].timeout, 10000)
})

// ---------- мост к Xray ----------
import { bridgeToXray, needsXray, tunLoopGuardRules } from '../src/main/bridge.ts'
import { parseVlessLink } from '../src/main/parse.ts'

const REALITY = { name: '🇷🇺 РАИСЯ ', type: 'vless', server: '1.2.3.4', port: 8443, uuid: 'u', flow: 'xtls-rprx-vision', encryption: 'mlkem768x25519plus.native.0rtt.K', tls: true, servername: 'site.com', 'client-fingerprint': 'firefox', 'reality-opts': { 'public-key': 'PBK', 'short-id': 'ab' }, network: 'tcp' }

test('VLESS Reality уходит в Xray, остальные серверы остаются у Mihomo', () => {
  const cfg = { proxies: [REALITY, { name: 'SS', type: 'ss', server: 'x', port: 1 }], 'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['🇷🇺 РАИСЯ ', 'SS'] }] }
  const r = bridgeToXray(cfg, [20001], { name: 'n', pass: 'p' })
  const ps = r.config.proxies as Record<string, unknown>[]
  assert.deepEqual(ps[0], { name: '🇷🇺 РАИСЯ ', type: 'socks5', server: '127.0.0.1', port: 20001, username: 'n', password: 'p', udp: true })
  assert.equal(ps[1].type, 'ss')
  const x = r.xray as { inbounds: { port: number; listen: string }[]; outbounds: { protocol: string; settings: { vnext: { address: string; users: { encryption: string; flow: string }[] }[] }; streamSettings: { security: string; realitySettings: Record<string, string> } }[] }
  assert.equal(x.inbounds[0].port, 20001)
  assert.equal(x.inbounds[0].listen, '127.0.0.1')
  const ob = x.outbounds[0]
  assert.equal(ob.settings.vnext[0].address, '1.2.3.4')
  assert.equal(ob.settings.vnext[0].users[0].encryption, 'mlkem768x25519plus.native.0rtt.K')
  assert.equal(ob.streamSettings.security, 'reality')
  assert.deepEqual([ob.streamSettings.realitySettings.fingerprint, ob.streamSettings.realitySettings.publicKey, ob.streamSettings.realitySettings.serverName], ['firefox', 'PBK', 'site.com'])
  assert.deepEqual(r.servers, ['1.2.3.4'])
})

test('без серверов Reality Xray не нужен', () => {
  const r = bridgeToXray({ proxies: [{ name: 'T', type: 'trojan', server: 'x', port: 1 }] }, [1], { name: 'n', pass: 'p' })
  assert.equal(r.xray, null)
  assert.equal(needsXray({ type: 'vless', encryption: 'none', tls: true }), false)
})

test('разбор ссылки vless:// с Reality', () => {
  const p = parseVlessLink('vless://uid@[2001:db8::1]:8443?encryption=mlkem768x25519plus.x&security=reality&type=tcp&flow=xtls-rprx-vision&sni=s.com&fp=firefox&pbk=PB&sid=01#%F0%9F%87%B7%F0%9F%87%BA%20RU')!
  assert.equal(p.server, '2001:db8::1')
  assert.equal(p.name, '🇷🇺 RU')
  assert.deepEqual(p['reality-opts'], { 'public-key': 'PB', 'short-id': '01' })
  assert.equal(needsXray(p), true)
})

test('защита от петли в TUN', () => {
  assert.deepEqual(tunLoopGuardRules(['1.2.3.4', 'host.com']), ['PROCESS-NAME,tunnely-xray.exe,DIRECT', 'IP-CIDR,1.2.3.4/32,DIRECT,no-resolve', 'DOMAIN,host.com,DIRECT'])
})
