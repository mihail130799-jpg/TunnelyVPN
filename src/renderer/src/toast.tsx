import { useSyncExternalStore } from 'react'

type Toast = { id: number; text: string; kind: 'ok' | 'error' | 'info' }
let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++seq
  toasts = [...toasts, { id, text, kind }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  }, kind === 'error' ? 7000 : 3500)
}

/** Выполняет действие и показывает ошибку, если она возникла */
export async function act<T>(p: Promise<{ ok: boolean; error?: string; data?: T }>, success?: string): Promise<T | undefined> {
  const r = await p
  if (!r.ok) {
    toast(r.error ?? 'Что-то пошло не так', 'error')
    return undefined
  }
  if (success) toast(success, 'ok')
  return r.data
}

export function Toasts() {
  const list = useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => toasts
  )
  return (
    <div className="toasts">
      {list.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-dot" />
          {t.text}
        </div>
      ))}
    </div>
  )
}
