import { useMemo } from 'react'
import { Bot, Crown, Shrink } from 'lucide-react'
import type { Compaction, State } from '@/lib/types'
import { kTokens, modelShort, span, usd, when } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, Empty, Explain, HelpHead, Mono, Panel, Stat, Terms } from '@/components/bits'
import { EChart, cssColor, type EOption } from '@/components/EChart'

function Chart({ rows, today, dark }: { rows: Compaction[]; today: string; dark: boolean }) {
  const option = useMemo<EOption>(() => {
    const muted = cssColor('--muted-foreground')
    const border = cssColor('--border')
    const lead = cssColor('--primary')
    const sub = cssColor('--ph-review')
    const after = cssColor('--foreground', 0.4)
    const card = cssColor('--popover')
    const fg = cssColor('--foreground')
    const labels = rows.map((r) => when(r.epoch, today))
    return {
      animationDuration: 300,
      grid: { left: 44, right: 12, top: 14, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: card,
        borderColor: border,
        textStyle: { color: fg, fontSize: 12 },
        formatter: (ps: { dataIndex: number }[]) => {
          const r = rows[ps[0].dataIndex]
          return `<b>${r.label}</b><br/>${when(r.epoch, today)} · ${kTokens(r.pre)} → ${kTokens(r.post)} tokens<br/>${r.trigger || ''}${r.durationMs ? ` · took ${span(r.durationMs / 1000)}` : ''}`
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: border } },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: border, type: 'dashed' } },
        axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => kTokens(v) },
      },
      series: [
        {
          name: 'before',
          type: 'bar',
          barGap: '-100%',
          barMaxWidth: 26,
          data: rows.map((r) => ({ value: r.pre, itemStyle: { color: r.kind === 'lead' ? lead : sub, borderRadius: [4, 4, 0, 0] } })),
        },
        {
          name: 'after',
          type: 'bar',
          barMaxWidth: 26,
          data: rows.map((r) => ({ value: r.post, itemStyle: { color: after, borderRadius: [4, 4, 0, 0] } })),
        },
      ],
    }
    // dark: colours are read from the theme, so re-read them when it flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today, dark])
  return <EChart option={option} height={190} notMerge />
}

function Row({ r, today, max }: { r: Compaction; today: string; max: number }) {
  const Icon = r.kind === 'lead' ? Crown : Bot
  const drop = r.pre > 0 ? Math.round(((r.pre - r.post) * 100) / r.pre) : 0
  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('grid size-6 shrink-0 place-items-center rounded-md', r.kind === 'lead' ? 'bg-primary/12 text-primary' : 'bg-ph-review/15 text-ph-review')}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.label}</span>
        <span className="tabular shrink-0 text-[11.5px] text-muted-foreground">{when(r.epoch, today)}</span>
      </div>
      <div className="flex items-center gap-2 pl-8">
        <span className="tabular text-[12.5px]">{kTokens(r.pre)} <span className="text-muted-foreground">→</span> {kTokens(r.post)}</span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/35" style={{ width: `${Math.min(100, (r.pre * 100) / max)}%` }} />
          <span className={cn('absolute inset-y-0 left-0 rounded-full', r.kind === 'lead' ? 'bg-primary' : 'bg-ph-review')} style={{ width: `${Math.min(100, (r.post * 100) / max)}%` }} />
        </span>
        <span className="tabular text-[11px] text-muted-foreground">−{drop}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-8 text-[11px] text-muted-foreground">
        {r.model && <Chip className="py-0 text-[10.5px]">{modelShort(r.model)}{r.effort ? ` · ${r.effort}` : ''}</Chip>}
        {r.trigger && <Chip className="py-0 text-[10.5px]">{r.trigger}</Chip>}
        {r.durationMs > 0 && <Chip className="py-0 text-[10.5px]">took {span(r.durationMs / 1000)}</Chip>}
        <Chip className="py-0 text-[10.5px]">{r.turns} turn{r.turns === 1 ? '' : 's'} since{r.open ? ' (counting)' : ''}</Chip>
        <span className="ml-auto tabular">
          overhead {usd(r.cost)} · saved {usd(r.saved)} ·{' '}
          <span className={cn('font-medium', r.net != null && (r.net >= 0 ? 'text-st-accepted' : 'text-st-rework'))}>net {usd(r.net)}</span>
        </span>
      </div>
    </li>
  )
}

