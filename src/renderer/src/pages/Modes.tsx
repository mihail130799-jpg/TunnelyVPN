import { useState } from 'react'
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

export function ModesPage({ s }: { s: AppState }) {
  const st = s.settings
  const smart = st.mode === 'smart'
  const [domain, setDomain] = useState('')
  const [picker, setPicker] = useState(false)

  const set = (patch: Partial<Settings>, msg?: string) => act(window.tunnely.setSettings(patch), msg)

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
    const next = [...new Set([...st.bypassDomains, ...ok])]
    if (next.length !== st.bypassDomains.length) {
      void set({ bypassDomains: next }, ok.length === 1 ? `${ok[0]} теперь открывается без VPN` : 'Сайты добавлены в исключения')
      setDomain('')
    } else if (ok.length) setDomain('')
  }

  function addApps(names: string[]) {
    const next = [...new Set([...st.bypassApps, ...names])]
    if (next.length !== st.bypassApps.length) void set({ bypassApps: next }, 'Программы добавлены в исключения')
  }

  return (
    <section className="page modes">
      <div className="head">
        <h1>Режимы</h1>
      </div>
      <div className="modes-scroll">
        <div className="mode-cards">
          <button className={`mode-card ${smart ? 'sel' : ''}`} onClick={() => !smart && set({ mode: 'smart' }, 'Включён умный режим')}>
            <div className="mode-ico">
              <Icon.route />
            </div>
            <div className="grow">
              <div className="mode-title">
                Умный режим <span className="mode-num">Режим 1</span>
              </div>
              <div className="mode-desc">Зарубежные сайты и сервисы работают через VPN. Российские сайты и выбранные вами сайты и программы — напрямую, в обход VPN.</div>
            </div>
            <span className="radio" />
          </button>
          <button className={`mode-card ${!smart ? 'sel' : ''}`} onClick={() => smart && set({ mode: 'all' }, 'Весь трафик идёт через VPN')}>
            <div className="mode-ico">
              <Icon.shield />
            </div>
            <div className="grow">
              <div className="mode-title">
                Весь трафик через VPN <span className="mode-num">Режим 2</span>
              </div>
              <div className="mode-desc">Все сайты и программы работают только через VPN, без исключений.</div>
            </div>
            <span className="radio" />
          </button>
        </div>

        <div className={`bypass ${smart ? '' : 'dim'}`}>
          {!smart && <div className="note">Исключения действуют только в умном режиме.</div>}

          <div className="group-title">Исключения — работают без VPN</div>
          <div className="scard">
            <div className="srow">
              <div className="grow">
                <div className="stitle">Российские сайты и сервисы</div>
                <div className="shint">Сайты в зонах .ru, .рф, .su, а также Яндекс, VK, Госуслуги, банки, маркетплейсы и другие популярные сервисы РФ, которые часто не открываются из-за рубежа.</div>
              </div>
              <Toggle checked={st.bypassRu} onChange={v => set({ bypassRu: v })} disabled={!smart} />
            </div>
          </div>

          <div className="group-title">Сайты</div>
          <div className="scard pad">
            <div className="add-row">
              <input
                className="input"
                placeholder="Например: example.com или сайт.рф"
                value={domain}
                disabled={!smart}
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDomains(domain)}
              />
              <button className="btn" disabled={!smart || !domain.trim()} onClick={() => addDomains(domain)}>
                <Icon.plus /> Добавить
              </button>
            </div>
            <p className="shint">Поддомены тоже попадут в исключение: example.com включает www.example.com и m.example.com.</p>
            <Chips items={st.bypassDomains} empty="Своих сайтов-исключений пока нет" onRemove={d => set({ bypassDomains: st.bypassDomains.filter(x => x !== d) })} />
          </div>

          <div className="group-title">Программы</div>
          <div className="scard pad">
            <div className="add-row">
              <button className="btn" disabled={!smart} onClick={() => setPicker(true)}>
                <Icon.plus /> Из запущенных
              </button>
              <button
                className="btn ghost"
                disabled={!smart}
                onClick={async () => {
                  const r = await act(window.tunnely.pickApp())
                  if (r?.length) addApps(r)
                }}
              >
                <Icon.file /> Выбрать файл .exe
              </button>
            </div>
            <p className="shint">
              Выбранные программы будут выходить в интернет напрямую.
              {st.connection !== 'tun' && ' Совет: для программ, которые не используют системный прокси (игры, торрент-клиенты), включите способ подключения TUN в настройках.'}
            </p>
            <Chips items={st.bypassApps} empty="Программ-исключений пока нет" onRemove={a => set({ bypassApps: st.bypassApps.filter(x => x !== a) })} />
          </div>
        </div>
      </div>
      {picker && <RunningAppsModal onClose={() => setPicker(false)} onPick={addApps} existing={st.bypassApps} />}
    </section>
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
