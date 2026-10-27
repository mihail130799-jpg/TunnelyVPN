// Процесс официального Xray: обслуживает серверы VLESS Reality (см. bridge.ts).
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createConnection } from 'node:net'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { coreHome, resourcesDir } from './paths'
import { XRAY_PROCESS } from './bridge'
import { log } from './logger'

const run = promisify(execFile)
export const xrayExe = () => join(resourcesDir(), 'core', XRAY_PROCESS)

function portOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = createConnection({ host: '127.0.0.1', port }, () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
    s.setTimeout(500, () => {
      s.destroy()
      resolve(false)
    })
  })
}

export class XrayProcess extends EventEmitter {
  private proc?: ChildProcess
  private stopping = false
  private lastConfig = ''
  version?: string
  /** Логин/пароль локальных SOCKS-входов: свои на каждый запуск приложения */
  readonly user = { name: 'tunnely', pass: randomBytes(16).toString('hex') }

  get running() {
    return !!this.proc && this.proc.exitCode === null
  }

  get pid() {
    return this.proc?.pid
  }

  async readVersion() {
    try {
      const { stdout } = await run(xrayExe(), ['version'], { windowsHide: true, timeout: 10000 })
      this.version = stdout.match(/Xray (\d+\.\d+\.\d+)/)?.[1]
    } catch {
      /* пропускаем */
    }
    return this.version
  }

  /** Применяет конфигурацию: запускает, перезапускает или останавливает Xray. Возвращает, когда входы готовы */
  async apply(config: Record<string, unknown> | null): Promise<void> {
    if (!config) {
      this.lastConfig = ''
      await this.stop()
      return
    }
    const text = JSON.stringify(config, null, 2)
    if (text === this.lastConfig && this.running) return
    const path = join(coreHome(), 'xray.json')
    writeFileSync(path, text)
    await this.check(path)
    await this.stop()
    this.lastConfig = text
    this.stopping = false
    const proc = spawn(xrayExe(), ['run', '-c', path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: coreHome() })
    this.proc = proc
    const onData = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const t = line.replace(/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d(\.\d+)? /, '').trim()
        if (!t) continue
        const level = /\[(Error)\]/i.test(t) ? 'error' : /\[(Warning)\]/i.test(t) ? 'warning' : 'info'
        log.write(level, 'core', `xray: ${t.replace(/^\[\w+\]\s*/, '')}`)
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.once('exit', code => {
      if (this.proc === proc) this.proc = undefined
      if (!this.stopping) {
        log.error(`Xray неожиданно завершился (код ${code})`)
        this.emit('crash', code)
      }
    })
    proc.once('error', e => log.error(`Не удалось запустить Xray: ${e.message}`))
    // Ждём, пока откроются все локальные входы
    const ports = ((config.inbounds as { port: number }[]) ?? []).map(i => i.port)
    const deadline = Date.now() + 10000
    for (;;) {
      if (!this.running) throw new Error('Xray завершился при запуске. Подробности — в разделе «Журнал».')
      const open = await Promise.all(ports.map(portOpen))
      if (open.every(Boolean)) break
      if (Date.now() > deadline) throw new Error('Xray не открыл локальные порты')
      await new Promise(r => setTimeout(r, 150))
    }
    log.info(`Xray запущен (серверов: ${ports.length})`)
    this.emit('started', proc.pid)
  }

  /** Проверка конфигурации до запуска */
  private async check(path: string) {
    try {
      await run(xrayExe(), ['run', '-test', '-c', path], { windowsHide: true, timeout: 20000, cwd: coreHome() })
    } catch (e) {
      const out = `${(e as { stdout?: string }).stdout ?? ''}\n${(e as { stderr?: string }).stderr ?? ''}`
      const msg = out.split(/\r?\n/).reverse().find(l => /fail|error|invalid/i.test(l)) ?? (e as Error).message
      throw new Error(`Xray не принял конфигурацию: ${msg.trim().slice(0, 200)}`)
    }
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
  }

  /** Повторный запуск с последней конфигурацией (после сбоя) */
  async restart() {
    if (!this.lastConfig) return
    const cfg = JSON.parse(this.lastConfig) as Record<string, unknown>
    this.lastConfig = ''
    await this.apply(cfg)
  }
}
