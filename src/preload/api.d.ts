import type { ActionResult, AppState, ConnectionItem, LogLine, ProfileInfo, Settings, TrafficSample } from '../shared/types'

export interface TunnelyApi {
  state(): Promise<AppState>
  connect(): Promise<ActionResult<{ needAdmin?: boolean }>>
  disconnect(): Promise<ActionResult>
  addText(text: string): Promise<ActionResult<ProfileInfo>>
  addFromClipboard(): Promise<ActionResult<ProfileInfo>>
  addFromFile(): Promise<ActionResult<ProfileInfo | null>>
  updateProfile(id: string): Promise<ActionResult>
  removeProfile(id: string): Promise<ActionResult>
  renameProfile(id: string, name: string): Promise<ActionResult>
  activateProfile(id: string): Promise<ActionResult>
  selectServer(name: string): Promise<ActionResult>
  testDelays(): Promise<ActionResult>
  selectFastest(): Promise<ActionResult<string | undefined>>
  setSettings(patch: Partial<Settings>): Promise<ActionResult<{ needAdmin?: boolean }>>
  relaunchAsAdmin(connect: boolean): Promise<ActionResult<boolean>>
  logs(): Promise<LogLine[]>
  connections(): Promise<ActionResult<ConnectionItem[]>>
  closeConnection(id: string): Promise<ActionResult>
  rules(): Promise<ActionResult<{ type: string; payload: string; proxy: string }[]>>
  openLogsFolder(): Promise<void>
  openUrl(url: string): Promise<void>
  pickApp(): Promise<ActionResult<string[]>>
  runningApps(): Promise<ActionResult<{ exe: string; title: string }[]>>
  checkUpdates(): Promise<ActionResult>
  installUpdate(): Promise<void>
  window(action: 'minimize' | 'maximize' | 'close'): void
  onState(cb: (s: AppState) => void): () => void
  onTraffic(cb: (t: TrafficSample) => void): () => void
  onLog(cb: (l: LogLine) => void): () => void
  onNeedAdmin(cb: () => void): () => void
}

declare global {
  interface Window {
    tunnely: TunnelyApi
  }
}
