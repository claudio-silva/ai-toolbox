import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Bot, Bug, ChevronDown, Gauge, GitBranch, Inbox, Layers, ListChecks, Monitor, Moon, Pause, Play, PowerOff, ScrollText, Shrink, Square, Sun, Timer,
  type LucideIcon,
} from 'lucide-react'
import type { State } from '@/lib/types'
import type { Conn } from '@/lib/live'
import type { Tab, Theme } from '@/lib/persist'
import { useClockBase } from '@/lib/clock'
import { capital } from '@/lib/format'
import { Duration } from './Duration'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

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
  const base = useClockBase()
  const { lead, agents } = state
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
  } else if (lead.state === 'closed') {
    icon = PowerOff; text = 'Claude Code closed'; tone = 'bg-muted text-muted-foreground ring-border'
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
          <span className="font-normal opacity-75">
            {' '}· since {lead.since}
            {lead.state === 'working' && lead.sinceEpoch != null && <> (<Duration secs={Math.max(0, base - lead.sinceEpoch)} live />)</>}
          </span>
        )}
      </span>
    </span>
  )
}

function ConnDot({ conn, changedAt }: { conn: Conn; changedAt: number }) {
  const label = conn === 'live' ? 'Live' : conn === 'connecting' ? 'Connecting' : conn === 'reconnecting' ? 'Reconnecting' : 'Offline'
  const cls = conn === 'live' ? 'bg-st-accepted' : conn === 'offline' ? 'bg-st-rework' : 'bg-st-progress'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground">
          <span className={cn('size-2 rounded-full', cls, conn !== 'live' && 'crew-pulse')} />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}{changedAt ? <> · unchanged for <Duration secs={0} at={changedAt / 1000} live /></> : ''}. Updates arrive as crew files change.
      </TooltipContent>
    </Tooltip>
  )
}

// Crew's mark: three linked nodes.
function CrewMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.6_0.2_320)] text-primary-foreground shadow-sm">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="7" cy="8" r="2.5" /><circle cx="17" cy="8" r="2.5" /><circle cx="12" cy="16.5" r="2.5" /><path d="M9 9.5l1.8 4.6M15 9.5l-1.8 4.6M9.5 8h5" /></svg>
    </span>
  )
}

const DEFAULT_FAVICON = typeof document !== 'undefined' ? document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? '' : ''

