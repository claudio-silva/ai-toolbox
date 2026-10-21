// An agent's transcript as a conversation: the founder's messages on the right, the agent's
// text, thinking and tool calls (each with its result, folded) on the left, compactions as
// dividers. It follows new lines while scrolled to the bottom; scrolled up, a button says there
// is more below.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown, Brain, ChevronRight, CircleAlert, FileText, Globe, LoaderCircle, MessagesSquare, Pencil, Search, Shrink, Sparkles, SquareTerminal, Users, Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Entry } from '@/lib/types'
import { hm, kTokens } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MdText } from './MdText'

type Result = Extract<Entry, { kind: 'result' }>
type Tool = Extract<Entry, { kind: 'tool' }>

const TOOL_ICON: Record<string, LucideIcon> = {
  Bash: SquareTerminal, Read: FileText, Write: Pencil, Edit: Pencil, NotebookEdit: Pencil, Grep: Search, Glob: Search,
  Agent: Users, Task: Users, Skill: Sparkles, WebFetch: Globe, WebSearch: Globe,
}

function Fold({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button onClick={() => setOpen(!open)} className="group flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        {head}
      </button>
      {open && <div className="mt-1 mb-1.5 ml-5">{children}</div>}
    </div>
  )
}

const PRE = 'max-h-72 overflow-auto rounded-lg border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words'

function ToolRow({ t, r }: { t: Tool; r?: Result }) {
  const Icon = TOOL_ICON[t.name] ?? Wrench
  return (
    <Fold head={
      <>
        <Icon className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-foreground/80">{t.name}</span>
        <span className="min-w-0 truncate font-mono text-[11px]">{t.summary}</span>
        <span className="ml-auto shrink-0 pl-2">
          {!r ? <LoaderCircle className="size-3 animate-spin" /> : r.error ? <CircleAlert className="size-3.5 text-st-rework" /> : null}
        </span>
      </>
    }>
      <div className="flex flex-col gap-1.5">
        {t.detail && <pre className={PRE}>{t.detail}</pre>}
        {r && <pre className={cn(PRE, r.error && 'border-st-rework/40 text-st-rework')}>{r.text || '(no output)'}</pre>}
      </div>
    </Fold>
  )
}

function Stamp({ ts }: { ts: number }) {
  const d = new Date(ts * 1000)
  const today = new Date().toDateString() === d.toDateString()
  return (
    <div className="my-2 text-center text-[10.5px] text-muted-foreground tabular">
      {today ? hm(ts) : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${hm(ts)}`}
    </div>
  )
}

function Item({ e, results }: { e: Entry; results: Map<string, Result> }) {
  switch (e.kind) {
    case 'user':
      return (
        <div className="flex flex-col items-end gap-0.5 py-1.5">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/12 px-3.5 py-2 text-[13px] break-words whitespace-pre-wrap">{e.text}</div>
          {e.via && <span className="pr-1 text-[10.5px] text-muted-foreground">from the dashboard</span>}
        </div>
      )
    case 'peer':
      return (
        <div className="flex flex-col items-start gap-0.5 py-1.5">
          <span className="flex items-center gap-1 pl-1 text-[10.5px] text-muted-foreground"><MessagesSquare className="size-3" /> from another Claude session</span>
          <div className="max-w-[85%] rounded-2xl rounded-bl-md border px-3.5 py-2 text-[13px] break-words whitespace-pre-wrap">{e.text}</div>
        </div>
      )
    case 'text':
      return <MdText text={e.text} className="py-1.5 text-[13px]" />
    case 'error':
      return <div className="my-1.5 rounded-lg border border-st-rework/40 bg-st-rework/8 px-3 py-2 text-[12.5px] text-st-rework">{e.text}</div>
    case 'thinking':
      return (
        <Fold head={<><Brain className="size-3.5 shrink-0" /><span className="italic">Thinking</span></>}>
          <p className="text-[12px] whitespace-pre-wrap text-muted-foreground italic">{e.text}</p>
        </Fold>
      )
    case 'tool':
      return <ToolRow t={e} r={results.get(e.id)} />
    case 'summary':
      return (
        <Fold head={<><Shrink className="size-3.5 shrink-0" />The summary the agent continued from</>}>
          <MdText text={e.text} className="text-[12px] text-muted-foreground" />
        </Fold>
      )
    case 'compact':
      return (
        <div className="my-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <Shrink className="size-3.5" /> Context compacted{e.pre ? ` at ${kTokens(e.pre)}` : ''}
          <span className="h-px flex-1 bg-border" />
        </div>
      )
    default:
      return null
  }
}

const PAGE = 250

export function Transcript({ entries, more, earlier, empty }: {
  entries: Entry[]
  more: boolean
  earlier: () => Promise<void>
  empty?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [below, setBelow] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [loading, setLoading] = useState(false)

  const results = useMemo(() => {
    const m = new Map<string, Result>()
    for (const e of entries) if (e.kind === 'result') m.set(e.id, e)
    return m
  }, [entries])
  const items = useMemo(() => entries.filter((e) => e.kind !== 'result'), [entries])
  const shown = items.slice(-limit)
  const hidden = items.length - shown.length

  // Follow new lines while at the bottom; keep the place when older ones are added above.
  const lastKey = items[items.length - 1]?.key
  const prevHeight = useRef(0)
  const prevFirst = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const first = shown[0]?.key
    if (prevFirst.current && first !== prevFirst.current && !pinned.current) el.scrollTop += el.scrollHeight - prevHeight.current
    else if (pinned.current) el.scrollTop = el.scrollHeight
    else setBelow(true)
    prevFirst.current = first
    prevHeight.current = el.scrollHeight
  }, [lastKey, shown.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = box.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (pinned.current) setBelow(false)
    prevHeight.current = el.scrollHeight
  }
  const toBottom = () => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const showEarlier = async () => {
    pinned.current = false
    if (hidden > 0) { setLimit((l) => l + PAGE); return }
    setLoading(true)
    await earlier()
    setLoading(false)
    setLimit((l) => l + PAGE)
  }

  let prevTs = 0
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={box} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-5">
        {(hidden > 0 || more) && (
          <div className="flex justify-center pt-3">
            <button onClick={showEarlier} className="rounded-full border px-3 py-1 text-[11.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
              {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : 'Show earlier'}
            </button>
          </div>
        )}
        {!items.length && <div className="grid h-full place-items-center text-[12.5px] text-muted-foreground">{empty}</div>}
        {shown.map((e) => {
          const stamp = e.ts && e.ts - prevTs > 600 ? <Stamp ts={e.ts} /> : null
          if (e.ts) prevTs = e.ts
          return <div key={e.key}>{stamp}<Item e={e} results={results} /></div>
        })}
      </div>
      {below && (
        <button onClick={toBottom} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover/95 px-3 py-1 text-[11.5px] shadow-md backdrop-blur hover:bg-accent">
          <ArrowDown className="size-3.5" /> New activity
        </button>
      )}
    </div>
  )
}
