// Formatting shared by every tab.

// A finished or frozen duration: "1h 19m", "19m", "41s" ("—" for nothing). A running one is
// shown by <Duration live> as a ticking clock (clockText).
export function span(s: number | null | undefined): string {
  if (s == null || s <= 0) return '—'
  if (s < 1) return '<1s'
  s = Math.floor(s)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// A running duration as a clock: "08:15:30" (hours keep counting past 24).
export function clockText(s: number): [string, string, string] {
  s = Math.max(0, Math.floor(s))
  const p = (n: number) => String(n).padStart(2, '0')
  return [p(Math.floor(s / 3600)), p(Math.floor((s % 3600) / 60)), p(s % 60)]
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

// A project's folder name as a title: "sublimewriter" → "Sublimewriter".
export function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function modelShort(m: string): string {
  const l = m.toLowerCase()
  for (const k of ['fable', 'opus', 'sonnet', 'haiku']) if (l.includes(k)) return k
  return m || 'default'
}
