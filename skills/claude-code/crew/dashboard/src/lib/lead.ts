// Talking to the lead, and reading agents' transcripts. Messages go through the server, which
// delivers them to the lead's session (in Paseo as if typed there, elsewhere through Claude
// Code's cross-session inbox). Transcripts are read in chunks and then followed as they grow.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entry, State } from './types'

const POST = { method: 'POST', headers: { 'X-Crew': '1' } } as const

async function answer(r: Response) {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.error || `${r.status} ${r.statusText}`)
  return j
}

export async function sendToLead(text: string, files: string[] = []): Promise<{ via: 'paseo' | 'socket' }> {
  return answer(await fetch('api/lead/message', {
    ...POST, headers: { ...POST.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, files }),
  }))
}

// Keeps the file under .crew/tmp/attachments/; resolves to its path from the project root.
export async function attachFile(f: File): Promise<string> {
  const j = await answer(await fetch(`api/lead/attach?name=${encodeURIComponent(f.name)}`, { ...POST, body: f }))
  return j.path as string
}

// Why the page cannot message the lead now; null when it can.
export function leadBlocker(s: State): string | null {
  const l = s.roster.lead
  if (!l) return 'No crew session yet: run /crew in Claude Code first.'
  if (!l.alive) return "The crew's Claude Code session is closed: messages need it running."
  if (!l.reach) {
    return 'This session has not recorded a way in yet: send it any message where it runs, or run /crew resume there. '
      + 'Outside Paseo, it needs Claude Code 2.1.224 or later.'
  }
  return null
}

export const VIA_LABEL ={ paseo: 'through Paseo', socket: "through Claude Code's inbox" } as const

export type TranscriptStatus = 'loading' | 'ready' | 'missing' | 'error'

// An agent's transcript: the newest chunk, then every line as it is written. `earlier` loads the
// chunk before the oldest one shown.
export function useTranscript(agent: string, retry: unknown) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<TranscriptStatus>('loading')
  const [more, setMore] = useState(false)
  const start = useRef(0)
  const keys = useRef(new Set<string>())
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    let es: EventSource | null = null
    keys.current = new Set()
    setEntries([])
    setStatus('loading')
    const add = (list: Entry[], atStart = false) => {
      const fresh = list.filter((e) => !keys.current.has(e.key))
      fresh.forEach((e) => keys.current.add(e.key))
      if (fresh.length) setEntries((prev) => (atStart ? [...fresh, ...prev] : [...prev, ...fresh]))
    }
    fetch(`api/transcript?agent=${encodeURIComponent(agent)}`)
      .then((r) => (r.status === 404 ? null : r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((t: { entries: Entry[]; start: number; end: number; more: boolean } | null) => {
        if (!live) return
        if (!t) { setStatus('missing'); return }
        add(t.entries)
        start.current = t.start
        setMore(t.more)
        setStatus('ready')
        es = new EventSource(`api/transcript/stream?agent=${encodeURIComponent(agent)}&from=${t.end}`)
        es.addEventListener('entries', (e) => add((JSON.parse((e as MessageEvent).data) as { entries: Entry[] }).entries))
        es.addEventListener('reset', () => setNonce((n) => n + 1))
      })
      .catch(() => live && setStatus('error'))
    return () => { live = false; es?.close() }
  }, [agent, retry, nonce])

  const earlier = useCallback(async () => {
    if (!start.current) return
    const r = await fetch(`api/transcript?agent=${encodeURIComponent(agent)}&before=${start.current}`)
    if (!r.ok) return
    const t = (await r.json()) as { entries: Entry[]; start: number; more: boolean }
    start.current = t.start
    setMore(t.more)
    const fresh = t.entries.filter((e) => !keys.current.has(e.key))
    fresh.forEach((e) => keys.current.add(e.key))
    setEntries((prev) => [...fresh, ...prev])
  }, [agent])

  return { entries, status, more, earlier }
}

// The context size of the newest request in a transcript; null after a compaction until the
// next request, or when none is known.
export function contextOf(entries: Entry[]): number | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.kind === 'compact') return null
    if ('ctx' in e && e.ctx > 0) return e.ctx
  }
  return null
}

// "claude-opus-5-5" → "Opus 5.5"; "claude-sonnet-5-5[1m]" → "Sonnet 5.5 1M".
export function modelName(m: string): string {
  const x = /claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?(\[1m\])?/i.exec(m)
  if (!x) return m ? m[0].toUpperCase() + m.slice(1) : 'Default model'
  return `${x[1][0].toUpperCase()}${x[1].slice(1)} ${x[2]}${x[3] ? `.${x[3]}` : ''}${x[4] ? ' 1M' : ''}`
}
