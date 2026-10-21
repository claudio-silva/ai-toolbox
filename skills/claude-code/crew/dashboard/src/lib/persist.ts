// The tab lives in the URL hash; each tab's scroll position lives in sessionStorage, so a
// reload (a rebuilt page, a restarted server, the panel reopening) lands where you were.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export const TABS = ['overview', 'agents', 'tasks','timing', 'queue', 'defects', 'compactions', 'journal', 'sets'] as const
export type Tab = (typeof TABS)[number]

const KEY = 'crew-dashboard:scroll:'

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#/, '') as Tab
  return (TABS as readonly string[]).includes(h) ? h : 'overview'
}

let currentTab: Tab = tabFromHash()

export function saveScroll(tab: Tab = currentTab) {
  try { sessionStorage.setItem(KEY + tab, String(Math.round(window.scrollY))) } catch { /* private mode */ }
}

function savedScroll(tab: Tab): number {
  try { return Number(sessionStorage.getItem(KEY + tab) || 0) } catch { return 0 }
}

// The active tab; switching saves the old tab's scroll and restores the new one's once the page
// has content (`ready`).
export function useTab(ready: boolean): [Tab, (t: Tab) => void] {
  const [tab, setTabState] = useState<Tab>(currentTab)
  const restored = useRef<Tab | null>(null)

  const setTab = useCallback((t: Tab) => {
    saveScroll(currentTab)
    currentTab = t
    restored.current = null
    history.replaceState(null, '', `#${t}`)
    setTabState(t)
  }, [])

  useEffect(() => {
    const onHash = () => { const t = tabFromHash(); if (t !== currentTab) setTab(t) }
    window.addEventListener('hashchange', onHash)
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => saveScroll())
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('beforeunload', () => saveScroll())
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('scroll', onScroll)
    }
  }, [setTab])

  useLayoutEffect(() => {
    if (!ready || restored.current === tab) return
    restored.current = tab
    const y = savedScroll(tab)
    window.scrollTo(0, y)
    // Charts lay out a frame later; settle once more.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y)
    }))
  }, [ready, tab])

  return [tab, setTab]
}

export type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'crew-dashboard:theme'

export function useTheme(): [Theme, (t: Theme) => void, boolean] {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'system')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  // The charts read the theme's colours from CSS while they render, so the class changes here,
  // before the children render, not in an effect after them (idempotent).
  document.documentElement.classList.toggle('dark', dark)
  const set = (t: Theme) => {
    localStorage.setItem(THEME_KEY, t)
    setTheme(t)
  }
  return [theme, set, dark]
}
