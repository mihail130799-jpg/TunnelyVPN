// Сквозная проверка настоящего подключения.
// Запуск: TUNNELY_TEST_KEY=<ключ или ссылка на подписку> node tests/e2e.mjs [путь к Tunnely.exe]
// Ключ берётся только из переменной окружения и никуда не записывается.
import { _electron as electron } from 'playwright-core'
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEY = process.env.TUNNELY_TEST_KEY
if (!KEY) throw new Error('Задайте TUNNELY_TEST_KEY')
const exe = process.argv[2]
const helper = exe ? join(dirname(exe), 'resources', 'app-resources', 'core', 'tunnely-helper.exe') : join(root, 'resources', 'core', 'tunnely-helper.exe')
const shots = process.env.TUNNELY_SHOTS || join(root, 'test-results')
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'tunnely-e2e-'))

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✖'} ${name}${extra ? ` — ${extra}` : ''}`)
}
const sysProxy = () => JSON.parse(execFileSync(helper, ['proxy', 'json']).toString())
const coreProcs = () => execSync('tasklist /FI "IMAGENAME eq mihomo.exe" /FO CSV /NH').toString().split('\n').filter(l => l.includes('mihomo.exe')).length
const trace = (proxy) => {
  const args = ['-s', '-m', '20', 'https://www.cloudflare.com/cdn-cgi/trace']
  if (proxy) args.unshift('-x', proxy)
  let out = ''
  try {
    out = execFileSync('curl.exe', args).toString()
  } catch {
    return {}
  }
  return { ip: out.match(/ip=(.*)/)?.[1], loc: out.match(/loc=(.*)/)?.[1] }
}

const before = sysProxy()
const coresBefore = coreProcs()
const direct = trace()
console.log(`Прямое подключение: страна ${direct.loc}`)

const app = await electron.launch({
  executablePath: exe,
  args: exe ? [] : [root],
  env: { ...process.env, TUNNELY_USER_DATA: userData }
})
const win = await app.firstWindow()
await win.setViewportSize({ width: 1080, height: 720 }).catch(() => {})
await win.waitForTimeout(1800)
await win.screenshot({ path: join(shots, '1-empty.png') })

const st = () => win.evaluate(() => window.tunnely.state())
const waitFor = async (fn, ms = 30000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await st()
    if (fn(s)) return s
    await win.waitForTimeout(300)
  }
  return st()
}

try {
  const add = await win.evaluate(k => window.tunnely.addText(k), KEY)
  check('Ключ добавлен', add.ok, add.ok ? `${add.data.name}, серверов: ${add.data.serverCount}` : add.error)

  let s = await waitFor(x => x.servers.length > 0)
  check('Список серверов получен', s.servers.length > 0, s.servers.map(x => x.name).join(', '))
  check('Ядро запущено', s.coreRunning, s.coreVersion)

  const delays = await win.evaluate(() => window.tunnely.testDelays())
  s = await st()
  check('Проверка задержки', delays.ok && s.servers.some(x => x.delay > 0), s.servers.map(x => `${x.name}: ${x.delay ?? '—'}`).join(', '))

  const conn = await win.evaluate(() => window.tunnely.connect())
  s = await waitFor(x => x.status === 'connected')
  check('Подключение', conn.ok && s.status === 'connected', conn.error ?? '')
  const p = sysProxy()
  check('Системный прокси включён', p.enabled && p.server.startsWith('127.0.0.1:'), p.server)

  const via = trace(`http://${p.server}`)
  check('Трафик идёт через VPN', !!via.ip && via.ip !== direct.ip, `страна ${via.loc}`)
  await win.waitForTimeout(2500)
  await win.screenshot({ path: join(shots, '2-connected.png') })

  const other = s.servers.find(x => !x.isGroup && x.name !== s.effectiveServer)
  if (other) {
    const sel = await win.evaluate(n => window.tunnely.selectServer(n), other.name)
    const via2 = trace(`http://${p.server}`)
    check('Смена сервера', sel.ok && !!via2.ip && via2.ip !== via.ip, `${other.name}: страна ${via2.loc}`)
  }

  // Режимы: в умном режиме российский сайт идёт напрямую, в режиме «весь трафик» — через VPN
  const routeOf = async host => {
    try {
      execFileSync('curl.exe', ['-s', '-m', '15', '-o', 'NUL', '-x', `http://${p.server}`, `https://${host}/`])
    } catch {
      /* важен только маршрут */
    }
    const c = await win.evaluate(() => window.tunnely.connections())
    return c.data?.find(x => x.host.startsWith(host))?.chain
  }
  const ruSmart = await routeOf('ya.ru')
  check('Умный режим: ya.ru напрямую', ruSmart === 'DIRECT', ruSmart)
  await win.evaluate(() => window.tunnely.setSettings({ mode: 'all' }))
  const ruAll = await routeOf('ya.ru')
  check('Режим «весь трафик»: ya.ru через VPN', !!ruAll && ruAll !== 'DIRECT', ruAll)
  await win.evaluate(() => window.tunnely.setSettings({ mode: 'smart', bypassDomains: ['example.com'] }))
  const own = await routeOf('example.com')
  check('Своё исключение example.com напрямую', own === 'DIRECT', own)
  await win.evaluate(() => window.tunnely.setSettings({ bypassDomains: [] }))

  const fastest = await win.evaluate(() => window.tunnely.selectFastest())
  check('Выбор самого быстрого', fastest.ok, fastest.data ?? fastest.error)

  // Переключение разделов интерфейса
  for (const [i, label] of ['Серверы', 'Подписки', 'Режимы', 'Журнал и правила', 'Настройки'].entries()) {
    await win.click(`.nav:has-text("${label}")`)
    await win.waitForTimeout(700)
    await win.screenshot({ path: join(shots, `${3 + i}-${label}.png`) })
  }
  await win.click('.nav:has-text("Главная")')

  const disc = await win.evaluate(() => window.tunnely.disconnect())
  s = await waitFor(x => x.status === 'disconnected')
  const after = sysProxy()
  check('Отключение', disc.ok && s.status === 'disconnected')
  check('Настройки прокси Windows восстановлены', after.enabled === before.enabled && after.server === before.server && after.bypass === before.bypass, `${after.enabled ? 'вкл' : 'выкл'} ${after.server}`)
  const back = trace()
  check('Интернет работает напрямую после отключения', back.ip === direct.ip)
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {})
  await new Promise(r => setTimeout(r, 4000))
  await app.close().catch(() => {})
}

check('Ядро завершено после выхода', coreProcs() === coresBefore)
const final = sysProxy()
check('Прокси Windows после выхода в исходном состоянии', final.enabled === before.enabled && final.server === before.server)
rmSync(userData, { recursive: true, force: true })

const failed = results.filter(r => !r.ok).length
console.log(`\nИтого: ${results.length - failed} из ${results.length} проверок пройдено`)
process.exit(failed ? 1 : 0)
