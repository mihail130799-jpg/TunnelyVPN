import { Tray, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { AppState } from '../shared/types'
import { cleanName } from '../shared/country'
import { resourcesDir } from './paths'

export interface TrayActions {
  show(): void
  toggle(): void
  setMode(m: AppState['settings']['mode']): void
  selectServer(name: string): void
  quit(): void
}

const STATUS_TEXT: Record<AppState['status'], string> = {
  disconnected: 'Не подключено',
  connecting: 'Подключение…',
  connected: 'Подключено',
  reconnecting: 'Переподключение…',
  disconnecting: 'Отключение…'
}

export class AppTray {
  private tray: Tray
  private icons = {
    on: nativeImage.createFromPath(join(resourcesDir(), 'tray-on.png')),
    off: nativeImage.createFromPath(join(resourcesDir(), 'tray-off.png'))
  }
  private lastKey = ''

  constructor(private actions: TrayActions) {
    this.tray = new Tray(this.icons.off)
    this.tray.setToolTip('Tunnely VPN')
    this.tray.on('click', () => actions.show())
    this.tray.on('double-click', () => actions.show())
  }

  update(s: AppState) {
    const on = s.status === 'connected'
    const key = JSON.stringify([s.status, s.settings.mode, s.selected, s.servers.map(x => x.name), s.activeProfileId])
    if (key === this.lastKey) return
    this.lastKey = key
    this.tray.setImage(on ? this.icons.on : this.icons.off)
    const server = s.effectiveServer ? cleanName(s.effectiveServer) : ''
    this.tray.setToolTip(`Tunnely VPN — ${STATUS_TEXT[s.status]}${on && server ? `\n${server}` : ''}`)

    const busy = s.status === 'connecting' || s.status === 'disconnecting'
    const modes: [AppState['settings']['mode'], string][] = [['smart', 'Умный (с исключениями)'], ['all', 'Весь трафик через VPN']]
    const template: MenuItemConstructorOptions[] = [
      { label: `Tunnely VPN — ${STATUS_TEXT[s.status]}`, enabled: false },
      { type: 'separator' },
      {
        label: on || s.status === 'reconnecting' ? 'Отключить' : 'Подключить',
        enabled: !busy && s.profiles.length > 0,
        click: () => this.actions.toggle()
      },
      {
        label: 'Сервер',
        enabled: s.servers.length > 0,
        submenu: s.servers.map(x => ({
          label: x.isGroup ? `⚡ ${x.name}` : cleanName(x.name),
          type: 'radio' as const,
          checked: x.name === s.selected,
          click: () => this.actions.selectServer(x.name)
        }))
      },
      {
        label: 'Режим',
        submenu: modes.map(([m, label]) => ({ label, type: 'radio' as const, checked: s.settings.mode === m, click: () => this.actions.setMode(m) }))
      },
      { type: 'separator' },
      { label: 'Открыть Tunnely', click: () => this.actions.show() },
      { label: 'Выход', click: () => this.actions.quit() }
    ]
    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  destroy() {
    this.tray.destroy()
  }
}
