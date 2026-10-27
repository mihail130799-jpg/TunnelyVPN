// Замер нагрузки: число процессов и загрузка процессора в разных состояниях.
// Запуск: TUNNELY_TEST_KEY=<ключ> node tests/perf.mjs [путь к Tunnely.exe]
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, cpus } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEY = process.env.TUNNELY_TEST_KEY
if (!KEY) throw new Error('Задайте TUNNELY_TEST_KEY')
const exe = process.argv[2]
const exeName = exe ? 'Tunnely' : 'electron'
const userData = mkdtempSync(join(tmpdir(), 'tunnely-perf-'))
const CORES = cpus().length

/** Суммарное процессорное время (с) и число процессов приложения и ядра */
function sample() {
  // Только процессы тестового экземпляра — по пути к файлу (у пользователя может работать своя копия)
  const base = (exe ? dirname(exe) : join(root, 'node_modules', 'electron', 'dist')).replace(/\//g, '\\')
  const coreBase = (exe ? dirname(exe) : root).replace(/\//g, '\\')
  const ps = `Get-Process ${exeName},mihomo -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path.StartsWith('${base}') -or $_.Path.StartsWith('${coreBase}')) } | ForEach-Object { $_.ProcessName + ' ' + $_.TotalProcessorTime.TotalSeconds }; exit 0`
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps]).toString().trim().split(/\r?\n/).filter(Boolean)
  const r = { app: 0, core: 0, appProcs: 0, coreProcs: 0 }
  for (const l of out) {
    const [name, sec] = l.split(' ')
    const v = Number(sec.replace(',', '.'))
    if (name === 'mihomo') { r.core += v; r.coreProcs++ } else { r.app += v; r.appProcs++ }
  }
  return r
}

async function measure(label, seconds = 15) {
  const a = sample()
  await new Promise(r => setTimeout(r, seconds * 1000))
  const b = sample()
  // % от всего процессора (как в Диспетчере задач)
  const pct = v => ((v / seconds / CORES) * 100).toFixed(1)
  console.log(`${label.padEnd(34)} процессов: ${b.appProcs} + ядро ${b.coreProcs} | CPU приложение ${pct(b.app - a.app)}%  ядро ${pct(b.core - a.core)}%`)
}

const app = await electron.launch({ executablePath: exe, args: exe ? [] : [root], env: { ...process.env, TUNNELY_USER_DATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1080, height: 720 }).catch(() => {})
await win.waitForTimeout(3000)
await measure('Без ключа, главная')
await win.evaluate(k => window.tunnely.addText(k), KEY)
await win.waitForTimeout(3000)
await measure('Отключено, главная')
await win.evaluate(() => window.tunnely.connect())
await win.waitForTimeout(3000)
await measure('Подключено, главная')
await win.click('.nav:has-text("Настройки")')
await measure('Подключено, раздел «Настройки»')
await win.click('.nav:has-text("Главная")')
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
await measure('Подключено, окно свёрнуто в трей')
await win.evaluate(() => window.tunnely.disconnect())
await app.evaluate(({ app }) => app.quit()).catch(() => {})
await new Promise(r => setTimeout(r, 4000))
await app.close().catch(() => {})
rmSync(userData, { recursive: true, force: true })
