// With two or more open task sets (each led from its own checkout), the tabs about one set show
// the one picked here. `viewOf` gives the page's state as if that set were the only one: its
// tasks, timing, handoff, lead and agents.

import type { State } from '@/lib/types'
import { LEAD_STATE } from '@/lib/lead'
import { cn } from '@/lib/utils'

export function viewOf(state: State, slug: string | null): State {
  if (state.open.length < 2) return state
  const cur = state.open.find((o) => o.slug === slug) ?? state.open.find((o) => o.slug === state.current?.slug) ?? state.open[0]
  const lead = state.roster.leads.find((l) => l.session === cur.lead) ?? null
  return {
    ...state,
    current: cur,
    lead: lead?.state ?? { state: 'closed', since: null, sinceEpoch: null },
    handoff: cur.handoff ?? lead?.handoff ?? null,
    roster: { ...state.roster, lead },
    // Its lead's agents; without a lead (or a session on record), the set's.
    agents: state.agents.filter((a) => (lead && a.session ? a.session === lead.session : a.set == null || a.set === cur.slug)),
  }
}

export function SetSwitcher({ state, slug, pick }: { state: State; slug: string | null; pick: (slug: string) => void }) {
  if (state.open.length < 2) return null
  const sel = viewOf(state, slug).current?.slug
  return (
    <div role="tablist" aria-label="Task set" className="mb-3 flex gap-1 rounded-xl border bg-muted/40 p-1">
      {state.open.map((o) => {
        const l = state.roster.leads.find((x) => x.session === o.lead)
        const st = l ? LEAD_STATE[l.state.state] : null
        const active = o.slug === sel
        return (
          <button
            key={o.slug}
            role="tab"
            aria-selected={active}
            onClick={() => pick(o.slug)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12.5px] transition-colors sm:max-w-80 sm:flex-none',
              active ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
            )}
          >
            <span className={cn('size-2 shrink-0 rounded-full', st ? st.dot : 'bg-muted-foreground/30', st?.pulse && 'crew-pulse')} />
            <span className="min-w-0 truncate">{o.title}</span>
            <span className="tabular shrink-0 text-[11px] text-muted-foreground">{o.accepted}/{o.total}</span>
          </button>
        )
      })}
    </div>
  )
}
