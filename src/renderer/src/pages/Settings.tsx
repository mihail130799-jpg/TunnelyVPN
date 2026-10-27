import type { ReactNode } from 'react'
import type { AppState, Settings } from '@shared/types'
import { Segmented, Toggle, LogoMark } from '../components'
import { act } from '../toast'

export function SettingsPage({ s, onNeedAdmin }: { s: AppState; onNeedAdmin: () => void }) {
  const set = async (patch: Partial<Settings>) => {
    const r = await act(window.tunnely.setSettings(patch))
    if (r?.needAdmin) onNeedAdmin()
  }
  const st = s.settings
  const u = s.update

  return (
    <section className="page settings">
      <div className="head">
        <h1>Настройки</h1>
      </div>
      <div className="settings-scroll">
        <Group title="Подключение">
          <Row title="Способ подключения" hint={st.connection === 'tun' ? 'Через VPN идёт трафик всех программ, включая игры. Нужны права администратора.' : 'Через VPN идёт трафик браузеров и большинства программ. Права администратора не нужны.'}>
            <Segmented value={st.connection} onChange={v => set({ connection: v })} options={[['sysproxy', 'Системный прокси'], ['tun', 'TUN']]} />
          </Row>
          <Row title="Автоматическое переподключение" hint="Если сервер перестал отвечать — восстановить связь или переключиться на работающий сервер.">
            <Toggle checked={st.autoReconnect} onChange={v => set({ autoReconnect: v })} />
          </Row>
        </Group>

        <Group title="Запуск">
          <Row title="Запускать вместе с Windows" hint={st.connection === 'tun' ? 'Для режима TUN автозапуск настраивается через Планировщик задач — Windows один раз попросит подтверждение.' : undefined}>
            <Toggle checked={st.autostart} onChange={v => set({ autostart: v })} />
          </Row>
          <Row title="Подключаться при запуске">
            <Toggle checked={st.connectOnStart} onChange={v => set({ connectOnStart: v })} />
          </Row>
          <Row title="Запускать свёрнутым в трей">
            <Toggle checked={st.startMinimized} onChange={v => set({ startMinimized: v })} />
          </Row>
          <Row title="При закрытии окна сворачивать в трей" hint="VPN продолжит работать в фоне. Полностью выйти можно через меню значка в трее.">
            <Toggle checked={st.closeToTray} onChange={v => set({ closeToTray: v })} />
          </Row>
        </Group>

        <Group title="Подписки">
          <Row title="Обновлять подписки автоматически" hint="Список серверов обновляется с интервалом, который задаёт ваш сервис (по умолчанию раз в 12 часов).">
            <Toggle checked={st.autoUpdateSubscriptions} onChange={v => set({ autoUpdateSubscriptions: v })} />
          </Row>
        </Group>

        <Group title="Интерфейс">
          <Row title="Язык">
            <select className="input select" value={st.language} disabled>
              <option value="ru">Русский</option>
            </select>
          </Row>
          <Row title="Тема">
            <span className="muted">Тёмная</span>
          </Row>
        </Group>

        <Group title="Обновления">
          <Row title={`Версия ${s.appVersion}`} hint={updateText(u)}>
            {u?.status === 'ready' ? (
              <button className="btn" onClick={() => window.tunnely.installUpdate()}>
                Перезапустить и обновить
              </button>
            ) : (
              <button className="btn ghost" disabled={u?.status === 'disabled' || u?.status === 'checking' || u?.status === 'downloading'} onClick={() => act(window.tunnely.checkUpdates())}>
                Проверить обновления
              </button>
            )}
          </Row>
        </Group>

        <Group title="Журнал ошибок">
          <Row title="Файлы журнала" hint="Пригодятся службе поддержки. Секретные ключи в журнал не записываются.">
            <button className="btn ghost" onClick={() => window.tunnely.openLogsFolder()}>
              Открыть папку
            </button>
          </Row>
        </Group>

        <div className="about">
          <LogoMark size={40} lit />
          <div>
            <b>Tunnely VPN {s.appVersion}</b>
            <div className="muted">
              Сетевое ядро Mihomo {s.coreVersion ?? ''} — свободное ПО (GPL-3.0),{' '}
              <button className="link inline" onClick={() => window.tunnely.openUrl('https://github.com/MetaCubeX/mihomo')}>
                исходный код
              </button>
              {s.isAdmin && ' · запущено с правами администратора'}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function updateText(u: AppState['update']): string {
  switch (u?.status) {
    case 'disabled':
      return u.message ?? 'Обновления не настроены'
    case 'checking':
      return 'Проверяем…'
    case 'downloading':
      return `Загружается версия ${u.version ?? ''}: ${u.progress ?? 0}%`
    case 'ready':
      return `Версия ${u.version} загружена и проверена — установится при перезапуске`
    case 'none':
      return 'У вас последняя версия'
    case 'error':
      return u.message ?? 'Ошибка проверки'
    default:
      return 'Обновления проверяются автоматически'
  }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sgroup">
      <div className="group-title">{title}</div>
      <div className="scard">{children}</div>
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="srow">
      <div className="grow">
        <div className="stitle">{title}</div>
        {hint && <div className="shint">{hint}</div>}
      </div>
      <div className="sctl">{children}</div>
    </div>
  )
}
