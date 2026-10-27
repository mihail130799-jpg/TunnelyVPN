import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppState, TrafficSample } from '@shared/types'

// Глобальное хранилище состояния, которое присылает основной процесс
let appState: AppState | undefined
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const set = (s: AppState) => {
  appState = s
  listeners.forEach(l => l())
}

void window.tunnely.state().then(set)
window.tunnely.onState(set)

export function useAppState(): AppState | undefined {
  return useSyncExternalStore(subscribe, () => appState)
}

// История скорости за последние 2 минуты
export const trafficHistory: TrafficSample[] = []
let lastTraffic: TrafficSample = { up: 0, down: 0, upTotal: 0, downTotal: 0, t: Date.now() }
const trafficListeners = new Set<() => void>()
window.tunnely.onTraffic(t => {
  lastTraffic = t
  trafficHistory.push(t)
  if (trafficHistory.length > 120) trafficHistory.shift()
  trafficListeners.forEach(l => l())
})

export function useTraffic(): TrafficSample {
  return useSyncExternalStore(
    cb => {
      trafficListeners.add(cb)
      return () => trafficListeners.delete(cb)
    },
    () => lastTraffic
  )
}

/** Тикает раз в секунду (для таймера сеанса) */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}
