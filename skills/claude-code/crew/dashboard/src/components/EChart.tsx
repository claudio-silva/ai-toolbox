// ECharts, tree-shaken to what the dashboard uses, behind a React component that keeps one
// chart instance per mount (updates merge into it, so zoom and hover survive live updates).

import { useEffect, useLayoutEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, CustomChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, CustomChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

export type EOption = echarts.EChartsCoreOption

// Theme colours, read from the CSS variables and always returned as rgba(): the variables are
// oklch, which canvas draws but ECharts cannot parse, so its hover colours (derived from the
// fill) came out empty and shapes flickered under the mouse.
let probeCtx: CanvasRenderingContext2D | null = null
export function cssColor(name: string, alpha = 1): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const c = getComputedStyle(probe).color
  probe.remove()
  probeCtx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!probeCtx) return c
  probeCtx.clearRect(0, 0, 1, 1)
  probeCtx.fillStyle = c
  probeCtx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * alpha * 1000) / 1000})`
}

export function EChart({ option, height, className, onReady, notMerge }: {
  option: EOption
  height: number
  className?: string
  onReady?: (c: echarts.ECharts) => void
  notMerge?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useLayoutEffect(() => {
    if (!el.current) return
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' })
    chart.current = c
    onReady?.(c)
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current)
    // ECharts swallows every wheel event over a chart with inside zoom; let plain wheels scroll
    // the page and keep ctrl + wheel (and trackpad pinch, which arrives as one) for the chart.
    const node = el.current
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() }
    node.addEventListener('wheel', onWheel, { capture: true })
    return () => {
      node.removeEventListener('wheel', onWheel, { capture: true })
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
    // One instance per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: Boolean(notMerge), lazyUpdate: true })
  }, [option, notMerge])

  useEffect(() => {
    chart.current?.resize()
  }, [height])

  return <div ref={el} className={className} style={{ height, width: '100%' }} />
}
