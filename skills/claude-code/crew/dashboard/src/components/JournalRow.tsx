import { ArrowLeft, ArrowRight, Cog, MessageSquare, RotateCcw, type LucideIcon } from 'lucide-react'
import type { JournalEntry } from '@/lib/types'
import { modelShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, Inline } from './bits'

const KIND: Record<JournalEntry['kind'], { icon: LucideIcon; cls: string }> = {
  lead: { icon: MessageSquare, cls: 'bg-primary/10 text-primary' },
  system: { icon: Cog, cls: 'bg-muted text-muted-foreground' },
  start: { icon: ArrowRight, cls: 'bg-st-progress/14 text-st-progress' },
  stop: { icon: ArrowLeft, cls: 'bg-st-accepted/12 text-st-accepted' },
  resume: { icon: RotateCcw, cls: 'bg-st-review/13 text-st-review' },
  other: { icon: MessageSquare, cls: 'bg-muted text-muted-foreground' },
}

const VERDICT: Record<string, string> = {
  ACCEPT: 'text-st-accepted', DONE: 'text-st-accepted', finished: 'text-st-accepted',
  PARTIAL: 'text-st-progress', RECOMMENDATION: 'text-st-review', CHANGES: 'text-st-rework', BLOCKED: 'text-st-blocked',
}

function who(e: JournalEntry): string {
  if (e.kind === 'start') return `${e.by ? `${e.by} → ` : '→ '}${e.agentType ?? ''}`
  if (e.kind === 'stop') return `← ${e.agentType ?? ''}`
  if (e.kind === 'resume') return `↺ ${e.agentName ?? ''}`
  return e.actor
}

// One journal line: time, who, what. Agent starts show model and effort; stops lead with the
// verdict when there is one.
export function JournalRow({ e, compact }: { e: JournalEntry; compact?: boolean }) {
  const k = KIND[e.kind]
  const Icon = k.icon
  let text = e.text
  let verdict: string | null = null
  if (e.kind === 'stop' && e.status) {
    verdict = e.status
    text = text.split(' · ').slice(1).join(' · ')
  }
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="tabular w-10 shrink-0 pt-0.5 text-[11.5px] text-muted-foreground">{e.time}</span>
      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md', k.cls)}><Icon className="size-3" strokeWidth={2.5} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] leading-snug">
          <span className="font-semibold">{who(e)}</span>
          {e.model && <Chip className="py-0 text-[10.5px]">{modelShort(e.model)}{e.effort ? ` · ${e.effort}` : ''}</Chip>}
          {e.branch && <Chip className="py-0 font-mono text-[10.5px]">{e.branch}</Chip>}
          {verdict && <span className={cn('text-[11px] font-bold tracking-wide', VERDICT[verdict] ?? 'text-muted-foreground')}>{verdict}</span>}
        </div>
        {text && <div className={cn('text-[12.5px] leading-snug text-muted-foreground', compact && 'line-clamp-2')}><Inline text={text} /></div>}
      </div>
    </div>
  )
}
