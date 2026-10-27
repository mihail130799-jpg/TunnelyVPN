import { useState } from 'react'
import type { AppState, ProfileInfo } from '@shared/types'
import { Icon, Modal, Spinner } from '../components'
import { act, toast } from '../toast'
import { ago, bytesText, plural } from '../format'

const KIND: Record<ProfileInfo['kind'], string> = { subscription: 'Подписка', links: 'Ключ', config: 'Файл конфигурации' }

export function ProfilesPage({ s, onAdd }: { s: AppState; onAdd: () => void }) {
  const [pasting, setPasting] = useState(false)
  return (
    <section className="page profiles">
      <div className="head">
        <h1>Подписки и ключи</h1>
        <div className="grow" />
        <button
          className="btn"
          disabled={pasting}
          onClick={async () => {
            setPasting(true)
            const r = await act(window.tunnely.addFromClipboard())
            setPasting(false)
            if (r) toast(`Добавлено: ${r.name}`, 'ok')
          }}
        >
          {pasting ? <Spinner /> : <Icon.paste />} Вставить из буфера
        </button>
        <button className="btn ghost" onClick={onAdd}>
          Добавить…
        </button>
      </div>

      {s.profiles.length === 0 && (
        <div className="empty-card">
          Здесь появятся ваши подписки и ключи. Поддерживаются ссылки на подписку (https://…), ключи vless://, trojan://, ss://, vmess://, hysteria2:// и файлы конфигурации Clash/Mihomo.
        </div>
      )}

      <div className="plist">
        {s.profiles.map(p => (
          <ProfileCard key={p.id} p={p} active={p.id === s.activeProfileId} />
        ))}
      </div>
    </section>
  )
}

function ProfileCard({ p, active }: { p: ProfileInfo; active: boolean }) {
  const [updating, setUpdating] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
  const u = p.userinfo
  const used = u ? u.upload + u.download : 0
  const pct = u && u.total > 0 ? Math.min(100, (used / u.total) * 100) : 0

  return (
    <div className={`pcard ${active ? 'active' : ''}`} onClick={() => !active && act(window.tunnely.activateProfile(p.id), `Активен профиль «${p.name}»`)}>
      <div className="pcard-head">
        <div className="grow">
          <div className="pname">
            {p.name} {active && <span className="badge">Активен</span>}
          </div>
          <div className="proto">
            {KIND[p.kind]} · {p.serverCount} {plural(p.serverCount, 'сервер', 'сервера', 'серверов')}
            {p.maskedUrl && ` · ${p.maskedUrl}`}
          </div>
        </div>
        <div className="pactions" onClick={e => e.stopPropagation()}>
          {p.kind === 'subscription' && (
            <button
              className="icon-btn"
              title="Обновить подписку"
              disabled={updating}
              onClick={async () => {
                setUpdating(true)
                await act(window.tunnely.updateProfile(p.id), 'Подписка обновлена')
                setUpdating(false)
              }}
            >
              {updating ? <Spinner /> : <Icon.refresh />}
            </button>
          )}
          <button className="icon-btn" title="Переименовать" onClick={() => setRename(p.name)}>
            <Icon.edit />
          </button>
          <button className="icon-btn danger" title="Удалить" onClick={() => setConfirm(true)}>
            <Icon.trash />
          </button>
        </div>
      </div>

      {u && (
        <div className="pinfo">
          <div>
            <small>Трафик</small>
            <b>{u.total > 0 ? `${bytesText(used)} из ${bytesText(u.total)}` : `${bytesText(used)} · без ограничений`}</b>
            {u.total > 0 && (
              <div className="bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          <div>
            <small>Действует до</small>
            <b>{u.expire > 0 ? new Date(u.expire * 1000).toLocaleDateString('ru-RU') : 'бессрочно'}</b>
          </div>
        </div>
      )}

      <div className="pfoot">
        <span className="muted">Обновлено {ago(p.updatedAt)}</span>
        {p.lastError && <span className="perr">Ошибка обновления: {p.lastError}</span>}
        {p.supportUrl && (
          <button
            className="link"
            onClick={e => {
              e.stopPropagation()
              void window.tunnely.openUrl(p.supportUrl!)
            }}
          >
            <Icon.support /> Поддержка
          </button>
        )}
      </div>

      {confirm && (
        <Modal title="Удалить профиль?" onClose={() => setConfirm(false)}>
          <p className="muted">«{p.name}» будет удалён с этого компьютера. Чтобы вернуть его, понадобится снова вставить ключ.</p>
          <div className="modal-actions" onClick={e => e.stopPropagation()}>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                setConfirm(false)
                await act(window.tunnely.removeProfile(p.id), 'Профиль удалён')
              }}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
      {rename !== null && (
        <Modal title="Переименовать" onClose={() => setRename(null)}>
          <input className="input" autoFocus value={rename} maxLength={60} onChange={e => setRename(e.target.value)} onClick={e => e.stopPropagation()} />
          <div className="modal-actions" onClick={e => e.stopPropagation()}>
            <button className="btn ghost" onClick={() => setRename(null)}>
              Отмена
            </button>
            <button
              className="btn"
              onClick={async () => {
                await act(window.tunnely.renameProfile(p.id, rename))
                setRename(null)
              }}
            >
              Сохранить
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
