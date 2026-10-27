// Главная логика: подключение/отключение, серверы, статистика, автопереподключение.
import { app } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dump as yamlDump } from 'js-yaml'
import { EventEmitter } from 'node:events'
import type { AppState, ConnStatus, ServerInfo, Settings, TrafficSample, ConnectionItem } from '../shared/types'
import { detectCountry } from '../shared/country'
import { MihomoCore } from './core'
import { buildRuntimeConfig, pickMainGroup, TEST_URL } from './config'
import { store } from './store'
import { coreHome } from './paths'
import { log } from './logger'
import * as profiles from './profiles'
import * as sys from './system'

interface ProxyApiItem {
  name: string
  type: string
  now?: string
  all?: string[]
  history?: { delay: number }[]
}

const GROUP_TYPES = new Set(['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay'])

export class Controller extends EventEmitter {
  core = new MihomoCore()
  status: ConnStatus = 'disconnected'
  error?: string
  connectedAt?: number
  isAdmin = false
  groupName?: string
  servers: ServerInfo[] = []
  selected?: string
  effective?: string
  update: AppState['update'] = { status: 'idle' }

  private connectedTun = false
  private lastTotals?: { up: number; down: number; t: number }
  private sessionBase = { up: 0, down: 0 }
  private trafficStop?: () => void
  private healthTimer?: NodeJS.Timeout
  private subsTimer?: NodeJS.Timeout
  private healthFails = 0
  private crashTimes: number[] = []
  private busy = Promise.resolve()

  // ---------- состояние ----------

  get settings(): Settings {
    return store.state.settings
  }

  snapshot(): AppState {
    const s = store.state
    return {
      status: this.status,
      error: this.error,
      connectedAt: this.connectedAt,
      profiles: s.profiles.map(profiles.toInfo),
      activeProfileId: s.activeProfileId,
      groupName: this.groupName,
      servers: this.servers,
      selected: this.selected,
      effectiveServer: this.effective,
      settings: s.settings,
      isAdmin: this.isAdmin,
      appVersion: app.getVersion(),
      coreVersion: this.core.version,
      coreRunning: this.core.running,
      update: this.update
    }
  }

  emitState() {
    this.emit('state', this.snapshot())
  }

  private setStatus(st: ConnStatus, error?: string) {
    this.status = st
    this.error = error
    this.emitState()
  }

