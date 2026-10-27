import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUserInput, parseSubscriptionBody, parseUserInfo, parseTitle, maskUrl, nameFromLinks, parseFilename } from '../src/main/parse.ts'
import { buildRuntimeConfig, linksBaseConfig, pickMainGroup, normalizeDomain, normalizeApp } from '../src/main/config.ts'
import { detectCountry, cleanName } from '../src/shared/country.ts'

const NOBYPASS = { ru: false, domains: [], apps: [] }
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
const opts = (mode: 'smart' | 'all', bypass = NOBYPASS) => ({ mixedPort: 1, controllerPort: 2, secret: 's', mode, tun: false, bypass })

test('умный режим: исключения идут напрямую раньше правил подписки', () => {
  const cfg = buildRuntimeConfig(SUB, opts('smart', { ru: true, domains: ['https://www.Example.com/path', 'сайт.рф'], apps: [String.raw`C:\Games\Game.exe`, 'telegram'] }))
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
  const cfg = buildRuntimeConfig(SUB, opts('all', { ru: true, domains: ['example.com'], apps: ['a.exe'] }))
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
