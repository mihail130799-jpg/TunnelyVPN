import { useState, type ReactElement } from 'react'
import type { AppState, Settings } from '@shared/types'
import { Icon, Modal, Spinner, Toggle } from '../components'
import { act, toast } from '../toast'

/** «https://www.Сайт.рф/путь» → «сайт.рф» */
function cleanDomain(input: string): string | undefined {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\*\.|^\.|^www\./, '')
  return /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u.test(s) ? s : undefined
}

type ListKeys = { domains: 'bypassDomains' | 'vpnDomains'; apps: 'bypassApps' | 'vpnApps' }

const MODES: { id: Settings['mode']; num: string; title: string; desc: string; icon: () => ReactElement }[] = [
  {
    id: 'smart',
    num: 'Режим 1',
    title: 'Умный режим',
    desc: 'Для тех, кто в России. Зарубежные сайты — через VPN, российские сайты и выбранные вами сайты и программы — напрямую.',
    icon: Icon.route
  },
  {
    id: 'all',
    num: 'Режим 2',
    title: 'Весь трафик через VPN',
    desc: 'Все сайты и программы работают только через VPN, без исключений.',
    icon: Icon.shield
  },
  {
    id: 'ru',
    num: 'Режим 3',
    title: 'Только российские сайты через VPN',
    desc: 'Для тех, кто за границей. Российские сайты, банки и Госуслуги — через VPN, остальное — напрямую и быстро.',
    icon: Icon.home
  }
]

export function ModesPage({ s }: { s: AppState }) {
  const st = s.settings
  const set = (patch: Partial<Settings>, msg?: string) => act(window.tunnely.setSettings(patch), msg)

  return (
    <section className="page modes">
      <div className="head">
        <h1>Режимы</h1>
      </div>
      <div className="modes-scroll">
        <div className="mode-cards">
          {MODES.map(m => (
            <button key={m.id} className={`mode-card ${st.mode === m.id ? 'sel' : ''}`} onClick={() => st.mode !== m.id && set({ mode: m.id }, `Включён режим «${m.title}»`)}>
              <div className="mode-ico">
                <m.icon />
              </div>
              <div className="grow">
                <div className="mode-title">
                  {m.title} <span className="mode-num">{m.num}</span>
                </div>
                <div className="mode-desc">{m.desc}</div>
              </div>
              <span className="radio" />
            </button>
          ))}
        </div>

        {st.mode === 'smart' && (
          <div className="bypass">
            <div className="group-title">Работают без VPN</div>
            <div className="scard">
              <div className="srow">
                <div className="grow">
                  <div className="stitle">Российские сайты и сервисы</div>
                  <div className="shint">Сайты в зонах .ru, .рф, .su, а также Яндекс, VK, Госуслуги, банки, маркетплейсы и другие популярные сервисы РФ, которые часто не открываются из-за рубежа.</div>
                </div>
                <Toggle checked={st.bypassRu} onChange={v => set({ bypassRu: v })} />
              </div>
            </div>
            <ListEditor s={s} keys={{ domains: 'bypassDomains', apps: 'bypassApps' }} direct />
          </div>
        )}

        {st.mode === 'ru' && (
          <div className="bypass">
            <div className="group-title">Работают через VPN</div>
            <div className="scard">
              <div className="srow">
                <div className="grow">
                  <div className="stitle">Российские сайты и сервисы — всегда через VPN</div>
                  <div className="shint">Сайты в зонах .ru, .рф, .su, Яндекс, VK, Госуслуги, банки, маркетплейсы и другие популярные сервисы РФ. Всё остальное идёт напрямую.</div>
                </div>
                <span className="badge">Включено</span>
              </div>
            </div>
            <ListEditor s={s} keys={{ domains: 'vpnDomains', apps: 'vpnApps' }} />
          </div>
        )}

        {st.mode === 'all' && <div className="note">В этом режиме исключений нет: весь трафик компьютера идёт через выбранный сервер.</div>}
      </div>
    </section>
  )
}