  /** Операции подключения выполняются строго по очереди */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.busy.then(fn, fn)
    this.busy = next.then(() => undefined, () => undefined)
    return next
  }

  // ---------- запуск ----------

  async init() {
    this.isAdmin = await sys.isAdmin()
    await this.core.readVersion()
    await this.recoverAfterCrash()
    this.core.on('crash', () => this.onCoreCrash())
    this.core.on('started', pid => {
      store.update(s => { s.corePid = pid })
      this.streamTraffic()
    })

    if (store.state.activeProfileId) {
      try {
        await this.startIdle()
      } catch (e) {
        this.error = (e as Error).message
      }
    }
    this.subsTimer = setInterval(() => this.autoUpdateSubscriptions(), 30 * 60_000)
    setTimeout(() => this.autoUpdateSubscriptions(), 15_000)
    this.emitState()
  }

  /** Если прошлый сеанс завершился аварийно — возвращаем сетевые настройки Windows и убираем «зависшее» ядро */
  private async recoverAfterCrash() {
    const s = store.state
    if (s.corePid && sys.isCorePid(s.corePid)) {
      log.warn('Найдено ядро от прошлого сеанса — завершаем')
      sys.killPid(s.corePid)
    }
    if (s.proxyBackup) {
      log.warn('Прошлый сеанс завершился аварийно — восстанавливаем системный прокси')
      try {
        await sys.restoreSystemProxy(s.proxyBackup)
      } catch (e) {
        log.error(`Не удалось восстановить прокси: ${(e as Error).message}`)
      }
    }
    store.update(st => {
      delete st.proxyBackup
      delete st.corePid
    })
  }

  private writeRuntime(tun: boolean): string {
    const id = store.state.activeProfileId
    if (!id) throw new Error('Добавьте ключ или подписку, чтобы подключиться')
    const base = profiles.loadBaseConfig(id)
    const cfg = buildRuntimeConfig(base, {
      mixedPort: this.core.mixedPort,
      controllerPort: this.core.controllerPort,
      secret: this.core.secret,
      mode: this.settings.mode,
      tun,
      bypass: { ru: this.settings.bypassRu, domains: this.settings.bypassDomains, apps: this.settings.bypassApps }
    })
    const path = join(coreHome(), 'runtime.yaml')
    writeFileSync(path, yamlDump(cfg, { lineWidth: -1 }))
    return path
  }

  /** Ядро работает в фоне без перенаправления трафика: это нужно для списка серверов и проверки задержки */
  private async startIdle() {
    await this.core.allocatePorts()
    const path = this.writeRuntime(false)
    await this.core.test(path)
    await this.core.start(path)
    await this.applySavedSelection()
    await this.refreshServers()
  }

  // ---------- подключение ----------

  connect(): Promise<{ needAdmin?: boolean }> {
    return this.serial(async () => {
      if (this.status === 'connected') return {}
      const tun = this.settings.connection === 'tun'
      if (tun && !this.isAdmin) return { needAdmin: true }
      this.setStatus('connecting')
      try {
        await this.core.allocatePorts()
        const path = this.writeRuntime(tun)
        await this.core.test(path)
        if (this.core.running) await this.core.reload(path)
        else await this.core.start(path)
        await this.applySavedSelection()

        if (!tun) {
          if (!store.state.proxyBackup) {
            const backup = await sys.readSystemProxy()
            // Если прокси уже указывал на нас (сбой), не запоминаем его как «прежний»
            if (backup.server === `127.0.0.1:${this.core.mixedPort}`) backup.enabled = false
            store.update(s => { s.proxyBackup = backup })
          }
          await sys.enableSystemProxy(this.core.mixedPort)
        }
        this.connectedTun = tun
        this.connectedAt = Date.now()
        this.healthFails = 0
        this.resetSessionTraffic()
        await this.closeConnections()
        store.update(s => { s.wasConnected = true })
        this.setStatus('connected')
        log.info(`Подключено (${tun ? 'TUN' : 'системный прокси'}, режим ${this.settings.mode === 'smart' ? 'умный' : 'весь трафик'})`)
        this.startHealth()
        void this.refreshServers()
        return {}
      } catch (e) {
        const msg = (e as Error).message
        log.error(`Ошибка подключения: ${msg}`)
        await this.teardown().catch(() => undefined)
        this.setStatus('disconnected', msg)
        throw e
      }
    })
  }

  disconnect(): Promise<void> {
    return this.serial(async () => {
      if (this.status === 'disconnected') return
      this.setStatus('disconnecting')
      await this.teardown()
      store.update(s => { s.wasConnected = false })
      this.setStatus('disconnected')
      log.info('Отключено')
    })
  }

  /** Возвращает Windows в исходное состояние: прокси выключен, TUN снят, соединения закрыты */
  private async teardown() {
    this.stopHealth()
    this.connectedAt = undefined
    const backup = store.state.proxyBackup
    if (backup) {
      try {
        await sys.restoreSystemProxy(backup)
      } finally {
        store.update(s => { delete s.proxyBackup })
      }
    }
    if (this.connectedTun && this.core.running) {
      try {
        await this.core.reload(this.writeRuntime(false))
      } catch {
        // Если ядро не отвечает — останавливаем его, Windows сама уберёт TUN-адаптер
        await this.core.stop()
      }
    }
    this.connectedTun = false
    await this.closeConnections()
  }

  /** Синхронная очистка при завершении работы Windows */
  cleanupSync() {
    const backup = store.state.proxyBackup
    if (backup) {
      sys.restoreSystemProxySync(backup)
      store.update(s => { delete s.proxyBackup })
    }
    if (this.core.pid) sys.killPid(this.core.pid)
  }

  async shutdown() {
    this.trafficStop?.()
    this.trafficStop = () => undefined // больше не переподключаем поток
    clearInterval(this.subsTimer)
    this.stopHealth()
    try {
      await this.teardown()
    } catch (e) {
      log.error(`Ошибка при отключении: ${(e as Error).message}`)
    }
    await this.core.stop()
    store.update(s => { delete s.corePid })
  }

  private async closeConnections() {
    if (!this.core.running) return
    try {
      await this.core.api('DELETE', '/connections')
    } catch {
      /* не критично */
    }
  }

  // ---------- защита от зависших подключений ----------

  private startHealth() {
    this.stopHealth()
    this.healthTimer = setInterval(() => void this.healthCheck(), 20_000)
    void this.healthCheck()
  }

  private stopHealth() {
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.healthTimer = undefined
  }

  private async healthCheck() {
    if (this.status !== 'connected' || !this.groupName) return
    const target = this.effective ?? this.selected
    if (!target) return
    try {
      const r = await this.core.api<{ delay: number }>('GET', `/proxies/${encodeURIComponent(target)}/delay?timeout=6000&url=${encodeURIComponent(TEST_URL)}`, undefined, 8000)
      this.healthFails = 0
      this.setDelay(target, r.delay)
      this.emitState()
    } catch {
      this.healthFails++
      this.setDelay(target, 0)
      log.warn(`Сервер «${target}» не отвечает (${this.healthFails}/3)`)
      if (this.healthFails >= 3 && this.settings.autoReconnect) {
        this.healthFails = 0
        await this.reconnect('сервер не отвечает')
      } else this.emitState()
    }
  }

  private async reconnect(reason: string) {
    if (this.status !== 'connected') return
    log.warn(`Переподключение: ${reason}`)
    this.setStatus('reconnecting')
    try {
      await this.core.reload(this.writeRuntime(this.connectedTun))
      await this.applySavedSelection()
      // Если выбран конкретный сервер и он недоступен — переходим на самый быстрый из доступных
      const sel = this.servers.find(s => s.name === this.selected)
      if (sel && !sel.isGroup) {
        const ok = await this.selectFastest(true)
        if (ok) log.info(`Переключено на «${ok}»`)
      }
      await this.closeConnections()
      this.setStatus('connected')
    } catch (e) {
      log.error(`Переподключение не удалось: ${(e as Error).message}`)
      this.setStatus('connected', 'Связь с сервером нестабильна, пробуем снова…')
    }
  }

  private async onCoreCrash() {
    const now = Date.now()
    this.crashTimes = this.crashTimes.filter(t => now - t < 5 * 60_000)
    this.crashTimes.push(now)
    const wasConnected = this.status === 'connected' || this.status === 'reconnecting'
    if (this.crashTimes.length > 5) {
      log.error('Ядро падает слишком часто — отключаемся, чтобы не оставить Windows без интернета')
      await this.teardown().catch(() => undefined)
      this.setStatus('disconnected', 'Ядро VPN несколько раз аварийно завершилось. Подробности — в разделе «Журнал».')
      return
    }
    try {
      const path = this.writeRuntime(wasConnected && this.connectedTun)
      await this.core.start(path)
      await this.applySavedSelection()
      if (wasConnected) this.setStatus('connected')
      else this.emitState()
      log.info('Ядро перезапущено')
    } catch (e) {
      await this.teardown().catch(() => undefined)
      this.setStatus('disconnected', (e as Error).message)
    }
  }

  // ---------- серверы ----------

  private setDelay(name: string, delay: number) {
    const s = this.servers.find(x => x.name === name)
    if (s) s.delay = delay
    // Задержка группы «Авто» = задержка сервера, который она сейчас использует
    if (name === this.effective) {
      const g = this.servers.find(x => x.name === this.selected)
      if (g?.isGroup) g.delay = delay
    }
  }

  async refreshServers() {
    if (!this.core.running) {
      this.servers = []
      this.groupName = undefined
      this.emitState()
      return
    }
    try {
      const { proxies } = await this.core.api<{ proxies: Record<string, ProxyApiItem> }>('GET', '/proxies')
      const groups = Object.values(proxies).filter(p => GROUP_TYPES.has(p.type))
      const group = pickMainGroup(groups)
      const g = proxies[group]
      this.groupName = group
      const prevDelays = new Map(this.servers.map(s => [s.name, s.delay]))
      this.servers = (g?.all ?? [])
        .filter(n => n !== 'DIRECT' && n !== 'REJECT' && n !== 'REJECT-DROP' && n !== 'PASS' && n !== 'COMPATIBLE')
        .map(n => {
          const p = proxies[n]
          const isGroup = GROUP_TYPES.has(p?.type ?? '')
          const last = p?.history?.at(-1)?.delay
          return { name: n, type: p?.type ?? '', isGroup, country: isGroup ? undefined : detectCountry(n), delay: last ?? prevDelays.get(n) ?? null }
        })
      this.selected = g?.now
      // Для групп «Авто» показываем, какой сервер реально используется
      let eff = g?.now
      for (let i = 0; i < 5 && eff && proxies[eff] && GROUP_TYPES.has(proxies[eff].type) && proxies[eff].now; i++) eff = proxies[eff].now
      this.effective = eff
    } catch (e) {
      log.warn(`Не удалось получить список серверов: ${(e as Error).message}`)
    }
    this.emitState()
  }

  private async applySavedSelection() {
    const id = store.state.activeProfileId
    const name = id ? store.state.selection[id] : undefined
    await this.refreshServers()
    if (name && this.groupName && this.servers.some(s => s.name === name) && this.selected !== name) {
      await this.putSelection(name).catch(() => undefined)
      await this.refreshServers()
    }
  }

  private async putSelection(name: string) {
    if (!this.groupName) throw new Error('Нет группы серверов')
    await this.core.api('PUT', `/proxies/${encodeURIComponent(this.groupName)}`, { name })
    if (this.groupName !== 'GLOBAL') {
      await this.core.api('PUT', `/proxies/GLOBAL`, { name: this.groupName }).catch(() => undefined)
    }
  }

  async selectServer(name: string) {
    await this.putSelection(name)
    const id = store.state.activeProfileId
    if (id) store.update(s => { s.selection[id] = name })
    await this.closeConnections()
    await this.refreshServers()
    this.healthFails = 0
    if (this.status === 'connected') void this.healthCheck()
    log.info(`Выбран сервер «${name}»`)
  }

  async testDelays(): Promise<void> {
    if (!this.groupName || !this.core.running) return
    let res: Record<string, number> = {}
    try {
      res = await this.core.api<Record<string, number>>('GET', `/group/${encodeURIComponent(this.groupName)}/delay?timeout=5000&url=${encodeURIComponent(TEST_URL)}`, undefined, 15000)
    } catch (e) {
      // Ошибка API означает, что все серверы группы недоступны
      log.warn(`Проверка задержки: ${(e as Error).message}`)
    }
    // Не ответившие за 5 с проверяем ещё раз по отдельности с запасом по времени (первое соединение бывает медленным)
    await Promise.all(
      this.servers
        .filter(s => !s.isGroup && !res[s.name])
        .map(async s => {
          try {
            const r = await this.core.api<{ delay: number }>('GET', `/proxies/${encodeURIComponent(s.name)}/delay?timeout=8000&url=${encodeURIComponent(TEST_URL)}`, undefined, 10000)
            res[s.name] = r.delay
          } catch {
            /* сервер недоступен */
          }
        })
    )
    for (const s of this.servers) if (!s.isGroup) s.delay = res[s.name] ?? 0
    await this.refreshServers()
    for (const s of this.servers) if (!s.isGroup) s.delay = res[s.name] ?? 0
    // У группы «Авто» задержка = задержка выбранного ею сервера
    for (const s of this.servers) if (s.isGroup && this.effective) s.delay = res[this.effective] ?? s.delay
    this.emitState()
  }

  async selectFastest(silent = false): Promise<string | undefined> {
    await this.testDelays()
    const best = this.servers.filter(s => !s.isGroup && s.delay && s.delay > 0).sort((a, b) => a.delay! - b.delay!)[0]
    if (!best) {
      if (!silent) throw new Error('Ни один сервер сейчас не отвечает')
      return
    }
    await this.selectServer(best.name)
    return best.name
  }

  // ---------- профили и настройки ----------

  async onProfilesChanged(reloadIfActive = true) {
    if (!store.state.activeProfileId) {
      if (this.status !== 'disconnected') await this.disconnect()
      await this.core.stop()
      await this.refreshServers()
      return
    }
    if (!reloadIfActive) return this.emitState()
    await this.serial(async () => {
      if (this.core.running) {
        const path = this.writeRuntime(this.connectedTun && this.status !== 'disconnected')
        await this.core.test(path)
        await this.core.reload(path)
        await this.applySavedSelection()
        await this.closeConnections()
      } else {
        await this.startIdle()
      }
    })
    this.emitState()
  }

  async setActiveProfile(id: string) {
    store.update(s => { s.activeProfileId = id })
    this.servers = []
    await this.onProfilesChanged()
  }

  async setSettings(patch: Partial<Settings>): Promise<{ needAdmin?: boolean }> {
    const prev = { ...this.settings }
    store.update(s => { s.settings = { ...s.settings, ...patch } })
    const next = this.settings

    // Режим и исключения меняют правила маршрутизации — перезагружаем конфигурацию ядра на лету
    const routing = (['mode', 'bypassRu', 'bypassDomains', 'bypassApps'] as const).some(k => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(prev[k]))
    if (routing && this.core.running) {
      await this.serial(async () => {
        const path = this.writeRuntime(this.connectedTun && this.status !== 'disconnected')
        await this.core.test(path)
        await this.core.reload(path)
        await this.applySavedSelection()
        await this.closeConnections()
      })
      log.info(`Режим: ${next.mode === 'smart' ? 'умный' : 'весь трафик через VPN'}, исключений: сайтов ${next.bypassDomains.length}, программ ${next.bypassApps.length}`)
    }
    if (patch.connection && patch.connection !== prev.connection) {
      if (next.connection === 'tun' && !this.isAdmin) {
        this.emitState()
        return { needAdmin: true }
      }
      if (this.status === 'connected') {
        await this.disconnect()
        await this.connect()
      }
    }
    if ((patch.autostart !== undefined && patch.autostart !== prev.autostart) || (patch.connection && patch.connection !== prev.connection)) {
      try {
        await sys.applyAutostart(next.autostart, next.connection === 'tun')
      } catch (e) {
        log.error(`Автозапуск: ${(e as Error).message}`)
      }
    }
    this.emitState()
    return {}
  }

  private async autoUpdateSubscriptions() {
    if (!this.settings.autoUpdateSubscriptions) return
    for (const p of profiles.dueSubscriptions()) {
      try {
        await profiles.updateProfile(p.id)
        if (p.id === store.state.activeProfileId) await this.onProfilesChanged()
      } catch (e) {
        log.warn(`Автообновление подписки «${p.name}»: ${(e as Error).message}`)
      }
    }
    this.emitState()
  }

  // ---------- статистика ----------

  private resetSessionTraffic() {
    this.sessionBase = this.lastTotals ? { up: this.lastTotals.up, down: this.lastTotals.down } : { up: 0, down: 0 }
  }

  /**
   * Статистика приходит потоком от ядра (/traffic — одна короткая строка в секунду),
   * вместо ежесекундного запроса полного списка соединений.
   */
  private streamTraffic() {
    if (this.trafficStop || !this.core.running) return
    this.trafficStop = this.core.stream('/traffic', line => {
      let r: { up: number; down: number; upTotal?: number; downTotal?: number }
      try {
        r = JSON.parse(line)
      } catch {
        return
      }
      const t = Date.now()
      // Общие счётчики есть в новых версиях ядра; если нет — накапливаем сами
      const prev = this.lastTotals
      const up = r.upTotal ?? (prev?.up ?? 0) + r.up
      const down = r.downTotal ?? (prev?.down ?? 0) + r.down
      // Счётчики ядра обнуляются после его перезапуска
      if (prev && (up < prev.up || down < prev.down)) this.sessionBase = { up: 0, down: 0 }
      this.lastTotals = { up, down, t }
      const on = this.status === 'connected'
      const sample: TrafficSample = {
        up: on ? r.up : 0,
        down: on ? r.down : 0,
        upTotal: on ? Math.max(0, up - this.sessionBase.up) : 0,
        downTotal: on ? Math.max(0, down - this.sessionBase.down) : 0,
        t
      }
      this.emit('traffic', sample)
    }, () => {
      // Поток оборвался (перезапуск ядра) — переподключаемся
      this.trafficStop = undefined
      setTimeout(() => this.streamTraffic(), 2000)
    })
  }

  async connections(): Promise<ConnectionItem[]> {
    if (!this.core.running) return []
    const r = await this.core.api<{ connections: { id: string; metadata: { host: string; destinationIP: string; destinationPort: string; network: string }; chains: string[]; rule: string; rulePayload: string; upload: number; download: number; start: string }[] | null }>('GET', '/connections')
    return (r.connections ?? []).map(c => ({
      id: c.id,
      host: `${c.metadata.host || c.metadata.destinationIP}:${c.metadata.destinationPort}`,
      network: c.metadata.network,
      chain: [...c.chains].reverse().join(' → '),
      rule: c.rulePayload ? `${c.rule}(${c.rulePayload})` : c.rule,
      upload: c.upload,
      download: c.download,
      start: c.start
    }))
  }

  async rules(): Promise<{ type: string; payload: string; proxy: string }[]> {
    if (!this.core.running) return []
    const r = await this.core.api<{ rules: { type: string; payload: string; proxy: string }[] }>('GET', '/rules')
    return r.rules ?? []
  }

  closeConnection(id: string) {
    return this.core.api('DELETE', `/connections/${encodeURIComponent(id)}`)
  }
}
