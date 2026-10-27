import { useEffect, useRef, type ReactNode } from 'react'
import type { ConnStatus } from '@shared/types'

// ---------- Знак Tunnely (как на логотипе) ----------

const ARCH = ['#3FC3F5', '#3E8EF0', '#3561DD', '#2C40B8', '#24298F', '#1B1C66', '#140F45']

export function LogoMark({ size = 44, lit = true }: { size?: number; lit?: boolean }) {
  const radii = [30, 25, 20.5, 16.2, 12.3]
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        {radii.map((_, i) => (
          <linearGradient key={i} id={`lm${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ARCH[i]} />
            <stop offset=".75" stopColor={ARCH[i + 1]} />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        ))}
        <radialGradient id="lmglow" cx="32" cy="44" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".25" stopColor="#E0E7FF" stopOpacity=".8" />
          <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
        </radialGradient>
      </defs>
      {radii.map((r, i) => (
        <path key={i} d={`M${32 - r} ${56 - i} V${36 + i * 0.6} A${r} ${r} 0 0 1 ${32 + r} ${36 + i * 0.6} V${56 - i} Z`} fill={`url(#lm${i})`} />
      ))}
      {lit && <circle cx="32" cy="44" r="20" fill="url(#lmglow)" />}
      <path d="M28.5 49 V43.5 A3.5 3.5 0 0 1 35.5 43.5 V49 Z" fill={lit ? '#fff' : '#05061A'} />
      <path d="M28.5 49 H35.5 L44 60 H20 Z" fill="#3B2A8C" />
      <path d="M32 50.5 V60" stroke="#E0E7FF" strokeWidth="1.4" strokeDasharray="2.4 2" />
    </svg>
  )
}

// ---------- Флаг страны ----------

export function Flag({ code, group }: { code?: string; group?: boolean }) {
  if (group) return <span className="flag flag-auto">⚡</span>
  if (!code) return <span className="flag flag-none">🌐</span>
  return <span className={`flag fi fi-${code}`} />
}

// ---------- Кнопка-тоннель ----------

const TUNNEL_RADII = [150, 128, 107, 87, 68, 50, 33]

export function TunnelButton({ status, onClick, disabled }: { status: ConnStatus; onClick: () => void; disabled?: boolean }) {
  const label = status === 'connected' ? 'Отключить VPN' : 'Подключить VPN'
  return (
    <button className={`tunnel st-${status}`} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <svg viewBox="0 0 320 262">
        <defs>
          {TUNNEL_RADII.map((_, i) => (
            <linearGradient key={i} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ARCH[i]} />
              <stop offset=".72" stopColor={ARCH[Math.min(i + 1, 6)]} />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
          ))}
          <radialGradient id="glowL" cx="160" cy="188" r="120" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".08" stopColor="#F5F3FF" />
            <stop offset=".25" stopColor="#C4B5FD" stopOpacity=".75" />
            <stop offset=".55" stopColor="#7C3AED" stopOpacity=".25" />
            <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="roadG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3B2A8C" />
            <stop offset="1" stopColor="#1B1650" />
          </linearGradient>
          <linearGradient id="roadLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E0E7FF" stopOpacity=".9" />
            <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fadeG" x1="0" y1="0" x2="0" y2="1">
            <stop offset=".72" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="262">
            <rect width="320" height="240" fill="url(#fadeG)" />
          </mask>
          <clipPath id="inside">
            <path d="M110 236 V186 A50 50 0 0 1 210 186 V236 Z" />
          </clipPath>
        </defs>
        <g mask="url(#fade)">
          {TUNNEL_RADII.map((r, i) => {
            const cy = 186 + i * 2.2
            const bottom = 236 - i * 4.4
            return (
              <path
                key={i}
                className="arch"
                style={{ animationDelay: `${i * 0.12}s` }}
                d={`M${160 - r} ${bottom} V${cy} A${r} ${r} 0 0 1 ${160 + r} ${cy} V${bottom} Z`}
                fill={`url(#ag${i})`}
              />
            )
          })}
        </g>
        <g className="rays" clipPath="url(#inside)">
          <path d="M160 188 L120 60 L134 60 Z M160 188 L186 60 L200 60 Z M160 188 L60 150 L60 166 Z M160 188 L260 150 L260 166 Z" fill="#E0E7FF" opacity=".25" />
        </g>
        <path className="portal-dark" d="M146 205 V184 A14 14 0 0 1 174 184 V205 Z" fill="#05061A" />
        <g className="light">
          <circle cx="160" cy="188" r="120" fill="url(#glowL)" />
          <path d="M146 205 V184 A14 14 0 0 1 174 184 V205 Z" fill="#fff" />
        </g>
        <g className="road">
          <path d="M146 205 H174 L232 262 H88 Z" fill="url(#roadG)" />
          <path className="roadlight" d="M146 205 H174 L232 262 H88 Z" fill="url(#roadLight)" />
          <path className="dash" d="M160 207 L160 262" stroke="#E0E7FF" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
    </button>
  )
}

