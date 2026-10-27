// Взаимодействие с Windows: системный прокси, права администратора, автозапуск.
import { app } from 'electron'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { helperExe } from './paths'
import { log } from './logger'
import type { ProxyBackup } from './store'

const run = promisify(execFile)
const opts = { windowsHide: true, timeout: 15000 }

// Список адресов, которые всегда идут напрямую (локальная сеть)
export const PROXY_BYPASS = '<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*'

export async function readSystemProxy(): Promise<ProxyBackup> {
  const { stdout } = await run(helperExe(), ['proxy', 'json'], opts)
  return JSON.parse(stdout) as ProxyBackup
}

export async function enableSystemProxy(port: number) {
  await run(helperExe(), ['proxy', 'on', `127.0.0.1:${port}`, PROXY_BYPASS], opts)
  log.info(`Системный прокси включён: 127.0.0.1:${port}`)
}

/** Выключает прокси и возвращает прежние значения адреса и исключений */
export async function restoreSystemProxy(backup?: ProxyBackup) {
  const args = ['proxy', 'off']
  if (backup) args.push(backup.server ?? '', backup.bypass ?? '')
  await run(helperExe(), args, opts)
  log.info('Системный прокси выключен, прежние настройки восстановлены')
}

/** Синхронный вариант для завершения работы Windows, когда ждать нельзя */
export function restoreSystemProxySync(backup?: ProxyBackup) {
  const args = ['proxy', 'off']
  if (backup) args.push(backup.server ?? '', backup.bypass ?? '')
  try {
    execFileSync(helperExe(), args, opts)
  } catch {
    /* делаем всё возможное */
  }
}

let adminCache: boolean | undefined
export async function isAdmin(): Promise<boolean> {
  if (adminCache !== undefined) return adminCache
  try {
    await run(helperExe(), ['isadmin'], opts)
    adminCache = true
  } catch {
    adminCache = false
  }
  return adminCache
}

/** Перезапуск приложения с правами администратора. Возвращает false, если пользователь отказал в окне UAC */
export async function relaunchAsAdmin(extraArgs: string[]): Promise<boolean> {
  const args = app.isPackaged ? extraArgs : [app.getAppPath(), ...extraArgs]
  try {
    await run(helperExe(), ['elevate', process.execPath, ...args], opts)
    return true
  } catch (e) {
    const code = (e as { code?: number }).code
    log.warn(code === 3 ? 'Пользователь отказал в правах администратора' : `Не удалось запросить права: ${(e as Error).message}`)
    return false
  }
}

/** Запущенные программы с окнами — чтобы пользователь мог выбрать, какие пустить в обход VPN */
export async function runningApps(): Promise<{ exe: string; title: string }[]> {
  const ps = "Get-Process | Where-Object { $_.MainWindowTitle -and $_.Path } | Sort-Object ProcessName -Unique | ForEach-Object { [IO.Path]::GetFileName($_.Path) + [char]9 + $_.MainWindowTitle }"
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + ps], { ...opts, maxBuffer: 1 << 20 })
  return stdout
    .split(/\r?\n/)
    .map(l => l.split('\t'))
    .filter(p => p[0] && !/^(Tunnely|electron|explorer|ApplicationFrameHost|TextInputHost|SystemSettings)\.exe$/i.test(p[0]))
    .map(([exe, title]) => ({ exe, title: title ?? '' }))
}

const TASK = 'Tunnely VPN Autostart'

/**
 * Автозапуск.
 * Обычный режим — запись в «Автозагрузку» Windows (без прав администратора).
 * Режим TUN требует прав администратора, поэтому создаётся задача Планировщика с наивысшими правами
 * (создание задачи один раз запрашивает подтверждение UAC).
 */
export async function applyAutostart(enabled: boolean, elevated: boolean): Promise<void> {
  const args = ['--hidden']
  if (!enabled) {
    app.setLoginItemSettings({ openAtLogin: false })
    await deleteTask()
    return
  }
  if (!elevated) {
    await deleteTask()
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: app.isPackaged ? args : [app.getAppPath(), ...args] })
    return
  }
  app.setLoginItemSettings({ openAtLogin: false })
  const target = `"${process.execPath}" ${app.isPackaged ? '' : `"${app.getAppPath()}" `}${args.join(' ')}`
  const schtasks = ['/Create', '/TN', TASK, '/TR', target, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F']
  if (await isAdmin()) {
    await run('schtasks.exe', schtasks, opts)
  } else {
    await run(helperExe(), ['elevate', 'schtasks.exe', ...schtasks], opts)
  }
  log.info('Автозапуск с правами администратора настроен через Планировщик задач')
}

async function deleteTask() {
  try {
    await run('schtasks.exe', ['/Query', '/TN', TASK], opts)
  } catch {
    return // задачи нет
  }
  try {
    if (await isAdmin()) await run('schtasks.exe', ['/Delete', '/TN', TASK, '/F'], opts)
    else await run(helperExe(), ['elevate', 'schtasks.exe', '/Delete', '/TN', TASK, '/F'], opts)
  } catch (e) {
    log.warn(`Не удалось удалить задачу автозапуска: ${(e as Error).message}`)
  }
}

export function killPid(pid: number) {
  try {
    execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' })
  } catch {
    /* процесса уже нет */
  }
}

/** Проверяет, что процесс с этим PID — именно наше ядро */
export function isCorePid(pid: number): boolean {
  try {
    const out = execFileSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }).toString()
    return /"mihomo\.exe"/i.test(out)
  } catch {
    return false
  }
}
