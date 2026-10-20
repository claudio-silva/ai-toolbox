// Formatting shared by every tab. Durations follow bin/crew's journal ("1 h 5 min", "41 s").

export function span(s: number | null | undefined): string {
  if (s == null) return '—'
  s = Math.round(s)
  if (s <= 0) return '—'
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
}

// Short form for tight spots: "45m", "5h 05m".
export function spanShort(s: number): string {
  s = Math.round(s)
  if (s < 60) return `${Math.max(0, s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

export function kTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))
}

export function usd(c: number | null | undefined): string {
  if (c == null) return '—'
  if (c < -0.005) return `−$${(-c).toFixed(2)}`
  if (c < 0.005) return '<$0.01'
  return `$${c.toFixed(2)}`
}

export function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a * 100) / b)}%` : '—'
}

export function hm(epoch: number): string {
  const d = new Date(epoch * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function day(epoch: number): string {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "14:05", or "Oct 19 14:05" when not today.
export function when(epoch: number, today: string): string {
  if (day(epoch) === today) return hm(epoch)
  return `${new Date(epoch * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${hm(epoch)}`
}

export function dayLabel(d: string, today: string): string {
  if (d === today) return 'Today'
  const t = new Date(`${today}T12:00:00`)
  const y = new Date(t.getTime() - 86400000)
  const yd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  if (d === yd) return 'Yesterday'
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Seconds since a local "HH:MM" (today, or yesterday when that time is still to come).
export function sinceHM(hhmm: string | null | undefined, nowMs: number): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const d = new Date(nowMs)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  let s = (nowMs - d.getTime()) / 1000
  if (s < -60) s += 86400
  return Math.max(0, s)
}

export function ago(seconds: number | null): string {
  if (seconds == null) return ''
  if (seconds < 60) return 'just now'
  return span(seconds)
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function modelShort(m: string): string {
  const l = m.toLowerCase()
  for (const k of ['fable', 'opus', 'sonnet', 'haiku']) if (l.includes(k)) return k
  return m || 'default'
}
