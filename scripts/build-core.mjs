// Собирает ядро Mihomo из официальных исходников с одной правкой:
// клиент REALITY сообщает серверу современную версию (по умолчанию Mihomo представляется версией 1.8.2,
// и серверы с ограничением minClientVer его отклоняют).
// Шаги: скачивает Go (с проверкой SHA-256) в .tools, клонирует Mihomo нужного релиза, применяет правку,
// собирает resources/core/mihomo.exe. Исходники и правка сохраняются (требование GPL-3.0).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tools = join(root, '.tools')
const coreDir = join(root, 'resources', 'core')
const MIHOMO_TAG = process.env.MIHOMO_TAG || 'v1.19.33'
// Версия клиента REALITY, которую ядро сообщает серверу (формат Xray: год.месяц.день)
const REALITY_VERSION = (process.env.REALITY_CLIENT_VERSION || '26.10.21').split('.').map(Number)

mkdirSync(tools, { recursive: true })

// ---------- Go ----------
const goExe = join(tools, 'go', 'bin', 'go.exe')
if (!existsSync(goExe)) {
  const list = await fetch('https://go.dev/dl/?mode=json').then(r => r.json())
  const rel = list[0]
  const f = rel.files.find(x => x.os === 'windows' && x.arch === 'amd64' && x.kind === 'archive')
  console.log(`Загрузка ${f.filename} (${(f.size / 1e6).toFixed(0)} МБ)…`)
  const buf = Buffer.from(await fetch(`https://go.dev/dl/${f.filename}`).then(r => r.arrayBuffer()))
  const hash = createHash('sha256').update(buf).digest('hex')
  if (hash !== f.sha256) throw new Error(`SHA-256 Go не совпадает: ${hash}`)
  const zip = join(tools, 'go.zip')
  writeFileSync(zip, buf)
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tools}' -Force`], { stdio: 'inherit' })
  rmSync(zip)
  console.log(`Go ${rel.version} установлен в .tools/go`)
}

// ---------- исходники Mihomo ----------
const src = join(tools, `mihomo-${MIHOMO_TAG}`)
if (!existsSync(join(src, 'go.mod'))) {
  rmSync(src, { recursive: true, force: true })
  execFileSync('git', ['clone', '--depth', '1', '--branch', MIHOMO_TAG, 'https://github.com/MetaCubeX/mihomo.git', src], { stdio: 'inherit' })
}

// ---------- правка версии клиента REALITY ----------
const realityFile = join(src, 'component', 'tls', 'reality.go')
let code = readFileSync(realityFile, 'utf8')
const re = /hello\.SessionId\[0\] = \d+(\s+)hello\.SessionId\[1\] = \d+(\s+)hello\.SessionId\[2\] = \d+/
if (!re.test(code)) throw new Error('Не найдено место правки в reality.go — проверьте версию Mihomo')
const [a, b, c] = REALITY_VERSION
code = code.replace(re, `hello.SessionId[0] = ${a}$1hello.SessionId[1] = ${b}$2hello.SessionId[2] = ${c}`)

// Серверы Xray 26.9.8+ отклоняют ClientHello без обмена ключами X25519MLKEM768,
// а Mihomo по умолчанию его убирает. Оставляем его всегда — как делает официальный клиент Xray.
const mlkemRe = /if !realityConfig\.SupportX25519MLKEM768 \{/
if (mlkemRe.test(code)) code = code.replace(mlkemRe, 'if false && !realityConfig.SupportX25519MLKEM768 {')
else if (!code.includes('if false && !realityConfig.SupportX25519MLKEM768 {')) throw new Error('Не найдено место правки X25519MLKEM768')

// Отпечаток Firefox в uTLS Mihomo не проходит проверку новых серверов REALITY — для REALITY используем Chrome
const fpMarker = '\t// tunnely: firefox → chrome\n'
if (!code.includes(fpMarker)) {
  const fnRe = /(func GetRealityConn\([^)]*\) \(net\.Conn, error\) \{\r?\n)/
  if (!fnRe.test(code)) throw new Error('Не найдено место правки отпечатка')
  code = code.replace(fnRe, `$1${fpMarker}\tif fingerprint.Client == "Firefox" {\n\t\tfingerprint = utls.HelloChrome_Auto\n\t}\n`)
}
writeFileSync(realityFile, code)

// На медленных каналах (например, из Азии до Москвы, ~300 мс) рукопожатие VLESS Reality
// с постквантовым шифрованием иногда длится 6–8 с, а ядро ждёт подключения к серверу всего 5 с. Даём 15 с.
const tunnelFile = join(src, 'tunnel', 'tunnel.go')
let tunnel = readFileSync(tunnelFile, 'utf8')
const toRe = /ctx, cancel := context\.WithTimeout\(context\.Background\(\), C\.DefaultTCPTimeout\)/
if (toRe.test(tunnel)) tunnel = tunnel.replace(toRe, 'ctx, cancel := context.WithTimeout(context.Background(), 3*C.DefaultTCPTimeout)')
else if (!tunnel.includes('3*C.DefaultTCPTimeout')) throw new Error('Не найдено место правки таймаута подключения')
writeFileSync(tunnelFile, tunnel)

mkdirSync(join(root, 'patches'), { recursive: true })
writeFileSync(join(root, 'patches', 'mihomo-tunnely.diff'), execFileSync('git', ['-C', src, 'diff']).toString())
console.log(`Правка применена: версия клиента REALITY ${REALITY_VERSION.join('.')}`)

// ---------- сборка ----------
const version = `${MIHOMO_TAG}-tunnely`
const env = {
  ...process.env,
  GOROOT: join(tools, 'go'),
  GOPATH: join(tools, 'gopath'),
  GOCACHE: join(tools, 'gocache'),
  GOOS: 'windows',
  GOARCH: 'amd64',
  GOAMD64: 'v1', // работает на любых x64-процессорах
  CGO_ENABLED: '0',
  GOTOOLCHAIN: 'local'
}
mkdirSync(coreDir, { recursive: true })
const out = join(coreDir, 'mihomo.exe')
console.log('Сборка ядра…')
execFileSync(
  goExe,
  [
    'build', '-tags', 'with_gvisor', '-trimpath',
    '-ldflags', `-s -w -X "github.com/metacubex/mihomo/constant.Version=${version}" -X "github.com/metacubex/mihomo/constant.BuildTime=${new Date().toUTCString()}"`,
    '-o', out
  ],
  { cwd: src, env, stdio: 'inherit' }
)
writeFileSync(join(coreDir, 'VERSION'), version)
console.log(`Готово: resources/core/mihomo.exe (${version})`)
