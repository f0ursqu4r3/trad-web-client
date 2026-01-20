<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  createChart,
  AreaSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
  type SeriesMarker,
  type LineData,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
} from 'lightweight-charts'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import {
  createDraggablePriceLinesPlugin,
  type DraggablePriceLineDefinition,
  type DraggablePriceLineDragEvent,
  type DraggablePriceLinesPluginApi,
} from '@/lib/chart/draggablePriceLines'
import { TrailingEntryLifecycle, TrailingEntryPhase, PositionSide } from '@/lib/ws/protocol'
import { recordPerfDuration, getPerfThreshold } from '@/lib/perfLog'

const store = useDeviceStore()

const { selectedDeviceId, teDevice } = storeToRefs(store)

const emit = defineEmits<{
  (e: 'price-line-drag-start', payload: DraggablePriceLineDragEvent): void
  (e: 'price-line-drag', payload: DraggablePriceLineDragEvent): void
  (e: 'price-line-drag-end', payload: DraggablePriceLineDragEvent): void
  (e: 'price-line-click', payload: DraggablePriceLineDragEvent): void
  (e: 'price-line-dblclick', payload: DraggablePriceLineDragEvent): void
}>()

const containerEl = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Area'> | null = null
let draggableLinesPlugin: DraggablePriceLinesPluginApi | null = null
let activationMarkerSeries: ISeriesApi<'Line'> | null = null
let statusMarkerSeries: ISeriesApi<'Line'> | null = null
let activationMarkersPlugin: ISeriesMarkersPluginApi<UTCTimestamp> | null = null
let statusMarkersPlugin: ISeriesMarkersPluginApi<UTCTimestamp> | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
const themeVersion = ref(0)

// Get CSS variable value from the document
function getCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// Get current chart theme from CSS variables
function getChartTheme() {
  return {
    bg: getCssVar('--chart-bg', 'transparent'),
    text: getCssVar('--chart-text', '#8b949e'),
    grid: getCssVar('--chart-grid', '#1f2429'),
    border: getCssVar('--chart-border', '#2a3139'),
    line: getCssVar('--chart-line', '#d0d7de'),
    areaTop: getCssVar('--chart-area-top', 'rgba(208, 215, 222, 0)'),
    areaBottom: getCssVar('--chart-area-bottom', 'rgba(208, 215, 222, 0)'),
    activationPrice: getCssVar('--chart-price-line-activation', '#f7a529'),
    stopLoss: getCssVar('--chart-price-line-stop', '#f87171'),
    peak: getCssVar('--chart-price-line-peak', '#f59e0b'),
    jump: getCssVar('--chart-price-line-jump', '#22c55e'),
  }
}

// Apply theme to chart
function applyChartTheme() {
  if (!chart || !series) return
  const theme = getChartTheme()

  chart.applyOptions({
    layout: {
      background: { color: theme.bg },
      textColor: theme.text,
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    },
    rightPriceScale: {
      borderColor: theme.border,
    },
    timeScale: {
      borderColor: theme.border,
    },
  })

  series.applyOptions({
    lineColor: theme.line,
    topColor: theme.areaTop,
    bottomColor: theme.areaBottom,
  })
}

const devicePoints = computed(() => {
  if (!teDevice.value) return []
  return (
    (teDevice.value?.points_snapshot.map((price, idx) => ({
      idx,
      price,
    })) as Array<{ idx: number; price: number; ts?: number }>) || []
  )
})

const teDeviceLifecycle = computed(() => {
  return teDevice.value?.lifecycle || {}
})

const chartTitle = computed(() => {
  const te = teDevice.value
  if (!te || !selectedDeviceId.value) return ''
  const side = te.position_side === PositionSide.Long ? 'Long' : 'Short'
  return `Graph of TE: ${side} ${te.symbol} - ${selectedDeviceId.value}`
})

function getJumpTriggerPrice() {
  const te = teDevice.value
  if (!te || te.peak <= 0) return null
  const jumpFraction = te.jump_frac_threshold / 100
  if (te.position_side === PositionSide.Long) {
    return te.peak * (1 + jumpFraction)
  }
  return te.peak * (1 - jumpFraction)
}

function getJumpLabel(jumpPrice: number) {
  const te = teDevice.value
  if (!te) return null
  const prefix = te.position_side === PositionSide.Long ? '+' : '-'
  const percent = te.jump_frac_threshold.toFixed(2)
  let label = `Jump ${prefix}${percent}%`
  const denom =
    te.position_side === PositionSide.Long
      ? jumpPrice - te.stop_loss
      : te.stop_loss - jumpPrice
  if (denom > 0) {
    const size = te.risk_amount / denom
    const notional = size * jumpPrice
    label = `${label} • Est $${notional.toFixed(2)}`
  }
  return label
}

