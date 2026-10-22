// The task set's dependency graph: dagre lays it out top-down (narrow panels read a column
// better than a row), React draws it as SVG and scales it to the panel width. Each row is a wave:
// the tasks that can start once every row above it is done, so a row's width is how many can run
// at once. Dagre would otherwise move a task down beside the one it feeds.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Graph, layout } from '@dagrejs/dagre'
import type { Agent, Task } from '@/lib/types'
import { STATUS } from './bits'
import { cn } from '@/lib/utils'

const W = 188
const H = 58
const RANKSEP = 30
// The left gutter, for each wave's label.
const GUT = 74

interface Laid {
  nodes: { t: Task; x: number; y: number }[]
  edges: { from: string; to: string; points: { x: number; y: number }[]; critical: boolean }[]
  // Each wave's row: its middle and how many tasks it has.
  rows: { wave: number; y: number; n: number }[]
  width: number
  height: number
}

// Each task's wave: 0 without dependencies, else one more than its latest dependency's. Null when
// the dependencies loop.
function wavesOf(tasks: Task[]): Map<string, number> | null {
  const by = new Map(tasks.map((t) => [t.id, t]))
  const waves = new Map<string, number>()
  const open = new Set<string>()
  const of = (id: string): number => {
    const known = waves.get(id)
    if (known !== undefined) return known
    if (open.has(id)) throw new Error('dependency loop')
    open.add(id)
    const deps = by.get(id)!.deps.filter((d) => by.has(d))
    const n = deps.length ? 1 + Math.max(...deps.map(of)) : 0
    open.delete(id)
    waves.set(id, n)
    return n
  }
  try {
    for (const t of tasks) of(t.id)
  } catch {
    return null
  }
  return waves
}

// A dagre ranker that puts each task on its wave's row. Dagre has scaled every edge's minlen by
// then (it doubles them to leave room for edge labels): ranks scale the same. A node of its own (the
// root it hangs every node from) goes just above the nodes it points to.
function byWave(waves: Map<string, number>) {
  return (ig: Graph) => {
    let f = 2
    for (const e of ig.edges()) if (waves.has(e.v) && waves.has(e.w)) f = ig.edge(e).minlen ?? f
    for (const v of ig.nodes()) if (waves.has(v)) ig.node(v).rank = waves.get(v)! * f
    for (const v of ig.nodes()) {
      if (waves.has(v)) continue
      const above = (ig.outEdges(v) ?? []).map((e) => (waves.get(e.w) ?? 0) * f - (ig.edge(e).minlen ?? 1))
      ig.node(v).rank = above.length ? Math.min(...above) : 0
    }
  }
}

function lay(tasks: Task[], critical: Set<string>): Laid {
  const waves = wavesOf(tasks)
  const g = new Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 16, ranksep: RANKSEP, marginx: 6, marginy: waves ? 15 : 6 })
  // Dagre takes a function as its ranker; its types list only the built-in names.
  if (waves) Object.assign(g.graph(), { ranker: byWave(waves) })
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
  const rows = new Map<number, { wave: number; y: number; n: number }>()
  if (waves) {
    for (const { t, y } of nodes) {
      const wave = waves.get(t.id) ?? 0
      const r = rows.get(wave) ?? { wave, y: y + H / 2, n: 0 }
      r.n++
      rows.set(wave, r)
    }
  }
  const gr = g.graph()
  return { nodes, edges, rows: [...rows.values()].sort((a, b) => a.wave - b.wave), width: gr.width ?? W, height: gr.height ?? H }
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
  const gut = g.rows.length > 1 ? GUT : 0
  const width = g.width + gut
  const scale = avail > 0 ? Math.max(0.55, Math.min(1, avail / width)) : 1
  const running = useMemo(() => new Set(agents.map((a) => a.task).filter(Boolean) as string[]), [agents])

  return (
    <div ref={box} className="thin-scroll w-full overflow-x-auto">
      <svg
        width={width * scale}
        height={g.height * scale}
        viewBox={`0 0 ${width} ${g.height}`}
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
        {gut > 0 && g.rows.map((r) => (
          <g key={r.wave}>
            <title>{r.n > 1 ? `Wave ${r.wave + 1}: these ${r.n} tasks depend only on tasks in the rows above, so they can run at the same time (the lead still runs one after another tasks that touch the same files).` : `Wave ${r.wave + 1}: it depends only on tasks in the rows above.`}</title>
            {r.wave % 2 === 0 && <rect x={0} y={r.y - (H + RANKSEP) / 2} width={width} height={H + RANKSEP} rx={8} className="fill-muted/40" />}
            <text x={8} y={r.y - (r.n > 1 ? 3 : -4)} className="fill-muted-foreground text-[11px] font-semibold">Wave {r.wave + 1}</text>
            {r.n > 1 && <text x={8} y={r.y + 11} className="fill-muted-foreground/80 text-[10.5px]">{r.n} at once</text>}
          </g>
        ))}
        <g transform={`translate(${gut},0)`}>
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
        </g>
      </svg>
    </div>
  )
}
