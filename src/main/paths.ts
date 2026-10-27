import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/** Папка с ядром, помощником и значками трея */
export function resourcesDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'app-resources') : join(app.getAppPath(), 'resources')
}

export const coreExe = () => join(resourcesDir(), 'core', 'mihomo.exe')
export const helperExe = () => join(resourcesDir(), 'core', 'tunnely-helper.exe')

/** Рабочие данные пользователя: %APPDATA%\Tunnely VPN */
export function dataDir(...sub: string[]): string {
  const p = join(app.getPath('userData'), ...sub)
  mkdirSync(p, { recursive: true })
  return p
}

export const coreHome = () => dataDir('core')
export const profilesDir = () => dataDir('core', 'profiles')
export const logsDir = () => dataDir('logs')
