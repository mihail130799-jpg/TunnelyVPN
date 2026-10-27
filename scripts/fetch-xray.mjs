// Скачивает официальный релиз Xray-core для Windows x64 с GitHub, сверяет SHA-256 из релиза
// и кладёт resources/core/tunnely-xray.exe (своё имя — чтобы правило «эта программа напрямую» в TUN
// не задевало другие копии Xray на компьютере).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreDir = join(root, 'resources', 'core')
const versionFile = join(coreDir, 'XRAY_VERSION')
const exe = join(coreDir, 'tunnely-xray.exe')
const TAG = process.env.XRAY_TAG // по умолчанию — последний релиз

const url = TAG ? `https://api.github.com/repos/XTLS/Xray-core/releases/tags/${TAG}` : 'https://api.github.com/repos/XTLS/Xray-core/releases/latest'
const rel = await fetch(url, { headers: { 'User-Agent': 'tunnely-build' } }).then(r => {
  if (!r.ok) throw new Error(`GitHub API: ${r.status}`)
  return r.json()
})
const asset = rel.assets.find(a => a.name === 'Xray-windows-64.zip')
if (!asset) throw new Error('В релизе Xray нет архива для Windows x64')
if (!asset.digest?.startsWith('sha256:')) throw new Error('В релизе Xray нет контрольной суммы — отказ от загрузки')

if (existsSync(exe) && existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === rel.tag_name) {
  console.log(`Xray ${rel.tag_name} уже загружен`)
  process.exit(0)
}

console.log(`Загрузка Xray ${rel.tag_name} (${(asset.size / 1e6).toFixed(1)} МБ)…`)
const buf = Buffer.from(await fetch(asset.browser_download_url).then(r => r.arrayBuffer()))
const hash = createHash('sha256').update(buf).digest('hex')
if (`sha256:${hash}` !== asset.digest) throw new Error(`SHA-256 Xray не совпадает: ${hash}`)
console.log('Контрольная сумма совпадает')

const tmp = join(root, 'resources', '.xray-tmp')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const zip = join(tmp, 'xray.zip')
writeFileSync(zip, buf)
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`])
mkdirSync(coreDir, { recursive: true })
copyFileSync(join(tmp, 'xray.exe'), exe)
if (existsSync(join(tmp, 'LICENSE'))) copyFileSync(join(tmp, 'LICENSE'), join(coreDir, 'XRAY-LICENSE.txt'))
writeFileSync(versionFile, rel.tag_name)
rmSync(tmp, { recursive: true, force: true })
console.log(`Готово: resources/core/tunnely-xray.exe (${rel.tag_name})`)