export function Compactions({ state, dark }: { state: State; dark: boolean }) {
  const c = state.compactions
  if (!c || c.rows.length === 0) {
    return (
      <Empty icon={Shrink} title="No compactions yet">
        When the lead's or an agent's context fills up, Claude Code compacts it. Each one is logged here with its size, cost and the savings that follow.
      </Empty>
    )
  }
  const s = c.summary
  const byTime = [...c.rows].sort((a, b) => a.epoch - b.epoch)
  const rows = byTime.slice(-40)
  const recent = [...byTime].reverse()
  const max = Math.max(1, ...c.rows.map((r) => r.pre))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat icon={Crown} label="Lead" value={s.lead.count} sub={s.lead.count ? `at ~${kTokens(s.lead.avgPre)}${s.lead.interval ? ` · every ~${span(s.lead.interval)}` : ''}` : 'none'} />
          <Stat icon={Bot} label="Agents" value={s.sub.count} sub={s.sub.count ? `at ~${kTokens(s.sub.avgPre)}${s.sub.afterStart ? ` · ~${span(s.sub.afterStart)} in` : ''}` : 'none'} />
          <Stat label="Overhead" value={usd(s.overhead)} sub="summarising" />
          <Stat label="Net" value={usd(s.net)} sub={s.saved != null ? `saved ${usd(s.saved)} so far` : 'savings unknown'} tone={s.net == null ? undefined : s.net >= 0 ? 'good' : 'bad'} />
        </div>
        <Explain>
          <p>
            When the lead's or an agent's context fills up, Claude Code compacts it: it summarises the conversation so far and carries on from the
            summary. A compaction costs one summarising request, and every later request in that session is cheaper because it carries less.
          </p>
          <Terms
            items={[
              ['Lead, Agents', 'How many compactions, the average context size when they happened, and how often (the lead) or how far into a run (agents).'],
              ['Overhead', 'What the summarising requests cost.'],
              ['Saved', 'What the requests after each compaction would have paid to carry the context it dropped. It grows while the session goes on.'],
              ['Net', 'Saved minus overhead: green once compacting has paid for itself.'],
              ['auto, manual', 'What triggered it: the context filled up, or /compact.'],
              ['turns since', 'Requests made after it; "counting" while that session goes on.'],
            ]}
          />
          <p>
            Estimates at Anthropic list prices, with a warm cache. Not measured: files re-read after a compaction, and detail the summary lost.
          </p>
          <HelpHead>Tuning</HelpHead>
          <p>
            Change when compaction happens with <Mono>/autocompact &lt;size&gt;</Mono>, <Mono>modelSettings</Mono>, or{' '}
            <Mono>autoCompactWindow</Mono> in an agent definition (see <Mono>.crew/README.md</Mono>).
          </p>
        </Explain>
      </div>

      <Panel
        title="Context before and after"
        icon={Shrink}
        bodyClassName="px-2 pb-3"
        action={
          <span className="flex gap-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />lead</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-ph-review" />agent</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-foreground/40" />after</span>
          </span>
        }
      >
        <Chart rows={rows} today={state.today} dark={dark} />
        {c.rows.length > rows.length && <p className="px-2 text-[11px] text-muted-foreground">The last {rows.length} of {c.rows.length}.</p>}
      </Panel>

      <Panel title="Each compaction" icon={Shrink} bodyClassName="px-4 pb-2">
        <ul className="divide-y divide-border/60">{recent.map((r) => <Row key={`${r.epoch}-${r.id}`} r={r} today={state.today} max={max} />)}</ul>
      </Panel>

    </div>
  )
}
