import { useEffect, useRef } from 'react'
import {
  Bot, Bug, Gauge, GitBranch, Inbox, Layers, ListChecks, Monitor, Moon, Pause, Play, ScrollText, Shrink, Square, Sun, Timer,
  type LucideIcon,
} from 'lucide-react'
import type { State } from '@/lib/types'
import type { Conn } from '@/lib/live'
import { useNow } from '@/lib/live'
import type { Tab, Theme } from '@/lib/persist'
import { sinceHM, span } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const TAB_META: Record<Tab, { label: string; icon: LucideIcon }> = {
  overview: { label: 'Overview', icon: Gauge },
  tasks: { label: 'Tasks', icon: ListChecks },
  timing: { label: 'Timing', icon: Timer },
  queue: { label: 'Requests', icon: Inbox },
  defects: { label: 'Defects', icon: Bug },
  compactions: { label: 'Compactions', icon: Shrink },
  journal: { label: 'Journal', icon: ScrollText },
  sets: { label: 'Sets', icon: Layers },
}

function LeadPill({ state }: { state: State }) {
  const now = useNow()
  const { lead, agents } = state
  const since = sinceHM(lead.since, now)
  const n = agents.length
  let icon: LucideIcon = Pause
  let text = 'Waiting for you'
  let tone = 'bg-st-progress/14 text-st-progress ring-st-progress/30'
  let pulse = false
  if (lead.state === 'working') {
    icon = Play; text = 'Lead working'; tone = 'bg-primary/12 text-primary ring-primary/30'; pulse = true
  } else if (lead.state === 'agents') {
    icon = Bot; text = `${n} agent${n === 1 ? '' : 's'} working · lead idle`; tone = 'bg-st-review/13 text-st-review ring-st-review/30'; pulse = true
  } else if (lead.state === 'stopped') {
    icon = Square; text = 'Stopped by you'; tone = 'bg-muted text-muted-foreground ring-border'
  }
  const Icon = icon
  const extra = lead.state === 'stopped' && n > 0 ? ` · ${n} finishing` : lead.state === 'working' && n > 0 ? ` · ${n} agent${n === 1 ? '' : 's'}` : ''
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', tone)}>
      {pulse ? (
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      ) : (
        <Icon className="size-3.5 shrink-0" strokeWidth={2.5} />
      )}
      <span className="truncate">
        {text}{extra}
        {lead.since && lead.state !== 'agents' && (
          <span className="font-normal opacity-75"> · since {lead.since}{since != null && since >= 60 ? ` (${span(since)})` : ''}</span>
        )}
      </span>
    </span>
  )
}

function ConnDot({ conn, changedAt }: { conn: Conn; changedAt: number }) {
  const now = useNow(5000)
  const label = conn === 'live' ? 'Live' : conn === 'connecting' ? 'Connecting' : conn === 'reconnecting' ? 'Reconnecting' : 'Offline'
  const cls = conn === 'live' ? 'bg-st-accepted' : conn === 'offline' ? 'bg-st-rework' : 'bg-st-progress'
  const ago = changedAt ? Math.round((now - changedAt) / 1000) : null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground">
          <span className={cn('size-2 rounded-full', cls, conn !== 'live' && 'crew-pulse')} />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}{ago != null ? ` · last change ${ago < 60 ? `${ago} s` : span(ago)} ago` : ''}. Updates arrive as crew files change.
      </TooltipContent>
    </Tooltip>
  )
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
  const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Theme: ${theme} (click for ${next})`}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  )
}

export function Header({ state, conn, changedAt, theme, setTheme, tab, setTab, badges }: {
  state: State | null
  conn: Conn
  changedAt: number
  theme: Theme
  setTheme: (t: Theme) => void
  tab: Tab
  setTab: (t: Tab) => void
  badges: Partial<Record<Tab, { n: number | string; tone?: 'warn' | 'muted' }>>
}) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-3 pt-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.6_0.2_320)] text-primary-foreground shadow-sm">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="7" cy="8" r="2.5" /><circle cx="17" cy="8" r="2.5" /><circle cx="12" cy="16.5" r="2.5" /><path d="M9 9.5l1.8 4.6M15 9.5l-1.8 4.6M9.5 8h5" /></svg>
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-[15px] font-semibold tracking-tight">{state?.repo.name ?? 'Crew'}</span>
              <span className="text-[11px] font-medium text-muted-foreground">crew</span>
            </div>
            {state && (
              <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <GitBranch className="size-3 shrink-0" />
                <span className="truncate">{state.repo.branch}</span>
                {state.repo.sha && <span className="font-mono opacity-80">@{state.repo.sha}</span>}
              </span>
            )}
          </div>
          <ConnDot conn={conn} changedAt={changedAt} />
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
        {state && <div className="flex min-w-0"><LeadPill state={state} /></div>}
        <div ref={strip} role="tablist" className="no-scrollbar -mx-3 flex gap-0.5 overflow-x-auto px-2 sm:-mx-5 sm:px-4">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const m = TAB_META[t]
            const Icon = m.icon
            const b = badges[t]
            const active = t === tab
            return (
              <button
                key={t}
                role="tab"
                data-tab={t}
                aria-selected={active}
                onClick={() => setTab(t)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 px-2.5 pt-1.5 pb-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {m.label}
                {b && b.n !== 0 && b.n !== '' && (
                  <span className={cn(
                    'tabular rounded-full px-1.5 text-[10.5px] leading-4',
                    b.tone === 'warn' ? 'bg-st-progress/18 text-st-progress' : 'bg-muted text-muted-foreground',
                  )}>{b.n}</span>
                )}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
