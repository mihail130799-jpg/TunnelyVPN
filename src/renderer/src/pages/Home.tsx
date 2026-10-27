import { useEffect, useRef, useState } from 'react'
import type { AppState } from '@shared/types'
import { cleanName } from '@shared/country'
import { Flag, Icon, Spinner, TunnelButton } from '../components'
import { useNow, useTraffic } from '../state'
import { act, toast } from '../toast'
import { countryName, duration, formatBytes, protoLabel, speedText } from '../format'
import type { Page } from '../App'

const STATUS: Record<AppState['status'], [string, string]> = {
  disconnected: ['Не защищено', 'Нажмите, чтобы подключиться'],
  connecting: ['Устанавливаем тоннель', 'Подключение…'],
  connected: ['Подключено', 'Защищено'],
  reconnecting: ['Восстанавливаем связь', 'Переподключение…'],
  disconnecting: ['Отключение', 'Отключение…']
}

export function serverTitle(name: string, country?: string, isGroup?: boolean) {
  if (isGroup) return 'Автовыбор'
  return countryName(country) ?? cleanName(name)
}

export function HomePage({ s, onToggle, go, onAdd }: { s: AppState; onToggle: () => void; go: (p: Page) => void; onAdd: () => void }) {
  const t = useTraffic()
  const on = s.status === 'connected' || s.status === 'reconnecting'
  const now = useNow(on)
  const [pill, title] = STATUS[s.status]
  const [pasting, setPasting] = useState(false)
  const empty = s.profiles.length === 0

  const sel = s.servers.find(x => x.name === s.selected)
  const eff = s.servers.find(x => x.name === s.effectiveServer)
  const shown = sel?.isGroup ? eff ?? sel : sel

  async function paste() {
    setPasting(true)
    const r = await act(window.tunnely.addFromClipboard())
    setPasting(false)
    if (r) toast(`Добавлено: ${r.name}`, 'ok')
  }

  const down = speedText(t.down)
  const up = speedText(t.up)
  const total = formatBytes(t.upTotal + t.downTotal)
  const latency = shown?.delay && shown.delay > 0 ? shown.delay : undefined

  return (
    <section className="page home">
      <div className="home-top">
        <span className="pill">
          <i className="dot" />
          {pill}
        </span>
        <button className="btn ghost small paste-btn" onClick={paste} disabled={pasting} title="Добавить ключ или подписку, скопированные в буфер обмена">
          {pasting ? <Spinner /> : <Icon.paste />} Вставить ключ из буфера
        </button>
      </div>

      <TunnelButton status={s.status} onClick={onToggle} disabled={s.status === 'connecting' || s.status === 'disconnecting'} />

      <div className="state-text">{empty ? 'Добавьте ключ, чтобы начать' : title}</div>
      <div className="timer">{on && s.connectedAt ? duration(now - s.connectedAt) : s.error ? '' : ' '}</div>
      {s.error && <div className="error-banner">{s.error}</div>}
      {!s.error && s.status === 'connected' && shown?.delay === 0 && (
        <div className="error-banner">Сервер не отвечает. Tunnely пробует восстановить связь — можно также выбрать другой сервер.</div>
      )}

      {empty ? (
        <div className="empty-card">
          <p>
            Скопируйте ключ или ссылку на подписку, которые вы получили, и нажмите кнопку ниже.
          </p>
          <div className="row-actions">
            <button className="btn" onClick={paste} disabled={pasting}>
              <Icon.paste /> Вставить ключ из буфера
            </button>
            <button className="btn ghost" onClick={onAdd}>
              Другие способы
            </button>
          </div>
        </div>
      ) : (
        <>
          <ServerPicker s={s} go={go} />
          <div className="stats">
            <div className="stat">
              <small>
                <span className="down">↓</span> Загрузка
              </small>
              <b>
                {down.value} <em>{down.unit}</em>
              </b>
            </div>
            <div className="stat">
              <small>
                <span className="up">↑</span> Отдача
              </small>
              <b>
                {up.value} <em>{up.unit}</em>
              </b>
            </div>
            <div className="stat">
              <small>Трафик за сеанс</small>
              <b>
                {total.value} <em>{total.unit}</em>
              </b>
            </div>
            <div className="stat">
              <small>Задержка</small>
              <b>
                {latency ?? '—'} <em>мс</em>
              </b>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function ServerPicker({ s, go }: { s: AppState; go: (p: Page) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const sel = s.servers.find(x => x.name === s.selected)
  const eff = s.servers.find(x => x.name === s.effectiveServer)
  const shown = sel?.isGroup ? eff ?? sel : sel

  if (!s.servers.length) {
    return (
      <div className="server-card" onClick={() => go('servers')}>
        <Flag />
        <div>
          <div className="name">{s.coreRunning ? 'Загрузка серверов…' : 'Серверы недоступны'}</div>
          <div className="proto">Проверьте подписку</div>
        </div>
      </div>
    )
  }

  return (
    <div className="picker" ref={ref}>
      <div className={`server-card ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <Flag code={shown?.country} group={!shown || shown.isGroup} />
        <div className="grow">
          <div className="name">{shown ? serverTitle(shown.name, shown.country, shown.isGroup) : 'Сервер не выбран'}</div>
          <div className="proto">
            {sel?.isGroup ? `Автовыбор · ${eff ? cleanName(eff.name) : 'самый быстрый'}` : shown ? `${cleanName(shown.name)} · ${protoLabel(shown.type)}` : ''}
          </div>
        </div>
        {shown?.delay ? <span className={`ping ${shown.delay > 150 ? 'mid' : ''}`}>{shown.delay} мс</span> : null}
        <span className={`chev ${open ? 'up' : ''}`}>
          <Icon.chevron />
        </span>
      </div>
      {open && (
        <div className="dropdown">
          {s.servers.map(x => (
            <button
              key={x.name}
              className={`dd-item ${x.name === s.selected ? 'sel' : ''}`}
              onClick={async () => {
                setOpen(false)
                await act(window.tunnely.selectServer(x.name))
              }}
            >
              <Flag code={x.country} group={x.isGroup} />
              <span className="grow">
                <span className="name">{serverTitle(x.name, x.country, x.isGroup)}</span>
                <span className="proto">{x.isGroup ? 'самый быстрый сервер' : cleanName(x.name)}</span>
              </span>
              {x.delay ? <span className={`lat ${x.delay < 80 ? '' : x.delay < 150 ? 'mid' : 'bad'}`}>{x.delay} мс</span> : null}
              {x.name === s.selected && (
                <span className="tick">
                  <Icon.check />
                </span>
              )}
            </button>
          ))}
          <button className="dd-more" onClick={() => go('servers')}>
            Все серверы и проверка задержки →
          </button>
        </div>
      )}
    </div>
  )
}
