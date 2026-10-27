// Скачивает официальный релиз ядра Mihomo для Windows x64 с GitHub,
// сверяет SHA-256 с опубликованным в релизе и распаковывает в resources/core.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreDir = join(root, 'resources', 'core')
const versionFile = join(coreDir, 'VERSION')
// Вариант "compatible" работает на любых x64-процессорах
const ASSET = /^mihomo-windows-amd64-compatible-v[\d.]+\.zip$/

const api = await fetch('https://api.github.com/repos/MetaCubeX/mihomo/releases/latest', {
  headers: { 'User-Agent': 'tunnely-build' }
}).then(r => {
  if (!r.ok) throw new Error(`GitHub API: ${r.status}`)
  return r.json()
})

const asset = api.assets.find(a => ASSET.test(a.name))
if (!asset) throw new Error('Не найден архив mihomo для Windows в последнем релизе')
if (!asset.digest?.startsWith('sha256:')) throw new Error('В релизе нет контрольной суммы — отказ от загрузки')

if (existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === api.tag_name && existsSync(join(coreDir, 'mihomo.exe'))) {
  console.log(`Mihomo ${api.tag_name} уже загружен`)
  process.exit(0)
}

console.log(`Загрузка ${asset.name} (${(asset.size / 1e6).toFixed(1)} МБ)…`)
const buf = Buffer.from(await fetch(asset.browser_download_url).then(r => r.arrayBuffer()))
const hash = createHash('sha256').update(buf).digest('hex')
if (`sha256:${hash}` !== asset.digest) throw new Error(`SHA-256 не совпадает: ${hash}`)
console.log('Контрольная сумма совпадает')

const tmp = join(root, 'resources', '.core-tmp')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const zip = join(tmp, 'core.zip')
writeFileSync(zip, buf)
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`])
const exe = readdirSync(tmp).find(f => f.endsWith('.exe'))
if (!exe) throw new Error('В архиве нет exe')

mkdirSync(coreDir, { recursive: true })
rmSync(join(coreDir, 'mihomo.exe'), { force: true })
renameSync(join(tmp, exe), join(coreDir, 'mihomo.exe'))
writeFileSync(versionFile, api.tag_name)
rmSync(tmp, { recursive: true, force: true })
console.log(`Готово: resources/core/mihomo.exe (${api.tag_name})`)