// ---------- Частицы на фоне: при подключении летят в тоннель ----------

export function Particles({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const cv = ref.current!
    const cx = cv.getContext('2d')!
    let raf = 0
    let W = 0
    let H = 0
    const dpr = window.devicePixelRatio || 1
    const size = () => {
      W = cv.width = cv.offsetWidth * dpr
      H = cv.height = cv.offsetHeight * dpr
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(cv)
    const parts = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.2 + Math.random() * 0.8, r: Math.random() * 1.6 + 0.4 }))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const frame = () => {
      cx.clearRect(0, 0, W, H)
      const portal = document.querySelector('.tunnel .portal-dark')
      const cr = cv.getBoundingClientRect()
      let tx = 0.6
      let ty = 0.4
      if (portal && cr.width) {
        const pr = portal.getBoundingClientRect()
        tx = (pr.x + pr.width / 2 - cr.x) / cr.width
        ty = (pr.y + pr.height / 2 - cr.y) / cr.height
      }
      const on = activeRef.current && !!portal
      for (const p of parts) {
        if (!reduce) {
          if (on) {
            const dx = tx - p.x
            const dy = ty - p.y
            const d = Math.hypot(dx, dy)
            p.x += (dx / d) * 0.004 * p.v
            p.y += (dy / d) * 0.004 * p.v
            if (d < 0.03) {
              const a = Math.random() * Math.PI * 2
              p.x = tx + Math.cos(a) * 0.7
              p.y = ty + Math.sin(a) * 0.7
            }
          } else {
            p.y -= 0.0004 * p.v
            if (p.y < 0) p.y = 1
          }
        }
        cx.beginPath()
        cx.arc(p.x * W, p.y * H, p.r * dpr, 0, 7)
        cx.fillStyle = `rgba(${p.v > 0.6 ? '56,189,248' : '167,139,250'},${on ? 0.8 : 0.35})`
        cx.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="particles" />
}

// ---------- Мелкие элементы ----------

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <i />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" />
}

// ---------- Иконки ----------

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
export const Icon = {
  home: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  globe: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  key: () => <svg viewBox="0 0 24 24" {...P}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2" /></svg>,
  route: () => <svg viewBox="0 0 24 24" {...P}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>,
  chart: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  log: () => <svg viewBox="0 0 24 24" {...P}><path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" /></svg>,
  gear: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4z" /></svg>,
  paste: () => <svg viewBox="0 0 24 24" {...P}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M12 10v6M9 13h6" /></svg>,
  file: () => <svg viewBox="0 0 24 24" {...P}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></svg>,
  refresh: () => <svg viewBox="0 0 24 24" {...P}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>,
  trash: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  edit: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>,
  bolt: () => <svg viewBox="0 0 24 24" {...P}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>,
  shield: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></svg>,
  x: () => <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  chevron: () => <svg viewBox="0 0 24 24" {...P}><path d="m9 6 6 6-6 6" /></svg>,
  check: () => <svg viewBox="0 0 24 24" {...P}><path d="m5 12 5 5 9-10" /></svg>,
  support: () => <svg viewBox="0 0 24 24" {...P}><path d="M21 12a9 9 0 1 1-4-7.5L21 3l-1 4.5A9 9 0 0 1 21 12z" /></svg>
}
