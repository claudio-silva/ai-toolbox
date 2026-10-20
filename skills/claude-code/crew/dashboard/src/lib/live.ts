// The live connection: one EventSource on /api/events. The server pushes the whole model when
// it changes ("state"), asks for a reload when the page itself was rebuilt ("reload"), and says
// hello with the page's build id on every (re)connection. Nothing here polls.

import { useEffect, useRef, useState } from 'react'
import type { State } from './types'
import { saveScroll } from './persist'

export type Conn = 'connecting' | 'live' | 'reconnecting' | 'offline'

export function useLive(): { state: State | null; conn: Conn; problem: string | null; changedAt: number } {
  const [state, setState] = useState<State | null>(null)
  const [conn, setConn] = useState<Conn>('connecting')
  const [problem, setProblem] = useState<string | null>(null)
  const [changedAt, setChangedAt] = useState(0)
  const build = useRef<string | null>(null)

  useEffect(() => {
    const es = new EventSource('api/events')
    let downSince = 0
    let offlineTimer: number | undefined

    es.addEventListener('hello', (e) => {
      const h = JSON.parse((e as MessageEvent).data) as { build: string }
      // A different page build than the one running here: reload, keeping tab and scroll.
      if (build.current && h.build !== build.current) {
        saveScroll()
        location.reload()
        return
      }
      build.current = h.build
    })
    es.addEventListener('state', (e) => {
      setState(JSON.parse((e as MessageEvent).data) as State)
      setChangedAt(Date.now())
      setProblem(null)
    })
    es.addEventListener('reload', () => {
      saveScroll()
      location.reload()
    })
    es.addEventListener('problem', (e) => {
      setProblem((JSON.parse((e as MessageEvent).data) as { message: string }).message)
    })
    es.onopen = () => {
      downSince = 0
      window.clearTimeout(offlineTimer)
      setConn('live')
    }
    es.onerror = () => {
      if (!downSince) downSince = Date.now()
      setConn('reconnecting')
      window.clearTimeout(offlineTimer)
      offlineTimer = window.setTimeout(() => setConn('offline'), 15000)
    }
    return () => {
      window.clearTimeout(offlineTimer)
      es.close()
    }
  }, [])

  return { state, conn, problem, changedAt }
}

// A clock for durations shown on the page (client-side only; it never calls the server).
export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}
