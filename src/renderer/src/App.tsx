import { useEffect, useState, type ReactElement } from 'react'
import { useAppState } from './state'
import { Icon, LogoMark, Modal, Particles } from './components'
import { Toasts, act, toast } from './toast'
import { bytesText } from './format'
import { HomePage } from './pages/Home'
import { ServersPage } from './pages/Servers'
import { ProfilesPage } from './pages/Profiles'
import { ModesPage } from './pages/Modes'
import { LogsPage } from './pages/Logs'
import { SettingsPage } from './pages/Settings'

export type Page = 'home' | 'servers' | 'profiles' | 'modes' | 'logs' | 'settings'

const NAV: [Page, string, () => ReactElement][] = [
  ['home', 'Главная', Icon.home],
  ['servers', 'Серверы', Icon.globe],
  ['profiles', 'Подписки', Icon.key],
  ['modes', 'Режимы', Icon.route],
  ['logs', 'Журнал и правила', Icon.log],
  ['settings', 'Настройки', Icon.gear]
]

export function App() {
  const s = useAppState()
  const [page, setPage] = useState<Page>('home')
  const [splash, setSplash] = useState(true)
  const [needAdmin, setNeedAdmin] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1400)
    const off = window.tunnely.onNeedAdmin(() => setNeedAdmin(true))
    return () => {
      clearTimeout(t)
      off()
    }
  }, [])

  const on = s?.status === 'connected' || s?.status === 'reconnecting'
  const busy = s?.status === 'connecting' || s?.status === 'disconnecting'
  const active = s?.profiles.find(p => p.id === s.activeProfileId)

  async function connectToggle() {
    if (!s) return
    if (on) return act(window.tunnely.disconnect())
    if (!s.profiles.length) return setAddOpen(true)
    const r = await act(window.tunnely.connect())
    if (r?.needAdmin) setNeedAdmin(true)
  }

  return (
    <div className={`app ${on ? 'on' : ''} ${busy ? 'busy' : ''}`}>
      <div className="glow" />
      <Particles active={!!on || !!busy} />

      <div className="titlebar">
        <div className="drag" />
        <button onClick={() => window.tunnely.window('minimize')} aria-label="Свернуть">—</button>
        <button onClick={() => window.tunnely.window('maximize')} aria-label="Развернуть">▢</button>
        <button className="x" onClick={() => window.tunnely.window('close')} aria-label="Закрыть">✕</button>
      </div>

      <aside className="side">
        <div className="brand">
          <LogoMark size={46} lit={on} />
          <div className="brand-text">
            <b>Tunnely</b>
            <small>VPN</small>
          </div>
        </div>
        {NAV.map(([id, label, I]) => (
          <button key={id} className={`nav ${page === id ? 'active' : ''}`} onClick={() => setPage(id)} title={label}>
            <I />
            <span>{label}</span>
          </button>
        ))}
        <div className="spacer" />
        {active && <SubCard p={active} onClick={() => setPage('profiles')} />}
      </aside>

      <main>
        {s && page === 'home' && <HomePage s={s} onToggle={connectToggle} go={setPage} onAdd={() => setAddOpen(true)} />}
        {s && page === 'servers' && <ServersPage s={s} go={setPage} />}
        {s && page === 'profiles' && <ProfilesPage s={s} onAdd={() => setAddOpen(true)} />}
        {s && page === 'modes' && <ModesPage s={s} />}
        {s && page === 'logs' && <LogsPage />}
        {s && page === 'settings' && <SettingsPage s={s} onNeedAdmin={() => setNeedAdmin(true)} />}
      </main>

      {splash && (
        <div className="splash">
          <LogoMark size={120} lit />
          <div className="splash-name">Tunnely</div>
          <div className="splash-sub">VPN</div>
        </div>
      )}

      {needAdmin && <AdminModal onClose={() => setNeedAdmin(false)} />}
      {addOpen && <AddKeyModal onClose={() => setAddOpen(false)} />}
      <Toasts />
    </div>
  )
}