const draggableLines = computed<DraggablePriceLineDefinition[]>(() => {
  themeVersion.value
  const te = teDevice.value
  if (!te) return []
  const theme = getChartTheme()
  const lines: DraggablePriceLineDefinition[] = [
    {
      id: 'activation_price',
      options: {
        price: te.activation_price,
        color: theme.activationPrice,
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Act',
      },
      draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
    },
    {
      id: 'stop_loss',
      options: {
        price: te.stop_loss,
        color: theme.stopLoss,
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Stop',
      },
      draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
    },
  ]

  if (te.phase === TrailingEntryPhase.Triggered && te.peak > 0) {
    lines.push({
      id: 'peak_price',
      options: {
        price: te.peak,
        color: theme.peak,
        lineWidth: 1,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: 'Peak',
      },
      draggable: false,
    })
    const jumpPrice = getJumpTriggerPrice()
    if (jumpPrice) {
      const jumpLabel = getJumpLabel(jumpPrice)
      lines.push({
        id: 'jump_trigger',
        options: {
          price: jumpPrice,
          color: theme.jump,
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: jumpLabel ?? 'Jump',
        },
        draggable: false,
      })
    }
  }

  return lines
})

const chartSeriesData = computed<AreaData[]>(() => {
  const points = devicePoints.value
  if (!points.length) return []
  let lastTs: number | undefined
  const fallbackBase = Math.floor(Date.now() / 1000) - points.length
  return points.map((point, index) => {
    let ts = point.ts ?? fallbackBase + index
    if (lastTs !== undefined && ts <= lastTs) ts = lastTs + 1
    lastTs = ts
    return {
      time: ts as UTCTimestamp,
      value: point.price,
    }
  })
})

const activationMarker = computed(() => {
  themeVersion.value
  const te = teDevice.value
  const data = chartSeriesData.value
  if (!te || data.length === 0) return null
  const baseIndex = te.base_index ?? 0
  const startIndex = te.start_trigger_index
  if (startIndex === null || startIndex < baseIndex) return null
  const local = startIndex - baseIndex
  const point = data[local]
  if (!point) return null
  return {
    time: point.time,
    value: point.value,
  }
})

const statusMarker = computed(() => {
  themeVersion.value
  const te = teDevice.value
  const data = chartSeriesData.value
  if (!te || data.length === 0) return null
  const baseIndex = te.base_index ?? 0
  if (te.completed && te.succeeded && te.end_trigger_index !== null && te.end_trigger_index >= baseIndex) {
    const local = te.end_trigger_index - baseIndex
    const point = data[local]
    if (!point) return null
    return {
      time: point.time,
      value: point.value,
      label: te.position_side === PositionSide.Long ? 'Bought' : 'Sold',
      color: getChartTheme().jump,
    }
  }
  if (te.completed && te.cancelled) {
    const lastPoint = data[data.length - 1]
    return {
      time: lastPoint.time,
      value: lastPoint.value,
      label: 'Cancelled',
      color: getChartTheme().stopLoss,
    }
  }
  return null
})

function syncChartSize() {
  if (!chart || !containerEl.value) return
  const { clientWidth, clientHeight } = containerEl.value
  if (!clientWidth || !clientHeight) return
  chart.resize(clientWidth, clientHeight)
}

function applySeriesData(data: AreaData[], reason: string) {
  if (!series) return
  if (!data.length) {
    series.setData([])
    return
  }
  const start = performance.now()
  series.setData(data)
  try {
    chart?.timeScale().fitContent()
  } catch {
    /* noop */
  }
  const duration = performance.now() - start
  if (duration >= getPerfThreshold()) {
    recordPerfDuration('ChartPanel:setData', duration, { reason, points: data.length })
  }
}

function syncMarkerSeries() {
  const theme = getChartTheme()
  const te = teDevice.value
  const activation = activationMarker.value
  const status = statusMarker.value

  if (activationMarkerSeries) {
    activationMarkerSeries.setData(activation ? ([activation] as LineData[]) : [])
  }
  if (activationMarkersPlugin) {
    const markers: SeriesMarker<UTCTimestamp>[] = activation
      ? [
          {
            time: activation.time,
            position: 'inBar',
            color: theme.activationPrice,
            shape: 'square',
            size: 0.7,
            text: 'Activation',
          },
        ]
      : []
    activationMarkersPlugin.setMarkers(markers)
  }

  if (statusMarkerSeries) {
    statusMarkerSeries.setData(status ? ([{ time: status.time, value: status.value }] as LineData[]) : [])
  }
  if (statusMarkersPlugin) {
    const markers: SeriesMarker<UTCTimestamp>[] = status
      ? [
          {
            time: status.time,
            position: 'inBar',
            color: status.color,
            shape: 'square',
            size: 0.7,
            text: status.label,
          },
        ]
      : []
    statusMarkersPlugin.setMarkers(markers)
  }
}