/** Списки своих сайтов и программ: в обход VPN (direct) или только через VPN */
function ListEditor({ s, keys, direct }: { s: AppState; keys: ListKeys; direct?: boolean }) {
  const st = s.settings
  const domains = st[keys.domains]
  const apps = st[keys.apps]
  const [domain, setDomain] = useState('')
  const [picker, setPicker] = useState(false)
  const set = (patch: Partial<Settings>, msg?: string) => act(window.tunnely.setSettings(patch), msg)
  const where = direct ? 'без VPN' : 'через VPN'

  function addDomains(raw: string) {
    const parts = raw.split(/[\s,;]+/).filter(Boolean)
    const ok: string[] = []
    const bad: string[] = []
    for (const p of parts) {
      const d = cleanDomain(p)
      if (d) ok.push(d)
      else bad.push(p)
    }
    if (bad.length) toast(`Не похоже на адрес сайта: ${bad.join(', ')}`, 'error')
    const next = [...new Set([...domains, ...ok])]
    if (next.length !== domains.length) void set({ [keys.domains]: next }, ok.length === 1 ? `${ok[0]} теперь открывается ${where}` : `Сайты будут открываться ${where}`)
    if (ok.length) setDomain('')
  }

  function addApps(names: string[]) {
    const next = [...new Set([...apps, ...names])]
    if (next.length !== apps.length) void set({ [keys.apps]: next }, `Программы будут работать ${where}`)
  }

  return (
    <>
      <div className="group-title">Сайты {where}</div>
      <div className="scard pad">
        <div className="add-row">
          <input
            className="input"
            placeholder={direct ? 'Например: example.com или сайт.рф' : 'Например: chatgpt.com'}
            value={domain}
            onChange={e => setDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDomains(domain)}
          />
          <button className="btn" disabled={!domain.trim()} onClick={() => addDomains(domain)}>
            <Icon.plus /> Добавить
          </button>
        </div>
        <p className="shint">Поддомены тоже учитываются: example.com включает www.example.com и m.example.com.</p>
        <Chips items={domains} empty={direct ? 'Своих сайтов-исключений пока нет' : 'Своих сайтов пока нет'} onRemove={d => set({ [keys.domains]: domains.filter(x => x !== d) })} />
      </div>

      <div className="group-title">Программы {where}</div>
      <div className="scard pad">
        <div className="add-row">
          <button className="btn" onClick={() => setPicker(true)}>
            <Icon.plus /> Из запущенных
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              const r = await act(window.tunnely.pickApp())
              if (r?.length) addApps(r)
            }}
          >
            <Icon.file /> Выбрать файл .exe
          </button>
        </div>
        <p className="shint">
          {direct
            ? 'Выбранные программы будут выходить в интернет напрямую.'
            : 'Весь интернет-трафик выбранных программ пойдёт через VPN — например, приложение банка или клиент онлайн-кинотеатра.'}
          {st.connection !== 'tun' && ' Совет: для программ, которые не используют системный прокси (игры, торрент-клиенты, многие приложения), включите способ подключения TUN в настройках.'}
        </p>
        <Chips items={apps} empty={direct ? 'Программ-исключений пока нет' : 'Программ пока нет'} onRemove={a => set({ [keys.apps]: apps.filter(x => x !== a) })} />
      </div>
      {picker && <RunningAppsModal onClose={() => setPicker(false)} onPick={addApps} existing={apps} />}
    </>
  )
}

function Chips({ items, empty, onRemove }: { items: string[]; empty: string; onRemove: (v: string) => void }) {
  if (!items.length) return <div className="muted chips-empty">{empty}</div>
  return (
    <div className="chips">
      {items.map(i => (
        <span key={i} className="chip">
          {i}
          <button onClick={() => onRemove(i)} aria-label={`Убрать ${i}`} title="Убрать из исключений">
            <Icon.x />
          </button>
        </span>
      ))}
    </div>
  )
}

function RunningAppsModal({ onClose, onPick, existing }: { onClose: () => void; onPick: (names: string[]) => void; existing: string[] }) {
  const [apps, setApps] = useState<{ exe: string; title: string }[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  useState(() => {
    void window.tunnely.runningApps().then(r => setApps(r.ok ? r.data ?? [] : []))
  })
  return (
    <Modal title="Запущенные программы" onClose={onClose}>
      <p className="muted">Отметьте программы, которые должны работать без VPN.</p>
      <div className="app-list">
        {apps === null && (
          <div className="muted center">
            <Spinner /> Загружаем список…
          </div>
        )}
        {apps?.length === 0 && <div className="muted">Не найдено программ с открытыми окнами</div>}
        {apps?.map(a => {
          const already = existing.includes(a.exe)
          const on = already || chosen.has(a.exe)
          return (
            <button
              key={a.exe}
              className={`app-item ${on ? 'on' : ''}`}
              disabled={already}
              onClick={() =>
                setChosen(prev => {
                  const n = new Set(prev)
                  if (n.has(a.exe)) n.delete(a.exe)
                  else n.add(a.exe)
                  return n
                })
              }
            >
              <span className="check">{on && <Icon.check />}</span>
              <span className="grow">
                <span className="name">{a.exe}</span>
                <span className="proto">{already ? 'уже в исключениях' : a.title}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn"
          disabled={!chosen.size}
          onClick={() => {
            onPick([...chosen])
            onClose()
          }}
        >
          Добавить ({chosen.size})
        </button>
      </div>
    </Modal>
  )
}