// The project's icon when the server found one, else crew's mark. Clicking toggles between the
// two; turning a found icon off is remembered for that file, per project.
function Logo({ state }: { state: State | null }) {
  const icon = state?.repo.icon ?? null
  const key = state ? `crew-dashboard:icon-off:${state.repo.root}` : ''
  const [offFor, setOffFor] = useState<string | null>(() => {
    try { return key ? localStorage.getItem(key) : null } catch { return null }
  })
  const [broken, setBroken] = useState<string | null>(null)
  useEffect(() => {
    try { setOffFor(key ? localStorage.getItem(key) : null) } catch { /* private mode */ }
  }, [key])
  const src = icon ? `api/icon?v=${icon.mtime}` : ''
  const use = Boolean(icon) && offFor !== icon!.path && broken !== src

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = use ? src : DEFAULT_FAVICON
  }, [use, src])

  if (!icon || broken === src) return <CrewMark />
  const toggle = () => {
    const next = use ? icon.path : null
    try { if (next) localStorage.setItem(key, next); else localStorage.removeItem(key) } catch { /* private mode */ }
    setOffFor(next)
  }
  return (
    <button
      onClick={toggle}
      title={use ? `The project's icon (${icon.path}). Click for crew's icon.` : `Click for the project's icon (${icon.path}).`}
      className="shrink-0 rounded-lg transition-opacity hover:opacity-80"
    >
      {use ? (
        <img src={src} alt="" width={28} height={28} onError={() => setBroken(src)} className="size-7 object-contain" />
      ) : (
        <CrewMark />
      )}
    </button>
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

type Badges = Partial<Record<Tab, { n: number | string; tone?: 'warn' | 'muted' }>>

const TAB_CLS = 'relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 pt-1.5 pb-2.5 text-[12.5px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset'

function TabBadge({ b }: { b?: Badges[Tab] }) {
  if (!b || b.n === 0 || b.n === '') return null
  return (
    <span className={cn(
      'tabular rounded-full px-1.5 text-[10.5px] leading-4',
      b.tone === 'warn' ? 'bg-st-progress/18 text-st-progress' : 'bg-muted text-muted-foreground',
    )}>{b.n}</span>
  )
}

function TabLabel({ t, b }: { t: Tab; b?: Badges[Tab] }) {
  const m = TAB_META[t]
  const Icon = m.icon
  return <><Icon className="size-3.5" />{m.label}<TabBadge b={b} /></>
}

const GAP = 2 // gap-0.5

// The tabs that fit, and a "N more" menu for the rest. The tabs are measured in a hidden copy
// of the strip, so the split follows the window's width and the badges' contents. The current
// tab always stays in view; the others keep their order.
function TabStrip({ tab, setTab, badges }: { tab: Tab; setTab: (t: Tab) => void; badges: Badges }) {
  const tabs = Object.keys(TAB_META) as Tab[]
  const box = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; tabs: number[]; more: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const g = ghost.current
      const b = box.current
      if (!g || !b) return
      const ws = Array.from(g.children, (c) => (c as HTMLElement).offsetWidth)
      setSize({ w: b.clientWidth, tabs: ws.slice(0, -1), more: ws[ws.length - 1] })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    if (ghost.current) ro.observe(ghost.current)
    return () => ro.disconnect()
  }, [])

  let shown = tabs
  if (size) {
    const all = size.tabs.reduce((a, w) => a + w + GAP, -GAP)
    if (all > size.w) {
      const avail = size.w - size.more - GAP
      const ai = tabs.indexOf(tab)
      const keep = new Set<Tab>([tab])
      let used = size.tabs[ai]
      for (let i = 0; i < tabs.length; i++) {
        if (i === ai) continue
        if (used + GAP + size.tabs[i] > avail) break
        keep.add(tabs[i])
        used += GAP + size.tabs[i]
      }
      shown = tabs.filter((t) => keep.has(t))
    }
  }
  const hidden = tabs.filter((t) => !shown.includes(t))
  const warn = hidden.some((t) => badges[t]?.tone === 'warn')

  return (
    <div className="relative -mx-3 flex px-2 sm:-mx-5 sm:px-4">
      <div ref={box} role="tablist" className="flex min-w-0 flex-1 gap-0.5 overflow-hidden">
        {shown.map((t) => {
          const active = t === tab
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(TAB_CLS, active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <TabLabel t={t} b={badges[t]} />
              {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          )
        })}
        {hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label={`${hidden.length} more tabs`} className={cn(TAB_CLS, 'text-muted-foreground hover:text-foreground data-[state=open]:text-foreground')}>
                {hidden.length} more
                <ChevronDown className="size-3.5" />
                {warn && <span className="absolute top-1.5 right-1 size-1.5 rounded-full bg-st-progress" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hidden.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setTab(t)}>
                  <TabLabel t={t} b={badges[t]} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* Outside the strip, so the strip never gets wider than what it shows (or scrolls). */}
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={ghost} className="flex w-max gap-0.5">
          {tabs.map((t) => <span key={t} className={TAB_CLS}><TabLabel t={t} b={badges[t]} /></span>)}
          <span className={TAB_CLS}>{tabs.length - 1} more<ChevronDown className="size-3.5" /></span>
        </div>
      </div>
    </div>
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
  badges: Badges
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-3 pt-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Logo state={state} />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-[15px] font-semibold tracking-tight">{state ? capital(state.repo.name) : 'Crew'}</span>
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
        <TabStrip tab={tab} setTab={setTab} badges={badges} />
      </div>
    </header>
  )
}
