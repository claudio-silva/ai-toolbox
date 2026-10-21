import { Fragment, useState, type ReactNode } from 'react'
import {
  ChevronRight, Circle, CircleCheckBig, CircleHelp, CircleSlash, LoaderCircle, RotateCw, Eye,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Counts, StatusKey } from '@/lib/types'

// ---- statuses ----

export const STATUS: Record<StatusKey, { label: string; icon: LucideIcon; text: string; bg: string; soft: string; ring: string }> = {
  accepted: { label: 'accepted', icon: CircleCheckBig, text: 'text-st-accepted', bg: 'bg-st-accepted', soft: 'bg-st-accepted/12', ring: 'ring-st-accepted/40' },
  progress: { label: 'in progress', icon: LoaderCircle, text: 'text-st-progress', bg: 'bg-st-progress', soft: 'bg-st-progress/14', ring: 'ring-st-progress/45' },
  review: { label: 'in review', icon: Eye, text: 'text-st-review', bg: 'bg-st-review', soft: 'bg-st-review/13', ring: 'ring-st-review/45' },
  rework: { label: 'rework', icon: RotateCw, text: 'text-st-rework', bg: 'bg-st-rework', soft: 'bg-st-rework/13', ring: 'ring-st-rework/45' },
  blocked: { label: 'blocked', icon: CircleSlash, text: 'text-st-blocked', bg: 'bg-st-blocked', soft: 'bg-st-blocked/14', ring: 'ring-st-blocked/40' },
  pending: { label: 'pending', icon: Circle, text: 'text-st-pending', bg: 'bg-st-pending', soft: 'bg-st-pending/12', ring: 'ring-st-pending/35' },
}
export const STATUS_ORDER: StatusKey[] = ['accepted', 'review', 'progress', 'rework', 'blocked', 'pending']

export function StatusIcon({ status, className }: { status: StatusKey; className?: string }) {
  const s = STATUS[status]
  const Icon = s.icon
  return <Icon className={cn('size-4 shrink-0', s.text, className)} strokeWidth={2.25} />
}

export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', s.soft, s.text, className)}>
      <StatusIcon status={status} className="size-3" />
      {s.label}
    </span>
  )
}

// A bar split by status, in a fixed order, with accepted first.
export function StatusBar({ counts, total, className }: { counts: Counts; total: number; className?: string }) {
  return (
    <div className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      {total > 0 && STATUS_ORDER.filter((k) => k !== 'pending').map((k) =>
        counts[k] > 0 ? (
          <div key={k} className={cn('h-full transition-all duration-500', STATUS[k].bg)} style={{ width: `${(counts[k] * 100) / total}%` }} />
        ) : null,
      )}
    </div>
  )
}

export function StatusLegend({ counts }: { counts: Counts }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {STATUS_ORDER.filter((k) => counts[k] > 0).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', STATUS[k].bg)} />
          <span className="tabular text-foreground">{counts[k]}</span> {STATUS[k].label}
        </span>
      ))}
    </div>
  )
}

// ---- layout ----

export function Panel({ title, icon: Icon, action, help, children, className, bodyClassName }: {
  title?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  help?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)}>
      {(title || action || help) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
          <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold tracking-tight">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{title}</span>
          </h2>
          <span className="flex shrink-0 items-center gap-1">
            {action}
            {help && <HelpButton open={open} onClick={() => setOpen(!open)} />}
          </span>
        </header>
      )}
      {help && open && <HelpBody className="mx-4 mt-2">{help}</HelpBody>}
      <div className={cn('px-4 pt-2 pb-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone, onClick, icon: Icon }: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: 'warn' | 'good' | 'bad' | 'muted'
  onClick?: () => void
  icon?: LucideIcon
}) {
  const toneCls =
    tone === 'warn' ? 'border-st-progress/40 bg-st-progress/8' :
    tone === 'bad' ? 'border-st-rework/40 bg-st-rework/8' :
    tone === 'good' ? 'border-st-accepted/35 bg-st-accepted/6' : ''
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-start gap-0.5 rounded-xl border bg-card px-3 py-2.5 text-left shadow-xs transition-colors',
        onClick && 'cursor-pointer hover:bg-accent/60',
        toneCls,
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
      <span className="tabular text-xl leading-tight font-semibold tracking-tight">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Comp>
  )
}

export function Empty({ icon: Icon, title, children }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      {Icon && <Icon className="size-6 text-muted-foreground/70" />}
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted-foreground">{children}</div>}
    </div>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[12px] tracking-tight', className)}>{children}</span>
}

export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground', className)}>
      {children}
    </span>
  )
}

// Where a request, question or defect is kept: its task set's files, or the project's backlog.
export function PlaceChip({ place }: { place: string }) {
  return <Chip className={cn('py-0 text-[10.5px]', place === 'backlog' && 'border-dashed')}>{place}</Chip>
}

export function Dot({ className, pulse }: { className?: string; pulse?: boolean }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', pulse && 'crew-pulse', className)} />
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">{children}</p>
}

// ---- explanations ----
// The page explains itself in disclosures that take no room until opened: the "?" in a panel's
// header (Panel's `help`), or an Explain row under a group. Open, they show formatted text:
// short paragraphs, small headings and term lists.

export function HelpButton({ open, onClick, label = 'What this shows' }: { open: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? 'Hide the explanation' : label}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        open && 'bg-accent text-foreground',
      )}
    >
      <CircleHelp className="size-3.5" />
    </button>
  )
}

export function HelpBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground', className)}>
      {children}
    </div>
  )
}

export function HelpHead({ children }: { children: ReactNode }) {
  return <h3 className="text-[10.5px] font-semibold tracking-wide text-foreground/80 uppercase">{children}</h3>
}

// A definition list: [term, what it means].
export function Terms({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
      {items.map(([t, d], i) => (
        <Fragment key={i}>
          <dt className="max-w-32 font-medium text-foreground">{t}</dt>
          <dd>{d}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

export function Explain({ title = 'What these mean', children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cn('group', className)}>
      <summary className="inline-flex list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-3.5" />
        {title}
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
      </summary>
      <HelpBody className="mt-1.5">{children}</HelpBody>
    </details>
  )
}

// One line of crew Markdown: `code` and **bold**, nothing else (queue, defect and journal text).
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') && p.length > 2 ? (
          <code key={i} className="rounded bg-muted px-1 py-px font-mono text-[0.9em]">{p.slice(1, -1)}</code>
        ) : p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
        ) : (
          p
        ),
      )}
    </>
  )
}
