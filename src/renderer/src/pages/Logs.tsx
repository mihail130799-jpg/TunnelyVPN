import { useEffect, useRef, useState } from 'react'
import type { ConnectionItem, LogLine } from '@shared/types'
import { Icon, Segmented } from '../components'
import { bytesText } from '../format'
import { act } from '../toast'

type Tab = 'logs' | 'conns' | 'rules'

export function LogsPage() {
  const [tab, setTab] = useState<Tab>('logs')
  return (
    <section className="page logs-page">
      <div className="head">
        <h1>Журнал и правила</h1>
        <div className="grow" />
        <Segmented<Tab> value={tab} onChange={setTab} options={[['logs', 'Журнал'], ['conns', 'Соединения'], ['rules', 'Правила']]} />
      </div>
      {tab === 'logs' && <LogView />}
      {tab === 'conns' && <ConnView />}
      {tab === 'rules' && <RuleView />}
    </section>
  )
}

function LogView() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [level, setLevel] = useState<'all' | 'warn'>('all')
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    void window.tunnely.logs().then(setLines)
    return window.tunnely.onLog(l => setLines(prev => [...prev.slice(-1499), l]))
  }, [])
  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  })

  const shown = level === 'all' ? lines : lines.filter(l => l.level === 'warning' || l.level === 'error')
  return (
    <>
      <div className="toolbar">
        <Segmented value={level} onChange={setLevel} options={[['all', 'Все'], ['warn', 'Предупреждения и ошибки']]} />
        <div className="grow" />
        <button className="btn ghost small" onClick={() => window.tunnely.openLogsFolder()}>
          <Icon.file /> Открыть папку журналов
        </button>
      </div>
      <div
        className="logbox"
        ref={box}
        onScroll={e => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30
        }}
      >
        {shown.length === 0 && <div className="muted">Журнал пуст</div>}
        {shown.map((l, i) => (
          <div key={i} className={`logline ${l.level}`}>
            <span className="lt">{new Date(l.t).toLocaleTimeString('ru-RU')}</span>
            <span className="ls">{l.source === 'core' ? 'ядро' : 'app'}</span>
            <span className="lm">{l.text}</span>
          </div>
        ))}
      </div>
      <p className="muted small-note">Ключи, пароли и адреса подписок в журнал не записываются.</p>
    </>
  )
}

function ConnView() {
  const [list, setList] = useState<ConnectionItem[]>([])
  useEffect(() => {
    let alive = true
    const load = async () => {
      const r = await window.tunnely.connections()
      if (alive && r.ok) setList(r.data ?? [])
    }
    void load()
    const t = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Адрес</th>
            <th>Через</th>
            <th>Правило</th>
            <th>↓</th>
            <th>↑</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Нет активных соединений
              </td>
            </tr>
          )}
          {list.map(c => (
            <tr key={c.id}>
              <td className="mono">{c.host}</td>
              <td>{c.chain}</td>
              <td className="muted">{c.rule}</td>
              <td>{bytesText(c.download)}</td>
              <td>{bytesText(c.upload)}</td>
              <td>
                <button className="icon-btn" title="Закрыть соединение" onClick={() => act(window.tunnely.closeConnection(c.id))}>
                  <Icon.x />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RuleView() {
  const [rules, setRules] = useState<{ type: string; payload: string; proxy: string }[]>([])
  useEffect(() => {
    void window.tunnely.rules().then(r => r.ok && setRules(r.data ?? []))
  }, [])
  return (
    <div className="table-wrap">
      <p className="muted small-note">Правила маршрутизации приходят из вашей подписки и применяются в режиме «По правилам».</p>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Тип</th>
            <th>Условие</th>
            <th>Куда</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Нет правил
              </td>
            </tr>
          )}
          {rules.map((r, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              <td>{r.type}</td>
              <td className="mono">{r.payload || '—'}</td>
              <td>{r.proxy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
