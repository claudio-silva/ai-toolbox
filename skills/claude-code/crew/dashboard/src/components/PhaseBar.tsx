import { cn } from '@/lib/utils'
import { span } from '@/lib/format'

const PARTS = [
  { k: 'build', label: 'build', bg: 'bg-ph-build' },
  { k: 'review', label: 'review', bg: 'bg-ph-review' },
  { k: 'rework', label: 'rework', bg: 'bg-ph-rework' },
] as const

// Build / review / rework as one bar. `scale` lets several bars share one length (the longest
// task fills the width).
export function PhaseBar({ build, review, rework, scale, legend = true, className }: {
  build: number
  review: number
  rework: number
  scale?: number
  legend?: boolean
  className?: string
}) {
  const v = { build, review, rework }
  const total = build + review + rework
  const width = scale ? Math.max(2, (total * 100) / scale) : 100
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="flex h-full" style={{ width: `${width}%` }}>
          {total > 0 && PARTS.map((p) => v[p.k] > 0 && (
            <div key={p.k} title={`${p.label} ${span(v[p.k])}`} className={cn('h-full first:rounded-l-full last:rounded-r-full', p.bg)} style={{ width: `${(v[p.k] * 100) / total}%` }} />
          ))}
        </div>
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
          {PARTS.map((p) => (
            <span key={p.k} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-sm', p.bg)} />
              {p.label} <span className="tabular text-foreground">{span(v[p.k])}</span>
              {total > 0 && v[p.k] > 0 && <span className="tabular">({Math.round((v[p.k] * 100) / total)}%)</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
