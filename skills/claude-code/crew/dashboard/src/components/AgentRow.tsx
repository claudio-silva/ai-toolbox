import { Bot } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { modelShort } from '@/lib/format'
import { useClockBase } from '@/lib/clock'
import { Chip, Mono } from './bits'
import { cn } from '@/lib/utils'
import { Duration } from './Duration'

// A running subagent: who, on what, for how long (ticking on the page). With onOpen, the row
// opens its conversation.
export function AgentRow({ agent, onTask, onOpen }: { agent: Agent; onTask?: (id: string) => void; onOpen?: () => void }) {
  const base = useClockBase()
  const start = agent.runStart || agent.started
  const secs = start ? Math.max(0, base - start) : null
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen() } }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      title={onOpen ? 'Open its conversation' : undefined}
      className={cn('flex items-start gap-3 rounded-lg border bg-background/60 px-3 py-2.5', onOpen && 'cursor-pointer transition-colors hover:bg-accent/60')}
    >
      <div className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Bot className="size-4" />
        <span className="crew-pulse absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-primary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[13px] font-semibold">{agent.name || agent.type}</span>
          {agent.name && <span className="text-xs text-muted-foreground">{agent.type}</span>}
          {agent.kind === 'resume' && <Chip>resumed</Chip>}
          <span className="ml-auto tabular text-xs text-muted-foreground">{secs != null ? <Duration secs={secs} live /> : agent.since}</span>
        </div>
        {agent.description && (
          <div className="line-clamp-2 text-xs text-muted-foreground">
            {agent.task && onTask ? (
              <button className="mr-1 font-mono font-semibold text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); onTask(agent.task!) }}>{agent.task}</button>
            ) : null}
            {agent.task && onTask ? agent.description.replace(/^[Tt]0*[0-9]+\s*/, '') : agent.description}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          <Chip>{modelShort(agent.model)}</Chip>
          <Chip>{agent.effort}</Chip>
          <Chip title="Agent id"><Mono className="text-[10.5px]">{agent.id.slice(0, 10)}</Mono></Chip>
        </div>
      </div>
    </div>
  )
}
