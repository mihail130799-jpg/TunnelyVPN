import { contextBridge, ipcRenderer } from 'electron'
import type { TunnelyApi } from './api'

const on = <T>(channel: string) => (cb: (v: T) => void) => {
  const fn = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => {
    ipcRenderer.removeListener(channel, fn)
  }
}

const api: TunnelyApi = {
  state: () => ipcRenderer.invoke('tunnely:state'),
  connect: () => ipcRenderer.invoke('tunnely:connect'),
  disconnect: () => ipcRenderer.invoke('tunnely:disconnect'),
  addText: text => ipcRenderer.invoke('tunnely:add-text', text),
  addFromClipboard: () => ipcRenderer.invoke('tunnely:add-clipboard'),
  addFromFile: () => ipcRenderer.invoke('tunnely:add-file'),
  updateProfile: id => ipcRenderer.invoke('tunnely:update-profile', id),
  removeProfile: id => ipcRenderer.invoke('tunnely:remove-profile', id),
  renameProfile: (id, name) => ipcRenderer.invoke('tunnely:rename-profile', id, name),
  activateProfile: id => ipcRenderer.invoke('tunnely:activate-profile', id),
  selectServer: name => ipcRenderer.invoke('tunnely:select-server', name),
  testDelays: () => ipcRenderer.invoke('tunnely:test-delays'),
  selectFastest: () => ipcRenderer.invoke('tunnely:select-fastest'),
  setSettings: patch => ipcRenderer.invoke('tunnely:set-settings', patch),
  relaunchAsAdmin: connect => ipcRenderer.invoke('tunnely:relaunch-admin', connect),
  logs: () => ipcRenderer.invoke('tunnely:logs'),
  connections: () => ipcRenderer.invoke('tunnely:connections'),
  closeConnection: id => ipcRenderer.invoke('tunnely:close-connection', id),
  rules: () => ipcRenderer.invoke('tunnely:rules'),
  openLogsFolder: () => ipcRenderer.invoke('tunnely:open-logs'),
  openUrl: url => ipcRenderer.invoke('tunnely:open-url', url),
  pickApp: () => ipcRenderer.invoke('tunnely:pick-app'),
  runningApps: () => ipcRenderer.invoke('tunnely:running-apps'),
  checkUpdates: () => ipcRenderer.invoke('tunnely:check-updates'),
  installUpdate: () => ipcRenderer.invoke('tunnely:install-update'),
  window: action => ipcRenderer.send('tunnely:window', action),
  onState: on('tunnely:state'),
  onTraffic: on('tunnely:traffic'),
  onLog: on('tunnely:log'),
  onNeedAdmin: on('tunnely:need-admin')
}

contextBridge.exposeInMainWorld('tunnely', api)
