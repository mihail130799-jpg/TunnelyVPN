// Управление процессом ядра Mihomo и его локальным API (127.0.0.1, доступ по случайному секрету).
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { coreExe, coreHome } from './paths'
import { log } from './logger'

const run = promisify(execFile)

export async function freePort(preferred?: number[]): Promise<number> {
  const tryPort = (p: number) =>
    new Promise<number>((resolve, reject) => {
      const s = createServer()
      s.once('error', reject)
      s.listen(p, '127.0.0.1', () => {
        const port = (s.address() as { port: number }).port
        s.close(() => resolve(port))
      })
    })
  for (const p of preferred ?? []) {
    try {
      return await tryPort(p)
    } catch {
      /* занят */
    }
  }
  return tryPort(0)
}

export class MihomoCore extends EventEmitter {
  private proc?: ChildProcess
  private stopping = false
  controllerPort = 0
  mixedPort = 0
  secret = randomBytes(16).toString('hex')
  version?: string

  get running() {
    return !!this.proc && this.proc.exitCode === null
  }

  get pid() {
    return this.proc?.pid
  }

  async allocatePorts() {
    if (!this.mixedPort) this.mixedPort = await freePort([7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897])
    if (!this.controllerPort) this.controllerPort = await freePort([9097, 9098, 9099])
  }

  async readVersion(): Promise<string | undefined> {
    try {
      const { stdout } = await run(coreExe(), ['-v'], { windowsHide: true, timeout: 10000 })
      this.version = stdout.match(/v\d+\.\d+\.\d+/)?.[0]
    } catch {
      /* пропускаем */
    }
    return this.version
  }

  /** Проверка конфигурации до запуска: ядро само скажет, что не так */
  async test(configPath: string): Promise<void> {
    try {
      await run(coreExe(), ['-d', coreHome(), '-f', configPath, '-t'], { windowsHide: true, timeout: 30000 })
    } catch (e) {
      const out = `${(e as { stdout?: string }).stdout ?? ''}\n${(e as { stderr?: string }).stderr ?? ''}`
      const msg = out.split(/\r?\n/).find(l => /error|fatal|failed/i.test(l)) ?? (e as Error).message
      throw new Error(`Ядро не приняло конфигурацию: ${msg.replace(/^.*?msg="?/, '').replace(/"$/, '')}`)
    }
  }

  async start(configPath: string): Promise<void> {
    if (this.running) await this.stop()
    this.stopping = false
    log.info('Запуск ядра Mihomo')
    const proc = spawn(coreExe(), ['-d', coreHome(), '-f', configPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = proc
    const onData = (buf: Buffer) => {
      for (const raw of buf.toString().split(/\r?\n/)) {
        if (!raw.trim()) continue
        const level = (raw.match(/level=(\w+)/)?.[1] ?? 'info') as 'info'
        const msg = raw.match(/msg="((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\"/g, '"') ?? raw
        log.write(level === ('warn' as string) ? 'warning' : level, 'core', msg)
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.once('exit', code => {
      if (this.proc === proc) this.proc = undefined
      if (!this.stopping) {
        log.error(`Ядро неожиданно завершилось (код ${code})`)
        this.emit('crash', code)
      }
    })
    proc.once('error', e => log.error(`Не удалось запустить ядро: ${e.message}`))
    await this.waitReady()
    this.emit('started', proc.pid)
  }

  private async waitReady() {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      if (!this.running) throw new Error('Ядро завершилось при запуске. Подробности — в разделе «Журнал».')
      try {
        await this.api('GET', '/version')
        return
      } catch {
        await new Promise(r => setTimeout(r, 200))
      }
    }
    throw new Error('Ядро не отвечает')
  }

  async stop(): Promise<void> {
    const p = this.proc
    if (!p) return
    this.stopping = true
    await new Promise<void>(resolve => {
      const t = setTimeout(() => {
        try {
          p.kill('SIGKILL')
        } catch {
          /* уже завершён */
        }
        resolve()
      }, 3000)
      p.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
      p.kill()
    })
    this.proc = undefined
    log.info('Ядро остановлено')
  }

  async api<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = 10000): Promise<T> {
    const res = await fetch(`http://127.0.0.1:${this.controllerPort}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  /** Потоковый запрос к API ядра: onLine вызывается на каждую строку ответа. Возвращает функцию остановки */
  stream(path: string, onLine: (line: string) => void, onEnd: () => void): () => void {
    const ctrl = new AbortController()
    let stopped = false
    void (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.controllerPort}${path}`, {
          headers: { Authorization: `Bearer ${this.secret}` },
          signal: ctrl.signal
        })
        if (!res.ok || !res.body) throw new Error(`API ${res.status}`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let i
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim()
            buf = buf.slice(i + 1)
            if (line) onLine(line)
          }
        }
      } catch {
        /* ядро остановлено или перезапускается */
      }
      if (!stopped) onEnd()
    })()
    return () => {
      stopped = true
      ctrl.abort()
    }
  }

  reload(configPath: string) {
    return this.api('PUT', '/configs?force=true', { path: configPath }, 30000)
  }
}
