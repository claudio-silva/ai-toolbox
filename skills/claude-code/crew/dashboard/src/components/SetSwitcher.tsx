// With two or more open task sets (each led from its own checkout), the header's switcher picks
// the one every tab shows (lib/sets.ts viewOf). Each set: a dot for its lead's state, its title,
// and its accepted tasks.

import type { State } from '@/lib/types'
import { LEAD_STATE } from '@/lib/lead'
import { viewOf } from '@/lib/sets'
import { cn } from '@/lib/utils'

export function SetSwitcher({ state, slug, pick }: { state: State; slug: string | null; pick: (slug: string) => void }) {
  if (state.open.length < 2) return null
  const sel = viewOf(state, slug).current?.slug
  return (
    <div role="radiogroup" aria-label="Task set shown" className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
      {state.open.map((o) => {
        const l = state.roster.leads.find((x) => x.session === o.lead)
        const st = l ? LEAD_STATE[l.state.state] : null
        const active = o.slug === sel
        return (
          <button
            key={o.slug}
            role="radio"
            aria-checked={active}
            onClick={() => pick(o.slug)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1 text-left text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-80 sm:flex-none',
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