function SubCard({ p, onClick }: { p: NonNullable<ReturnType<typeof useAppState>>['profiles'][number]; onClick: () => void }) {
  const u = p.userinfo
  const used = u ? u.upload + u.download : 0
  const left = u && u.total > 0 ? Math.max(0, u.total - used) : undefined
  const days = u && u.expire > 0 ? Math.ceil((u.expire * 1000 - Date.now()) / 86400000) : undefined
  return (
    <button className="sub" onClick={onClick}>
      <div className="sub-name">{p.name}</div>
      {left !== undefined ? (
        <>
          <div className="row">
            <span>
              Осталось <b>{bytesText(left)}</b>
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.min(100, (left / u!.total) * 100)}%` }} />
          </div>
        </>
      ) : (
        <div className="row">
          <span>
            Трафик: <b>без ограничений</b>
          </span>
        </div>
      )}
      <div className="row">
        {days !== undefined ? (
          <>
            <span>
              до <b>{new Date(u!.expire * 1000).toLocaleDateString('ru-RU')}</b>
            </span>
            <span className={days <= 3 ? 'warn' : ''}>{days > 0 ? `${days} дн.` : 'истекла'}</span>
          </>
        ) : (
          <span>
            Срок: <b>бессрочно</b>
          </span>
        )}
      </div>
    </button>
  )
}

function AdminModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Нужны права администратора" onClose={onClose}>
      <p className="muted">
        Режим <b>TUN</b> направляет через VPN трафик всех программ на компьютере, включая игры и приложения, которые не умеют работать с прокси. Для этого Windows требует создать виртуальный сетевой адаптер — а это разрешено только с правами
        администратора.
      </p>
      <p className="muted">Tunnely перезапустится, Windows покажет окно подтверждения. Права используются только для работы VPN-ядра.</p>
      <div className="modal-actions">
        <button
          className="btn ghost"
          onClick={async () => {
            await act(window.tunnely.setSettings({ connection: 'sysproxy' }))
            onClose()
            const r = await act(window.tunnely.connect())
            if (r?.needAdmin) toast('Не удалось подключиться', 'error')
          }}
        >
          Использовать системный прокси
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const ok = await act(window.tunnely.relaunchAsAdmin(true))
            setBusy(false)
            if (ok === false) toast('Запрос прав администратора отклонён', 'error')
          }}
        >
          Перезапустить с правами администратора
        </button>
      </div>
    </Modal>
  )
}

export function AddKeyModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (p: Promise<{ ok: boolean; error?: string; data?: unknown }>) => {
    setBusy(true)
    const r = await p
    setBusy(false)
    if (!r.ok) return toast(r.error ?? 'Ошибка', 'error')
    if (r.data) {
      toast('Ключ добавлен', 'ok')
      onClose()
    }
  }
  return (
    <Modal title="Добавить ключ" onClose={onClose}>
      <p className="muted">Скопируйте ключ или ссылку на подписку, которую вы получили, и нажмите «Вставить из буфера».</p>
      <div className="add-actions">
        <button className="btn big" disabled={busy} onClick={() => run(window.tunnely.addFromClipboard())}>
          <Icon.paste /> Вставить из буфера
        </button>
        <button className="btn ghost big" disabled={busy} onClick={() => run(window.tunnely.addFromFile())}>
          <Icon.file /> Из файла
        </button>
      </div>
      <div className="or">или вставьте вручную</div>
      <textarea className="input" rows={3} placeholder="https://… или vless://…" value={text} onChange={e => setText(e.target.value)} spellCheck={false} />
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Отмена
        </button>
        <button className="btn" disabled={busy || !text.trim()} onClick={() => run(window.tunnely.addText(text))}>
          {busy ? 'Загрузка…' : 'Добавить'}
        </button>
      </div>
    </Modal>
  )
}
