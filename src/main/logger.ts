// Журнал приложения. Секреты (адреса подписок, UUID, пароли, ключи) вырезаются до записи.
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type { LogLine } from '../shared/types'
import { logsDir } from './paths'

const MAX_FILE = 2 * 1024 * 1024
const MAX_MEMORY = 1500

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(https?:\/\/[^\s/]+\/)[^\s"']+/gi, '$1…'],
  [/\b(vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic|anytls|wireguard|wg):\/\/\S+/gi, '$1://…'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/((?:password|uuid|private-key|public-key|short-id|secret|token|pbk|sid)["']?\s*[:=]\s*)["']?[^\s,"'}&]+/gi, '$1<скрыто>']
]

export function redact(text: string): string {
  let t = text
  for (const [re, rep] of SECRET_PATTERNS) t = t.replace(re, rep)
  return t
}

class Logger extends EventEmitter {
  private lines: LogLine[] = []
  // Запись на диск пачками раз в секунду, а не отдельной синхронной операцией на каждую строку
  private pending: string[] = []
  private flushTimer?: NodeJS.Timeout

  private file() {
    return join(logsDir(), 'tunnely.log')
  }

  write(level: LogLine['level'], source: LogLine['source'], text: string) {
    const line: LogLine = { t: Date.now(), level, source, text: redact(text) }
    this.lines.push(line)
    if (this.lines.length > MAX_MEMORY) this.lines.splice(0, this.lines.length - MAX_MEMORY)
    this.emit('line', line)
    this.pending.push(`${new Date(line.t).toISOString()} [${source}/${level}] ${line.text}\n`)
    this.flushTimer ??= setTimeout(() => void this.flush(), 1000)
  }

  private rotate(f: string) {
    if (existsSync(f) && statSync(f).size > MAX_FILE) renameSync(f, f + '.old')
  }

  private async flush() {
    this.flushTimer = undefined
    if (!this.pending.length) return
    const chunk = this.pending.join('')
    this.pending = []
    try {
      const f = this.file()
      this.rotate(f)
      await appendFile(f, chunk)
    } catch {
      /* журнал не должен ронять приложение */
    }
  }

  /** Дописать остаток при выходе */
  flushSync() {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    if (!this.pending.length) return
    try {
      const f = this.file()
      this.rotate(f)
      appendFileSync(f, this.pending.join(''))
    } catch {
      /* пропускаем */
    }
    this.pending = []
  }

  info(t: string) { this.write('info', 'app', t) }
  warn(t: string) { this.write('warning', 'app', t) }
  error(t: string) { this.write('error', 'app', t) }
  recent() { return this.lines.slice() }
}

export const log = new Logger()
