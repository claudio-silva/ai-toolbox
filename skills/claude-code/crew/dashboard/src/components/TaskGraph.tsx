// The task set's dependency graph: dagre lays it out top-down (narrow panels read a column
// better than a row), React draws it as SVG and scales it to the panel width. Each row is a wave:
// the tasks that can start once every row above it is done, so a row's width is how many can run
// at once. Dagre would otherwise move a task down beside the one it feeds.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
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

// The dependencies worth an arrow: one that another already implies (T01 → T13 when T13 needs
// T12, which comes after T04, which needs T01) is left out. The task's sheet lists them all.
function directDeps(tasks: Task[]): Map<string, string[]> {
  const by = new Map(tasks.map((t) => [t.id, [...new Set(t.deps)].filter((d) => d !== t.id && tasks.some((o) => o.id === d))]))
  const anc = new Map<string, Set<string>>()
  const ancestors = (id: string): Set<string> => {
    let a = anc.get(id)
    if (a) return a
    a = new Set()
    anc.set(id, a)
    for (const d of by.get(id) ?? []) {
      a.add(d)
      for (const x of ancestors(d)) a.add(x)
    }
    return a
  }
  return new Map([...by].map(([id, deps]) => [id, deps.filter((d) => !deps.some((o) => o !== d && ancestors(o).has(d)))]))
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
  // Without waves the dependencies loop: every arrow then, as given.
  const deps = waves ? directDeps(tasks) : new Map(tasks.map((t) => [t.id, t.deps]))
  for (const t of tasks) for (const d of deps.get(t.id) ?? []) if (ids.has(d) && d !== t.id) g.setEdge(d, t.id)
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

// The graph as SVG, `px` wide. A click on a task picks it; anywhere else, onBackground (when given:
// the cursor then shows a magnifier).
function Drawing({ g, px, running, current, onPick, onBackground, className }: {
  g: Laid
  px: number
  running: Set<string>
  current: string | null
  onPick: (id: string) => void
  onBackground?: () => void
  className?: string
}) {
  const gut = g.rows.length > 1 ? GUT : 0
  const width = g.width + gut
  const bg = onBackground ? 'cursor-zoom-in' : undefined
  return (
    <svg width={px} height={(g.height * px) / width} viewBox={`0 0 ${width} ${g.height}`} className={cn('block', className)} role="img" aria-label="Task dependency graph">
      <defs>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" />
        </marker>
        <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" className="fill-primary" />
        </marker>
      </defs>
      <rect width={width} height={g.height} fill="transparent" className={bg} onClick={onBackground} />
      {gut > 0 && g.rows.map((r) => (
        <g key={r.wave} className={bg} onClick={onBackground}>
          <title>{r.n > 1 ? `Wave ${r.wave + 1}: these ${r.n} tasks depend only on tasks in the rows above, so they can run at the same time (the lead still runs one after another tasks that touch the same files).` : `Wave ${r.wave + 1}: it depends only on tasks in the rows above.`}</title>
          {r.wave % 2 === 0 && <rect x={0} y={r.y - (H + RANKSEP) / 2} width={width} height={H + RANKSEP} rx={8} className="fill-muted/40" />}
          <text x={8} y={r.y - (r.n > 1 ? 3 : -4)} className="fill-muted-foreground text-[11px] font-semibold">Wave {r.wave + 1}</text>
          {r.n > 1 && <text x={8} y={r.y + 11} className="fill-muted-foreground/80 text-[10.5px]">{r.n} at once</text>}
        </g>
      ))}
      <g transform={`translate(${gut},0)`}>
        <g className="pointer-events-none">
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
        </g>
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
  )
}

// zoomed: the graph fills the window (onZoom opens and closes it); a click on it, away from a
// task, opens it too.
export function TaskGraph({ tasks, agents, current, criticalPath, onPick, zoomed, onZoom }: {
  tasks: Task[]
  agents: Agent[]
  current: string | null
  criticalPath: string[]
  onPick: (id: string) => void
  zoomed: boolean
  onZoom: (open: boolean) => void
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
  const width = g.width + (g.rows.length > 1 ? GUT : 0)
  // Fit to the panel; below 55% the graph scrolls sideways instead of shrinking further.
  const scale = avail > 0 ? Math.max(0.55, Math.min(1, avail / width)) : 1
  const running = useMemo(() => new Set(agents.map((a) => a.task).filter(Boolean) as string[]), [agents])
  const win = useRef<HTMLDivElement>(null)

  return (
    <>
      <div ref={box} className="thin-scroll w-full overflow-x-auto">
        <Drawing g={g} px={width * scale} running={running} current={current} onPick={onPick} onBackground={() => onZoom(true)} className="mx-auto" />
      </div>
      <DialogPrimitive.Root open={zoomed} onOpenChange={onZoom}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            ref={win}
            aria-describedby={undefined}
            // Focus on the window, not its first button: the keys zoom at once.
            onOpenAutoFocus={(e) => { e.preventDefault(); win.current?.focus() }}
            className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl border bg-background shadow-lg outline-none sm:inset-4">
            {zoomed && (
              <ZoomView g={g} width={width} running={running} current={current} onPick={(id) => { onZoom(false); onPick(id) }} />
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}

const MAX_ZOOM = 4

// The graph in a window of its own: it opens fitted, as large as the window allows; the wheel (or a
// pinch) zooms where the pointer is, a drag moves it, the buttons zoom, fit and close.
function ZoomView({ g, width, running, current, onPick }: {
  g: Laid
  width: number
  running: Set<string>
  current: string | null
  onPick: (id: string) => void
}) {
  const port = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<{ k: number; x: number; y: number } | null>(null)
  const fitK = useRef(1)
  const fit = useCallback(() => {
    const el = port.current
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const k = Math.min(MAX_ZOOM, Math.max(0.05, Math.min((vw - 32) / width, (vh - 32) / g.height)))
    fitK.current = k
    setView({ k, x: (vw - width * k) / 2, y: (vh - g.height * k) / 2 })
  }, [width, g.height])
  useLayoutEffect(fit, [fit])
  useEffect(() => {
    const el = port.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  // Zoom by f around (px, py), a point in the viewport; from half the fitted size to MAX_ZOOM.
  const zoomAt = useCallback((px: number, py: number, f: number) => {
    setView((v) => {
      if (!v) return v
      const k = Math.min(MAX_ZOOM, Math.max(fitK.current / 2, v.k * f))
      const r = k / v.k
      return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r }
    })
  }, [])
  const zoomMid = useCallback((f: number) => {
    const r = port.current?.getBoundingClientRect()
    if (r) zoomAt(r.width / 2, r.height / 2, f)
  }, [zoomAt])

  // + - 0 wherever the focus is in the window (Ctrl and Cmd with them stay the browser's zoom).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '+' || e.key === '=') zoomMid(1.25)
      else if (e.key === '-' || e.key === '_') zoomMid(1 / 1.25)
      else if (e.key === '0') fit()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [zoomMid, fit])

  // The wheel, with a listener of our own: React's is passive and cannot keep the page still.
  useEffect(() => {
    const el = port.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * r.height : e.deltaY
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.002))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // Drag to move, two fingers to pinch. A press that moved is no click on a task.
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const travel = useRef(0)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pts.current
      const prev = p.get(e.pointerId)
      const el = port.current
      if (!prev || !el) return
      const r = el.getBoundingClientRect()
      if (p.size === 1) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        travel.current += Math.abs(dx) + Math.abs(dy)
        setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy })
      } else if (p.size === 2) {
        const other = [...p].find(([id]) => id !== e.pointerId)![1]
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y)
        const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        const mx = (e.clientX + other.x) / 2 - r.left
        const my = (e.clientY + other.y) / 2 - r.top
        const dx = mx - ((prev.x + other.x) / 2 - r.left)
        const dy = my - ((prev.y + other.y) / 2 - r.top)
        travel.current += 10
        setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy })
        if (d0 > 0) zoomAt(mx, my, d1 / d0)
      }
      p.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const up = (e: PointerEvent) => {
      pts.current.delete(e.pointerId)
      if (pts.current.size === 0) setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [zoomAt])

  const btn = 'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <DialogPrimitive.Title className="text-sm font-semibold">Dependencies</DialogPrimitive.Title>
        <span className="hidden text-xs text-muted-foreground sm:inline">Wheel or pinch to zoom, drag to move</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button className={btn} onClick={() => zoomMid(1 / 1.25)} title="Zoom out (−)" aria-label="Zoom out"><Minus className="size-4" /></button>
          <span className="tabular w-11 text-center text-xs text-muted-foreground">{view ? `${Math.round(view.k * 100)}%` : ''}</span>
          <button className={btn} onClick={() => zoomMid(1.25)} title="Zoom in (+)" aria-label="Zoom in"><Plus className="size-4" /></button>
          <button className={cn(btn, 'w-auto px-2 text-xs font-medium')} onClick={fit} title="Fit the graph to the window (0)">Fit</button>
          <DialogPrimitive.Close className={btn} title="Back (Esc)" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
        </div>
      </div>
      <div
        ref={port}
        tabIndex={-1}
        className={cn('relative flex-1 touch-none overflow-hidden outline-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          if (pts.current.size === 0) travel.current = 0
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          setDragging(true)
        }}
      >
        {view && (
          <div className="absolute top-0 left-0" style={{ transform: `translate(${view.x}px, ${view.y}px)` }}>
            <Drawing g={g} px={width * view.k} running={running} current={current} onPick={(id) => { if (travel.current < 5) onPick(id) }} />
          </div>
        )}
      </div>
    </>
  )
}
