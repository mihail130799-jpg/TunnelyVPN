// Автообновление приложения. electron-updater сверяет SHA-512 загруженного установщика
// с контрольной суммой из latest.yml и не устанавливает файл при несовпадении.
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Controller } from './controller'
import { log } from './logger'

const { autoUpdater } = electronUpdater

function configured(): boolean {
  if (!app.isPackaged) return false
  const f = join(process.resourcesPath, 'app-update.yml')
  if (!existsSync(f)) return false
  return !readFileSync(f, 'utf8').includes('example.invalid')
}

export function initUpdater(ctrl: Controller) {
  if (!configured()) {
    ctrl.update = { status: 'disabled', message: 'Сервер обновлений пока не настроен' }
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  const set = (u: NonNullable<typeof ctrl.update>) => {
    ctrl.update = u
    ctrl.emitState()
  }
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-available', i => set({ status: 'downloading', version: i.version, progress: 0 }))
  autoUpdater.on('update-not-available', () => set({ status: 'none' }))
  autoUpdater.on('download-progress', p => set({ status: 'downloading', version: ctrl.update?.version, progress: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', i => {
    log.info(`Загружено обновление ${i.version}`)
    set({ status: 'ready', version: i.version })
  })
  autoUpdater.on('error', e => {
    log.warn(`Обновление: ${e.message}`)
    set({ status: 'error', message: 'Не удалось проверить обновления' })
  })
  setTimeout(() => void checkForUpdates(), 30_000)
  setInterval(() => void checkForUpdates(), 6 * 3600_000)
}

export async function checkForUpdates() {
  if (!configured()) return
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    /* ошибка уже передана через событие */
  }
}

export function installUpdate() {
  autoUpdater.quitAndInstall(true, true)
}
