import { useState } from 'react'
import type { AppState } from '@shared/types'
import { cleanName } from '@shared/country'
import { Flag, Icon, Spinner } from '../components'
import { act, toast } from '../toast'
import { protoLabel, plural } from '../format'
import { serverTitle } from './Home'
import type { Page } from '../App'

export function ServersPage({ s, go }: { s: AppState; go: (p: Page) => void }) {
  const [q, setQ] = useState('')
  const [testing, setTesting] = useState(false)
  const [fast, setFast] = useState(false)
  const profile = s.profiles.find(p => p.id === s.activeProfileId)

  const list = s.servers.filter(x => {
    if (!q.trim()) return true
    const hay = `${x.name} ${serverTitle(x.name, x.country, x.isGroup)}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })
  const count = s.servers.filter(x => !x.isGroup).length

  return (
    <section className="page servers">
      <div className="head">
        <h1>Серверы</h1>
        <div className="grow" />
        <input className="input search" placeholder="Поиск страны или сервера" value={q} onChange={e => setQ(e.target.value)} />
        <button
          className="btn ghost"
          disabled={testing || !s.servers.length}
          onClick={async () => {
            setTesting(true)
            await act(window.tunnely.testDelays())
            setTesting(false)
          }}
        >
          {testing ? <Spinner /> : <Icon.refresh />} Проверить задержку
        </button>
        <button
          className="btn"
          disabled={fast || !s.servers.length}
          onClick={async () => {
            setFast(true)
            const name = await act(window.tunnely.selectFastest())
            setFast(false)
            if (name) {
              toast(`Выбран самый быстрый: ${cleanName(name)}`, 'ok')
              go('home')
            }
          }}
        >
          {fast ? <Spinner /> : <Icon.bolt />} Самый быстрый
        </button>
      </div>


      {profile ? (
        <div className="group-title">
          {profile.name} · {count} {plural(count, 'сервер', 'сервера', 'серверов')}
        </div>
      ) : (
        <div className="empty-card">Сначала добавьте ключ или подписку в разделе «Подписки».</div>
      )}

      <div className="grid">
        {list.map((x, i) => (
          <button
            key={x.name}
            className={`srv ${x.name === s.selected ? 'sel' : ''}`}
            style={{ animationDelay: `${i * 35}ms` }}
            onClick={() => act(window.tunnely.selectServer(x.name))}
          >
            <Flag code={x.country} group={x.isGroup} />
            <div className="grow">
              <div className="name">{serverTitle(x.name, x.country, x.isGroup)}</div>
              <div className="proto">{x.isGroup ? 'Самый быстрый сервер автоматически' : `${cleanName(x.name)} · ${protoLabel(x.type)}`}</div>
            </div>
            {x.delay === 0 ? (
              <span className="lat bad">нет связи</span>
            ) : x.delay ? (
              <span className={`lat ${x.delay < 80 ? '' : x.delay < 150 ? 'mid' : 'bad'}`}>{x.delay} мс</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  )
}
