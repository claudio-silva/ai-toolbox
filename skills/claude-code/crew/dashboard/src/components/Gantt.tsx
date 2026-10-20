// The set's agent runs as a Gantt chart (ECharts custom series): one row per task, plus a
// set-level row for agents not tied to a task; bars coloured by phase, the computer's sleep as
// grey bands across all rows, a "now" line while the set is open. Ctrl + wheel or pinch to zoom, drag to pan.

import { useMemo } from 'react'
import * as echarts from 'echarts/core'
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from 'echarts'
import type { Phase, Task, Timing } from '@/lib/types'
import { EChart, cssColor, type EOption } from './EChart'
import { hm, span } from '@/lib/format'

export const PHASE_VAR: Record<Phase, string> = {
  build: '--ph-build', review: '--ph-review', rework: '--ph-rework', other: '--ph-other',
}
export const PHASE_LABEL: Record<Phase, string> = { build: 'build', review: 'review', rework: 'rework', other: 'set level' }

const ROW = 30

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export function Gantt({ timing, tasks, dark, now }: { timing: Timing; tasks: Task[]; dark: boolean; now: number }) {
  const option = useMemo<EOption>(() => {
    const titles = new Map(tasks.map((t) => [t.id, t.title]))
    const order = tasks.map((t) => t.id).filter((id) => timing.runs.some((r) => r.task === id))
    const hasSet = timing.runs.some((r) => !r.task)
    const rows = [...order, ...(hasSet ? ['Set'] : [])]
    const rowOf = new Map(rows.map((r, i) => [r, i]))
    const colors = Object.fromEntries(Object.entries(PHASE_VAR).map(([k, v]) => [k, cssColor(v)])) as Record<Phase, string>
    const muted = cssColor('--muted-foreground')
    const border = cssColor('--border')
    const fg = cssColor('--foreground')
    const card = cssColor('--popover')
    const sleep = cssColor('--sleep')
    const nowColor = cssColor('--now')
    const end = timing.done ? timing.end : Math.max(timing.end, Math.floor(now / 1000))
    const runs = timing.runs.map((r, i) => ({
      value: [r.start * 1000, (r.open ? Math.max(r.end, Math.floor(now / 1000)) : r.end) * 1000, rowOf.get(r.task ?? 'Set') ?? 0, i],
    }))

    const renderRun = (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
      const r = timing.runs[api.value(3) as number]
      const a = api.coord([api.value(0), api.value(2)])
      const b = api.coord([api.value(1), api.value(2)])
      const h = (api.size?.([0, 1]) as number[])[1] * 0.58
      const cs = params.coordSys as unknown as { x: number; y: number; width: number; height: number }
      const shape = echarts.graphic.clipRectByRect({ x: a[0], y: a[1] - h / 2, width: Math.max(3, b[0] - a[0]), height: h }, cs)
      if (!shape) return null
      const c = colors[r.phase]
      return {
        type: 'rect',
        shape: { ...shape, r: 4 },
        style: r.open
          ? { fill: c, opacity: 0.55, stroke: c, lineWidth: 1.5, lineDash: [4, 3] }
          : { fill: c, opacity: r.status === 'CHANGES' ? 0.95 : 0.9, stroke: r.status === 'CHANGES' ? cssColor('--st-rework') : undefined, lineWidth: r.status === 'CHANGES' ? 1.5 : 0 },
        emphasis: { style: { opacity: 1, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.2)' } },
      }
    }
    const renderSleep = (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
      const a = api.coord([api.value(0), 0])
      const b = api.coord([api.value(1), 0])
      const cs = params.coordSys as unknown as { x: number; y: number; width: number; height: number }
      const shape = echarts.graphic.clipRectByRect({ x: a[0], y: cs.y, width: Math.max(1, b[0] - a[0]), height: cs.height }, cs)
      return shape ? { type: 'rect', shape, style: { fill: sleep }, silent: false } : null
    }

    return {
      animation: false,
      textStyle: { fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' },
      grid: { left: 46, right: 14, top: 10, bottom: 52 },
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: card,
        borderColor: border,
        textStyle: { color: fg, fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:300px;white-space:normal;',
        formatter: (p: { seriesId?: string; value: number[] }) => {
          if (p.seriesId === 'sleep') {
            const s = timing.sleeps[p.value[2]]
            return `<b>Computer asleep</b><br/>${hm(s.from)}–${hm(s.to)} · ${span(s.secs)}`
          }
          const r = timing.runs[p.value[3]]
          const who = r.name ? `${esc(r.name)} <span style="opacity:.6">(${esc(r.type)})</span>` : esc(r.type)
          const task = r.task ? `<b>${esc(r.task)}</b> ${esc(titles.get(r.task) ?? '')}` : '<b>Set level</b>'
          const status = r.open ? 'running' : r.status || 'finished'
          return [
            task,
            `<div style="margin-top:4px">${who}${r.model ? ` · ${esc(r.model)}` : ''}${r.effort ? ` · ${esc(r.effort)}` : ''}</div>`,
            `<div style="opacity:.75">${PHASE_LABEL[r.phase]}${r.kind === 'resume' ? ' (resumed)' : ''} · ${esc(status)}</div>`,
            `<div style="opacity:.75">${hm(r.start)}–${r.open ? 'now' : hm(r.end)} · ${span(r.active)} at work${r.slept ? ` · slept ${span(r.slept)}` : ''}</div>`,
            r.description ? `<div style="opacity:.6;margin-top:3px">${esc(r.description)}</div>` : '',
          ].join('')
        },
      },
      xAxis: {
        type: 'time',
        min: timing.t0 * 1000,
        max: end * 1000,
        axisLine: { lineStyle: { color: border } },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: border, type: 'dashed' } },
        axisLabel: { color: muted, fontSize: 10.5, hideOverlap: true, formatter: { day: '{MMM} {d}', hour: '{HH}:{mm}', minute: '{HH}:{mm}' } },
      },
      yAxis: {
        type: 'category',
        data: rows,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: border } },
        axisLabel: { color: fg, fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
        {
          type: 'slider', xAxisIndex: 0, filterMode: 'weakFilter', height: 16, bottom: 8, borderColor: border,
          fillerColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', handleSize: 14, showDetail: false,
          backgroundColor: 'transparent', dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
          selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
          moveHandleSize: 0, textStyle: { color: muted },
        },
      ],
      series: [
        {
          id: 'sleep',
          type: 'custom',
          renderItem: renderSleep,
          encode: { x: [0, 1] },
          data: timing.sleeps.map((s, i) => [s.from * 1000, s.to * 1000, i]),
          z: 1,
        },
        {
          id: 'runs',
          type: 'custom',
          renderItem: renderRun,
          encode: { x: [0, 1], y: 2 },
          data: runs,
          z: 2,
          markLine: timing.done ? undefined : {
            silent: true,
            symbol: 'none',
            label: { show: true, formatter: 'now', color: nowColor, fontSize: 10, position: 'insideEndTop' },
            lineStyle: { color: nowColor, type: 'dashed', width: 1.5 },
            data: [{ xAxis: Math.floor(now / 1000) * 1000 }],
          },
        },
      ],
    } as EOption
  }, [timing, tasks, dark, now])

  const rows = new Set(timing.runs.map((r) => r.task ?? 'Set')).size
  return <EChart option={option} height={rows * ROW + 64} notMerge={false} />
}
