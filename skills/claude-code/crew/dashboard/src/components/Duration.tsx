import { cn } from '@/lib/utils'
import { clockText, span } from '@/lib/format'
import { useClockBase, useTick } from '@/lib/clock'

// A duration. Frozen (the default): "1h 19m". Live: a clock that keeps counting on the page,
// "08:15:30" with blinking colons, from `secs` as measured at `at` (default: the state's
// generatedAt) and growing `rate` seconds per second (several agents adding to one total).
// When the thing it measures ends, the next state freezes it (live={false}).
export function Duration({ secs, live = false, at, rate = 1, className, empty = '—' }: {
  secs: number | null | undefined
  live?: boolean
  at?: number
  rate?: number
  className?: string
  empty?: string
}) {
  const base = useClockBase()
  const ticking = live && rate > 0 && secs != null
  const ms = useTick(ticking)
  if (secs == null) return <span className={className}>{empty}</span>
  if (!ticking) {
    const t = span(secs)
    return <span className={cn('tabular', className)}>{t === '—' ? empty : t}</span>
  }
  const from = at ?? base
  const v = secs + rate * Math.max(0, ms / 1000 - from)
  const [h, m, s] = clockText(v)
  const on = Math.floor(ms / 500) % 2 === 0
  const colon = <span aria-hidden className={cn('transition-opacity duration-100 motion-reduce:opacity-100', on ? 'opacity-100' : 'opacity-0')}>:</span>
  return (
    <span role="timer" aria-label={`${span(v)}, running`} className={cn('tabular whitespace-nowrap', className)}>
      {h}{colon}{m}{colon}{s}
    </span>
  )
}
