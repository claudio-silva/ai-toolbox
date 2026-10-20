// The task set's dependency graph: dagre lays it out top-down (narrow panels read a column
// better than a row), React draws it as SVG and scales it to the panel width.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Graph, layout } from '@dagrejs/dagre'
import type { Agent, Task } from '@/lib/types'
import { STATUS } from './bits'
import { cn } from '@/lib/utils'

const W = 188
const H = 58

interface Laid {
  nodes: { t: Task; x: number; y: number }[]
  edges: { from: string; to: string; points: { x: number; y: number }[]; critical: boolean }[]
  width: number
  height: number
}

function lay(tasks: Task[], critical: Set<string>): Laid {
  const g = new Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 16, ranksep: 30, marginx: 6, marginy: 6 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const t of tasks) g.setNode(t.id, { width: W, height: H })
  const ids = new Set(tasks.map((t) => t.id))
  for (const t of tasks) for (const d of t.deps) if (ids.has(d)) g.setEdge(d, t.id)
  layout(g)
  const nodes = tasks.map((t) => {
    const n = g.node(t.id)
    return { t, x: n.x - W / 2, y: n.y - H / 2 }
  })
  const edges = g.edges().map((e) => ({
    from: e.v,
    to: e.w,
    points: g.edge(e).points ?? [],
    critical: critical.has(e.v) && critical.has(e.w),
  }))
  const gr = g.graph()
  return { nodes, edges, width: gr.width ?? W, height: gr.height ?? H }
}

function path(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  let d = `M${points[0].x},${points[0].y}`
  if (points.length === 2) return `${d} L${points[1].x},${points[1].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const n = points[i + 1]
    const mx = (p.x + n.x) / 2
    const my = (p.y + n.y) / 2
    d += ` Q${p.x},${p.y} ${i === points.length - 2 ? `${n.x},${n.y}` : `${mx},${my}`}`
  }
  return d
}

export function TaskGraph({ tasks, agents, current, criticalPath, onPick }: {
  tasks: Task[]
  agents: Agent[]
  current: string | null
  criticalPath: string[]
  onPick: (id: string) => void
}) {
  const critical = useMemo(() => new Set(criticalPath), [criticalPath])
  const g = useMemo(() => lay(tasks, critical), [tasks, critical])
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useLayoutEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  // Fit to the panel; below 55% the graph scrolls sideways instead of shrinking further.
  const scale = avail > 0 ? Math.max(0.55, Math.min(1, avail / g.width)) : 1
  const running = useMemo(() => new Set(agents.map((a) => a.task).filter(Boolean) as string[]), [agents])

  return (
    <div ref={box} className="thin-scroll w-full overflow-x-auto">
      <svg
        width={g.width * scale}
        height={g.height * scale}
        viewBox={`0 0 ${g.width} ${g.height}`}
        className="mx-auto block"
        role="img"
        aria-label="Task dependency graph"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" />
          </marker>
          <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="fill-primary" />
          </marker>
        </defs>
        {g.edges.map((e) => (
          <path
            key={`${e.from}-${e.to}`}
            d={path(e.points)}
            fill="none"
            strokeWidth={e.critical ? 1.8 : 1.2}
            className={e.critical ? 'stroke-primary/80' : 'stroke-muted-foreground/45'}
            markerEnd={`url(#${e.critical ? 'arrow-crit' : 'arrow'})`}
          />
        ))}
        {g.nodes.map(({ t, x, y }) => {
          const s = STATUS[t.status]
          const Icon = s.icon
          const isCur = t.id === current
          const live = running.has(t.id)
          return (
            <g key={t.id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => onPick(t.id)}>
              <title>{`${t.id} ${t.title} — ${s.label}`}</title>
              {isCur && <rect x={-4} y={-4} width={W + 8} height={H + 8} rx={14} className="fill-none stroke-primary/50" strokeWidth={2} strokeDasharray="4 3" />}
              <rect
                width={W}
                height={H}
                rx={10}
                className={cn('fill-card stroke-border transition-colors hover:fill-accent', t.status === 'blocked' && 'stroke-st-blocked')}
                strokeWidth={1}
                strokeDasharray={t.status === 'blocked' ? '4 3' : undefined}
              />
              <rect width={4} height={H - 16} x={0} y={8} rx={2} className={s.text} fill="currentColor" />
              <foreignObject x={12} y={6} width={W - 18} height={H - 12}>
                <div className="flex h-full flex-col justify-center gap-0.5 text-left">
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn('size-3.5 shrink-0', s.text)} strokeWidth={2.4} />
                    <span className="font-mono text-[11.5px] font-semibold tracking-tight">{t.id}</span>
                    {live && <span className="crew-pulse ml-auto size-2 rounded-full bg-primary" title="An agent is on it" />}
                  </div>
                  <div className="line-clamp-2 text-[11px] leading-[1.25] text-muted-foreground">{t.title}</div>
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