onMounted(() => {
  if (!containerEl.value) return
  const theme = getChartTheme()

  chart = createChart(containerEl.value, {
    layout: { background: { color: theme.bg }, textColor: theme.text, attributionLogo: false },
    grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
    rightPriceScale: {
      borderColor: theme.border,
      scaleMargins: {
        top: 0.1,
        bottom: 0.2,
      },
    },
    leftPriceScale: {
      visible: true,
      borderColor: theme.border,
    },
    timeScale: { visible: false, borderColor: theme.border },
  })

  const resizeObserver = new ResizeObserver(() => syncChartSize())
  resizeObserver.observe(containerEl.value)
  syncChartSize()

  // Add area series
  series = chart.addSeries(AreaSeries, {
    lineColor: theme.line,
    topColor: theme.areaTop,
    bottomColor: theme.areaBottom,
    lineWidth: 2,
    pointMarkersVisible: false,
  })
  activationMarkerSeries = chart.addSeries(LineSeries, {
    lineVisible: false,
    pointMarkersVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
    color: theme.activationPrice,
  })
  statusMarkerSeries = chart.addSeries(LineSeries, {
    lineVisible: false,
    pointMarkersVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
    color: theme.jump,
  })
  activationMarkersPlugin = createSeriesMarkers(activationMarkerSeries, [])
  statusMarkersPlugin = createSeriesMarkers(statusMarkerSeries, [])

  // Watch for theme changes (data-theme attribute on html element)
  themeObserver = new MutationObserver(() => {
    themeVersion.value += 1
    applyChartTheme()
    // Update draggable lines with new theme colors
    if (draggableLinesPlugin && teDevice.value) {
      draggableLinesPlugin.setLines(draggableLines.value)
    }
    syncMarkerSeries()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  if (series) {
    draggableLinesPlugin = createDraggablePriceLinesPlugin(series, {
      lines: draggableLines.value,
      onDragStart: (event) => {
        emitPriceLineEvent('price-line-drag-start', event)
      },
      onDrag: (event) => {
        handleTrackedLineUpdate(event)
        emitPriceLineEvent('price-line-drag', event)
      },
      onDragEnd: (event) => {
        handleTrackedLineUpdate(event)
        emitPriceLineEvent('price-line-drag-end', event)
      },
      onClick: (event) => {
        emitPriceLineEvent('price-line-click', event)
      },
      onDblClick: (event) => {
        emitPriceLineEvent('price-line-dblclick', event)
      },
    })
  }

  const initial = chartSeriesData.value
  applySeriesData(initial, 'mount')
  syncMarkerSeries()
})

watch(
  chartSeriesData,
  (data) => {
    applySeriesData(data, 'delta')
  },
  { immediate: true },
)

watch(
  draggableLines,
  (lines) => {
    if (!draggableLinesPlugin) return
    draggableLinesPlugin.setLines(lines)
  },
  { deep: true },
)

watch(
  activationMarker,
  () => {
    syncMarkerSeries()
  },
  { deep: true },
)

watch(
  statusMarker,
  () => {
    syncMarkerSeries()
  },
  { deep: true },
)

watch(selectedDeviceId, () => {
  const initial = chartSeriesData.value
  applySeriesData(initial, 'inspect')
})

onBeforeUnmount(() => {
  const initial = chartSeriesData.value
  applySeriesData(initial, 'unmount')
  resizeObserver?.disconnect()
  resizeObserver = null
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
  draggableLinesPlugin?.destroy()
  draggableLinesPlugin = null
  activationMarkersPlugin?.detach()
  activationMarkersPlugin = null
  statusMarkersPlugin?.detach()
  statusMarkersPlugin = null
  chart?.remove()
  chart = null
  series = null
  activationMarkerSeries = null
  statusMarkerSeries = null
})

type PriceLineEventName =
  | 'price-line-drag-start'
  | 'price-line-drag'
  | 'price-line-drag-end'
  | 'price-line-click'
  | 'price-line-dblclick'

function emitPriceLineEvent(eventName: PriceLineEventName, event: DraggablePriceLineDragEvent) {
  switch (eventName) {
    case 'price-line-drag-start':
      emit('price-line-drag-start', event)
      break
    case 'price-line-drag':
      emit('price-line-drag', event)
      break
    case 'price-line-drag-end':
      emit('price-line-drag-end', event)
      break
    case 'price-line-click':
      emit('price-line-click', event)
      break
    case 'price-line-dblclick':
      emit('price-line-dblclick', event)
      break
  }
}

function handleTrackedLineUpdate(event: DraggablePriceLineDragEvent) {
  if (!isTrackedLine(event.id)) return
  store.setTePriceLine(event.id, event.price)
}

function isTrackedLine(id: string): id is 'activation_price' | 'stop_loss' {
  return id === 'activation_price' || id === 'stop_loss'
}
</script>

<template>
  <section class="relative flex flex-col min-h-0 w-full h-full">
    <div
      v-if="chartTitle"
      class="absolute left-3 top-2 z-10 text-[10px] font-mono text-[var(--color-text-dim)]"
    >
      {{ chartTitle }}
    </div>
    <div ref="containerEl" class="w-full h-full" />
  </section>
</template>
