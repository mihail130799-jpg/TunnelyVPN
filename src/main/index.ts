import { app, BrowserWindow, ipcMain, clipboard, dialog, shell, Notification, nativeImage } from 'electron'
import { join } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import type { ActionResult, Settings } from '../shared/types'
import { Controller } from './controller'
import { store } from './store'
import { log } from './logger'
import { AppTray } from './tray'
import { logsDir, resourcesDir } from './paths'
import * as profiles from './profiles'
import * as sys from './system'
import { initUpdater, checkForUpdates, installUpdate } from './updater'

app.setAppUserModelId('app.tunnely.vpn')
// Отдельная папка данных для автотестов, чтобы не трогать настройки пользователя
if (process.env.TUNNELY_USER_DATA) app.setPath('userData', process.env.TUNNELY_USER_DATA)

// Меньше процессов: сетевая служба Chromium работает внутри основного процесса.
// Графику (GPU) переносить в основной процесс нельзя: с флагом in-process-gpu окно на Windows остаётся пустым.
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2')
// Без лишних фоновых служб Chromium
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,CalculateNativeWinOcclusion')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  main()
}

function main() {
  const args = process.argv
  const startHidden = args.includes('--hidden')
  const connectAfterStart = args.includes('--connect')

  let win: BrowserWindow | undefined
  let tray: AppTray | undefined
  let quitting = false
  let trayHintShown = false
  const ctrl = new Controller()

  function createWindow() {
    win = new BrowserWindow({
      width: 1080,
      height: 720,
      minWidth: 760,
      minHeight: 620,
      frame: false,
      show: false,
      backgroundColor: '#0B0F2E',
      title: 'Tunnely VPN',
      icon: nativeImage.createFromPath(join(resourcesDir(), 'icon.png')),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })
    win.setMenu(null)
    win.on('ready-to-show', () => {
      if (!(startHidden || store.state.settings.startMinimized)) win?.show()
    })
    win.on('close', e => {
      if (quitting || !store.state.settings.closeToTray) return
      e.preventDefault()
      win?.hide()
      if (!trayHintShown && Notification.isSupported()) {
        trayHintShown = true
        new Notification({ title: 'Tunnely VPN работает в фоне', body: 'Значок приложения — в области уведомлений рядом с часами.' }).show()
      }
    })
    // Завершение работы Windows: успеваем вернуть настройки прокси
    win.on('session-end', () => ctrl.cleanupSync())
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', e => e.preventDefault())

    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  function showWindow() {
    if (!win) createWindow()
    if (win!.isMinimized()) win!.restore()
    win!.show()
    win!.focus()
  }

  async function quit() {
    if (quitting) return
    quitting = true
    log.info('Завершение работы')
    await ctrl.shutdown()
    log.flushSync()
    tray?.destroy()
    // Обычный выход Electron (а не мгновенный exit): так загруженное обновление установится при выходе
    setTimeout(() => app.exit(0), 5000).unref()
    app.quit()
  }

  /** Установка загруженного обновления: сначала корректно отключаемся и возвращаем настройки Windows */
  async function updateNow() {
    if (!quitting) {
      quitting = true
      log.info('Установка обновления')
      await ctrl.shutdown()
      log.flushSync()
      tray?.destroy()
    }
    installUpdate()
  }

  async function toggle() {
    try {
      if (ctrl.status === 'connected' || ctrl.status === 'reconnecting') await ctrl.disconnect()
      else {
        const r = await ctrl.connect()
        if (r.needAdmin) {
          showWindow()
          win?.webContents.send('tunnely:need-admin')
        }
      }
    } catch {
      /* ошибка уже в состоянии */
    }
  }

  async function relaunchAsAdmin(connect: boolean): Promise<boolean> {
    // Освобождаем «единственный экземпляр», чтобы новый процесс смог запуститься
    app.releaseSingleInstanceLock()
    const ok = await sys.relaunchAsAdmin(connect ? ['--connect'] : [])
    if (!ok) {
      app.requestSingleInstanceLock()
      return false
    }
    await quit()
    return true
  }

  app.on('second-instance', () => showWindow())
  app.on('window-all-closed', () => {
    /* остаёмся в трее */
  })
  app.on('before-quit', e => {
    if (!quitting) {
      e.preventDefault()
      void quit()
    }
  })

  // ---------- IPC ----------

  async function wrap<T>(fn: () => Promise<T> | T): Promise<ActionResult<T>> {
    try {
      return { ok: true, data: await fn() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async function addAndActivate(text: string, nameHint?: string) {
    const p = await profiles.addProfile(text, nameHint)
    if (store.state.activeProfileId === p.id || store.state.profiles.length === 1) await ctrl.setActiveProfile(p.id)
    else ctrl.emitState()
    return profiles.toInfo(p)
  }

  ipcMain.handle('tunnely:state', () => ctrl.snapshot())
  ipcMain.handle('tunnely:connect', () => wrap(() => ctrl.connect()))
  ipcMain.handle('tunnely:disconnect', () => wrap(() => ctrl.disconnect()))
  ipcMain.handle('tunnely:add-text', (_e, text: string) => wrap(() => addAndActivate(String(text))))
  ipcMain.handle('tunnely:add-clipboard', () =>
    wrap(async () => {
      const text = (await clipboard.readText()).trim()
      if (!text) throw new Error('Буфер обмена пуст. Скопируйте ключ, который вы получили, и попробуйте снова.')
      return addAndActivate(text)
    })
  )
  ipcMain.handle('tunnely:add-file', () =>
    wrap(async () => {
      const r = await dialog.showOpenDialog(win!, {
        title: 'Выберите файл конфигурации',
        filters: [{ name: 'Конфигурация', extensions: ['yaml', 'yml', 'txt', 'conf', 'json'] }, { name: 'Все файлы', extensions: ['*'] }],
        properties: ['openFile']
      })
      if (r.canceled || !r.filePaths[0]) return null
      const f = r.filePaths[0]
      if (statSync(f).size > 5 * 1024 * 1024) throw new Error('Файл слишком большой')
      return addAndActivate(readFileSync(f, 'utf8'), basename(f, extname(f)))
    })
  )
  ipcMain.handle('tunnely:update-profile', (_e, id: string) =>
    wrap(async () => {
      await profiles.updateProfile(id)
      if (id === store.state.activeProfileId) await ctrl.onProfilesChanged()
      else ctrl.emitState()
    })
  )
  ipcMain.handle('tunnely:remove-profile', (_e, id: string) =>
    wrap(async () => {
      const wasActive = store.state.activeProfileId === id
      if (wasActive && ctrl.status !== 'disconnected') await ctrl.disconnect()
      profiles.removeProfile(id)
      await ctrl.onProfilesChanged(wasActive)
    })
  )
  ipcMain.handle('tunnely:rename-profile', (_e, id: string, name: string) => wrap(() => { profiles.renameProfile(id, name); ctrl.emitState() }))
  ipcMain.handle('tunnely:activate-profile', (_e, id: string) => wrap(() => ctrl.setActiveProfile(id)))
  ipcMain.handle('tunnely:select-server', (_e, name: string) => wrap(() => ctrl.selectServer(name)))
  ipcMain.handle('tunnely:test-delays', () => wrap(() => ctrl.testDelays()))
  ipcMain.handle('tunnely:select-fastest', () => wrap(() => ctrl.selectFastest()))
  ipcMain.handle('tunnely:set-settings', (_e, patch: Partial<Settings>) => wrap(() => ctrl.setSettings(patch)))
  ipcMain.handle('tunnely:relaunch-admin', (_e, connect: boolean) => wrap(() => relaunchAsAdmin(connect)))
  ipcMain.handle('tunnely:logs', () => log.recent())
  ipcMain.handle('tunnely:connections', () => wrap(() => ctrl.connections()))
  ipcMain.handle('tunnely:close-connection', (_e, id: string) => wrap(() => ctrl.closeConnection(id)))
  ipcMain.handle('tunnely:rules', () => wrap(() => ctrl.rules()))
  ipcMain.handle('tunnely:open-logs', () => shell.openPath(logsDir()))
  ipcMain.handle('tunnely:open-url', (_e, url: string) => {
    if (/^https?:\/\//.test(url) || /^tg:\/\//.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('tunnely:pick-app', () =>
    wrap(async () => {
      const r = await dialog.showOpenDialog(win!, {
        title: 'Выберите программу, которая будет работать в обход VPN',
        filters: [{ name: 'Программы', extensions: ['exe'] }],
        properties: ['openFile', 'multiSelections']
      })
      return r.canceled ? [] : r.filePaths.map(f => basename(f))
    })
  )
  ipcMain.handle('tunnely:running-apps', () => wrap(() => sys.runningApps()))
  ipcMain.handle('tunnely:check-updates', () => wrap(() => checkForUpdates()))
  ipcMain.handle('tunnely:install-update', () => updateNow())
  ipcMain.on('tunnely:window', (_e, action: 'minimize' | 'maximize' | 'close') => {
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else win.close()
  })

  // ---------- запуск ----------

  app.whenReady().then(async () => {
    store.init()
    log.info(`Tunnely ${app.getVersion()} запускается${startHidden ? ' (свёрнуто)' : ''}`)
    createWindow()
    tray = new AppTray({
      show: showWindow,
      toggle: () => void toggle(),
      setMode: m => void ctrl.setSettings({ mode: m }),
      selectServer: n => void ctrl.selectServer(n).catch(e => log.warn((e as Error).message)),
      quit: () => void quit()
    })

    let lastTraffic = 0
    ctrl.on('state', s => {
      tray?.update(s)
      win?.webContents.send('tunnely:state', s)
    })
    ctrl.on('traffic', t => {
      if (win?.isVisible()) win.webContents.send('tunnely:traffic', t)
      lastTraffic = t.t
    })
    log.on('line', l => {
      if (win?.isVisible()) win.webContents.send('tunnely:log', l)
    })
    void lastTraffic

    initUpdater(ctrl)
    await ctrl.init()

    const s = store.state
    if (connectAfterStart || s.settings.connectOnStart) {
      await toggle()
    }
  })
}
