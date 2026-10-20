// One half-second ticker for every running clock on the page, so they all advance and blink
// together; it runs only while some clock is on screen. Clocks count from the moment the
// server measured their value (the state's generatedAt), so a clock that appears later (a
// tab switch, a panel opening) shows the right time at once.

import { createContext, useContext, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let now = Date.now()
let timer = 0

function schedule() {
  // Tick on the half-second boundaries, so seconds change when the wall clock's do.
  timer = window.setTimeout(() => {
    now = Date.now()
    for (const l of listeners) l()
    schedule()
  }, 500 - (Date.now() % 500) + 5)
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) {
    now = Date.now()
    schedule()
  }
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) window.clearTimeout(timer)
  }
}

// Milliseconds, updated every half second while the caller is mounted.
export function useTick(enabled = true): number {
  return useSyncExternalStore(enabled ? subscribe : noSubscribe, () => (enabled ? now : 0))
}
const noSubscribe = () => () => {}

// The epoch second the current state was computed at (state.generatedAt).
export const ClockBase = createContext<number>(0)
export const useClockBase = () => useContext(ClockBase)
