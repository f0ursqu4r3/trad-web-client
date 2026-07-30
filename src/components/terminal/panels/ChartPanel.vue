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
  type Time,
  type SeriesMarker,
  type LineData,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
} from 'lightweight-charts'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import { useUiStore } from '@/stores/ui'
import { useWsStore } from '@/stores/ws'
import {
  createDraggablePriceLinesPlugin,
  type DraggablePriceLineDefinition,
  type DraggablePriceLineDragEvent,
  type DraggablePriceLinesPluginApi,
} from '@/lib/chart/draggablePriceLines'
import { TrailingEntryLifecycle, TrailingEntryPhase, PositionSide } from '@/lib/ws/protocol'
import { recordPerfDuration, getPerfThreshold } from '@/lib/perfLog'
import { formatNumberShort, formatUsdShort } from '@/lib/numberFormat'

const store = useDeviceStore()
const uiStore = useUiStore()
const wsStore = useWsStore()

const { selectedDeviceId, teDevice } = storeToRefs(store)
const PRICE_AXIS_WHEEL_ZOOM_FACTOR = 1.12
const OFF_SCALE_FOCUS_PADDING_RATIO = 0.05

type OffScaleIndicator = {
  id: string
  edge: 'upper' | 'lower'
  price: number
  label: string
  color: string
}

type PriceRange = {
  from: number
  to: number
}

type PriceScaleMargins = {
  top: number
  bottom: number
}

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
let activationMarkersPlugin: ISeriesMarkersPluginApi<Time> | null = null
let statusMarkersPlugin: ISeriesMarkersPluginApi<Time> | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
const themeVersion = ref(0)
const offScaleIndicators = ref<OffScaleIndicator[]>([])
const rightPriceAxisWidth = ref(0)
let offScaleFrame: number | null = null
let offScaleDeferredFrame: number | null = null

const upperOffScaleIndicators = computed(() =>
  offScaleIndicators.value
    .filter((indicator) => indicator.edge === 'upper')
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)),
)

const lowerOffScaleIndicators = computed(() =>
  offScaleIndicators.value
    .filter((indicator) => indicator.edge === 'lower')
    .sort((a, b) => b.price - a.price || a.id.localeCompare(b.id)),
)

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

function applyChartLocalization() {
  if (!chart) return
  chart.applyOptions({
    localization: {
      priceFormatter: (price: number) =>
        formatNumberShort(price, { minDecimals: 2, maxDecimals: 6 }),
    },
  })
}

const devicePoints = computed(() => {
  if (!teDevice.value) return []
  teDevice.value.points_version
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
    te.position_side === PositionSide.Long ? jumpPrice - te.stop_loss : te.stop_loss - jumpPrice
  if (denom > 0) {
    const size = te.risk_amount / denom
    const notional = size * jumpPrice
    label = `${label} • Est ${formatUsdShort(notional)}`
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
      draggable:
        teDeviceLifecycle.value === TrailingEntryLifecycle.Running &&
        te.phase === TrailingEntryPhase.Initial,
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
  if (te.take_profit != null) {
    lines.push({
      id: 'take_profit',
      options: {
        price: te.take_profit,
        color: theme.jump,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'TP',
      },
      draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
    })
  }

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
        draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
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
  if (
    te.completed &&
    te.succeeded &&
    te.end_trigger_index !== null &&
    te.end_trigger_index >= baseIndex
  ) {
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
  scheduleOffScaleIndicatorUpdate()
}

function scheduleOffScaleIndicatorUpdate() {
  if (offScaleFrame !== null) return
  offScaleFrame = window.requestAnimationFrame(() => {
    offScaleFrame = null
    updateOffScaleIndicators()
  })
}

function scheduleOffScaleIndicatorUpdateAfterLayout() {
  if (offScaleDeferredFrame !== null) return
  offScaleDeferredFrame = window.requestAnimationFrame(() => {
    offScaleDeferredFrame = window.requestAnimationFrame(() => {
      offScaleDeferredFrame = null
      scheduleOffScaleIndicatorUpdate()
    })
  })
}

function updateOffScaleIndicators() {
  if (!series || !containerEl.value) {
    offScaleIndicators.value = []
    return
  }
  const height = containerEl.value.clientHeight
  if (height <= 0) return
  rightPriceAxisWidth.value = chart?.priceScale('right').width() ?? 0

  offScaleIndicators.value = draggableLines.value.flatMap((line) => {
    const coordinate = series?.priceToCoordinate(line.options.price)
    let edge: 'upper' | 'lower' | null = null
    if (coordinate != null && Number.isFinite(coordinate)) {
      if (coordinate < 0) {
        edge = 'upper'
      } else if (coordinate > height) {
        edge = 'lower'
      }
    }
    if (!edge) return []
    return [
      {
        id: line.id,
        edge,
        price: line.options.price,
        label: `${line.options.title || line.id} ${formatNumberShort(line.options.price, {
          minDecimals: 2,
          maxDecimals: 6,
        })}`,
        color: line.options.color ?? 'var(--color-text)',
      },
    ]
  })
}

function renderedPriceRange(
  internalRange: PriceRange,
  margins: PriceScaleMargins,
): PriceRange | null {
  const usableRatio = 1 - margins.top - margins.bottom
  if (usableRatio <= 0) return null
  const renderedSpan = (internalRange.to - internalRange.from) / usableRatio
  return {
    from: internalRange.from - margins.bottom * renderedSpan,
    to: internalRange.to + margins.top * renderedSpan,
  }
}

function internalPriceRange(
  renderedRange: PriceRange,
  margins: PriceScaleMargins,
): PriceRange {
  const renderedSpan = renderedRange.to - renderedRange.from
  return {
    from: renderedRange.from + margins.bottom * renderedSpan,
    to: renderedRange.to - margins.top * renderedSpan,
  }
}

function focusOffScaleIndicator(indicator: OffScaleIndicator) {
  if (!series) return
  const priceScale = series.priceScale()
  const currentRange = priceScale.getVisibleRange() ?? fallbackVisiblePriceRange()
  if (!currentRange || currentRange.to <= currentRange.from) return

  const margins = priceScale.options().scaleMargins
  const currentRenderedRange = renderedPriceRange(currentRange, margins)
  if (!currentRenderedRange) return

  const paddingScale = OFF_SCALE_FOCUS_PADDING_RATIO / (1 - OFF_SCALE_FOCUS_PADDING_RATIO)
  const nextRenderedRange =
    indicator.edge === 'upper'
      ? {
          from: currentRenderedRange.from,
          to:
            indicator.price +
            (indicator.price - currentRenderedRange.from) * paddingScale,
        }
      : {
          from:
            indicator.price -
            (currentRenderedRange.to - indicator.price) * paddingScale,
          to: currentRenderedRange.to,
        }
  const nextRange = internalPriceRange(nextRenderedRange, margins)

  priceScale.setAutoScale(false)
  priceScale.setVisibleRange(nextRange)
  scheduleOffScaleIndicatorUpdateAfterLayout()
}

function getChartDebugState() {
  const height = containerEl.value?.clientHeight ?? 0
  return {
    height,
    lineCoordinates: Object.fromEntries(
      draggableLines.value.map((line) => [
        line.id,
        series?.priceToCoordinate(line.options.price) ?? null,
      ]),
    ),
  }
}

defineExpose({ getChartDebugState })

function isRightPriceAxisPointer(event: MouseEvent): boolean {
  if (!chart || !containerEl.value) return false
  const rightAxisWidth = chart.priceScale('right').width()
  if (rightAxisWidth <= 0) return false
  const rect = containerEl.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  return x >= rect.width - rightAxisWidth && x <= rect.width && y >= 0 && y <= rect.height
}

function fallbackVisiblePriceRange(): { from: number; to: number } | null {
  const values = chartSeriesData.value
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value))
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, Math.abs(max) * 0.001, 1)
  return {
    from: min - span * 0.2,
    to: max + span * 0.2,
  }
}

function handlePriceAxisWheel(event: WheelEvent) {
  if (!series || !containerEl.value || !isRightPriceAxisPointer(event)) return
  if (event.deltaY === 0) return

  const priceScale = series.priceScale()
  const currentRange = priceScale.getVisibleRange() ?? fallbackVisiblePriceRange()
  if (!currentRange || currentRange.to <= currentRange.from) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const rect = containerEl.value.getBoundingClientRect()
  const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
  const coordinatePrice = series.coordinateToPrice(y)
  const anchor =
    typeof coordinatePrice === 'number' && Number.isFinite(coordinatePrice)
      ? coordinatePrice
      : (currentRange.from + currentRange.to) / 2
  const factor = event.deltaY > 0 ? PRICE_AXIS_WHEEL_ZOOM_FACTOR : 1 / PRICE_AXIS_WHEEL_ZOOM_FACTOR
  const nextRange = {
    from: anchor - (anchor - currentRange.from) * factor,
    to: anchor + (currentRange.to - anchor) * factor,
  }

  const minSpan = Math.max(Math.abs(anchor) * 1e-8, 1e-8)
  if (!Number.isFinite(nextRange.from) || !Number.isFinite(nextRange.to)) return
  if (nextRange.to - nextRange.from < minSpan) return

  priceScale.setAutoScale(false)
  priceScale.setVisibleRange(nextRange)
  scheduleOffScaleIndicatorUpdateAfterLayout()
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
  scheduleOffScaleIndicatorUpdateAfterLayout()
}

function handleChartPointerMove(event: PointerEvent) {
  if (event.buttons !== 0) scheduleOffScaleIndicatorUpdateAfterLayout()
}

function handleChartDoubleClick(event: MouseEvent) {
  if (series && isRightPriceAxisPointer(event)) {
    series.priceScale().setAutoScale(true)
  }
  scheduleOffScaleIndicatorUpdateAfterLayout()
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
    const markers: SeriesMarker<Time>[] = activation
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
    statusMarkerSeries.setData(
      status ? ([{ time: status.time, value: status.value }] as LineData[]) : [],
    )
  }
  if (statusMarkersPlugin) {
    const markers: SeriesMarker<Time>[] = status
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
    localization: {
      priceFormatter: (price: number) =>
        formatNumberShort(price, { minDecimals: 2, maxDecimals: 6 }),
    },
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

  resizeObserver = new ResizeObserver(() => syncChartSize())
  resizeObserver.observe(containerEl.value)
  containerEl.value.addEventListener('wheel', handlePriceAxisWheel, {
    passive: false,
    capture: true,
  })
  containerEl.value.addEventListener('pointermove', handleChartPointerMove)
  containerEl.value.addEventListener('dblclick', handleChartDoubleClick)
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
        emitPriceLineEvent('price-line-drag', event)
      },
      onDragEnd: (event) => {
        submitTrackedLineUpdate(event)
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
    scheduleOffScaleIndicatorUpdateAfterLayout()
  },
  { deep: true },
)

watch(
  () => uiStore.numberDisplayMode,
  () => {
    applyChartLocalization()
    if (draggableLinesPlugin && teDevice.value) {
      draggableLinesPlugin.setLines(draggableLines.value)
    }
  },
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
  containerEl.value?.removeEventListener('wheel', handlePriceAxisWheel, { capture: true })
  containerEl.value?.removeEventListener('pointermove', handleChartPointerMove)
  containerEl.value?.removeEventListener('dblclick', handleChartDoubleClick)
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
  if (offScaleFrame !== null) {
    window.cancelAnimationFrame(offScaleFrame)
    offScaleFrame = null
  }
  if (offScaleDeferredFrame !== null) {
    window.cancelAnimationFrame(offScaleDeferredFrame)
    offScaleDeferredFrame = null
  }
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

function submitTrackedLineUpdate(event: DraggablePriceLineDragEvent) {
  const te = teDevice.value
  const deviceId = selectedDeviceId.value
  if (!te || !deviceId || !isTrackedLine(event.id)) return

  const data = {
    device_id: deviceId,
    expected_revision: te.state_revision,
    expected_phase: te.phase,
    expected_lifecycle: te.lifecycle,
  }
  if (event.id === 'activation_price') {
    wsStore.sendUserCommand({
      kind: 'AmendTrailingEntry',
      data: { ...data, activation_price: event.price },
    })
  } else if (event.id === 'stop_loss') {
    wsStore.sendUserCommand({
      kind: 'AmendTrailingEntry',
      data: { ...data, stop_loss: event.price },
    })
  } else if (event.id === 'take_profit') {
    wsStore.sendUserCommand({
      kind: 'AmendTrailingEntry',
      data: { ...data, take_profit: event.price },
    })
  } else if (event.id === 'jump_trigger' && te.peak > 0) {
    const jump =
      te.position_side === PositionSide.Long
        ? ((event.price / te.peak - 1) * 100)
        : ((1 - event.price / te.peak) * 100)
    wsStore.sendUserCommand({
      kind: 'AmendTrailingEntry',
      data: { ...data, jump_frac_threshold: Math.max(jump, 0.000001) },
    })
  }

  const submittedRevision = te.state_revision
  window.setTimeout(() => {
    if (teDevice.value?.state_revision === submittedRevision) {
      draggableLinesPlugin?.setLines(draggableLines.value)
      scheduleOffScaleIndicatorUpdateAfterLayout()
    }
  }, 10_000)
}

function isTrackedLine(
  id: string,
): id is 'activation_price' | 'stop_loss' | 'take_profit' | 'jump_trigger' {
  return (
    id === 'activation_price' ||
    id === 'stop_loss' ||
    id === 'take_profit' ||
    id === 'jump_trigger'
  )
}
</script>

<template>
  <section data-testid="te-chart" class="relative flex flex-col min-h-0 w-full h-full">
    <div
      v-if="chartTitle"
      class="absolute left-3 top-2 z-10 max-w-[45%] truncate pr-2 text-[10px] font-mono text-[var(--color-text-dim)]"
    >
      {{ chartTitle }}
    </div>
    <div ref="containerEl" class="w-full h-full" />
    <div
      v-if="upperOffScaleIndicators.length"
      data-testid="offscale-upper-tabs"
      class="offscale-rail offscale-rail--upper"
      :style="{ right: `${rightPriceAxisWidth + 4}px` }"
      aria-label="Levels above the visible price range"
    >
      <button
        v-for="indicator in upperOffScaleIndicators"
        :key="indicator.id"
        type="button"
        class="offscale-tab offscale-tab--upper"
        :style="{ color: indicator.color, borderColor: indicator.color }"
        :title="`Show ${indicator.label}`"
        :aria-label="`Show ${indicator.label}`"
        @click.stop="focusOffScaleIndicator(indicator)"
      >
        ↑ {{ indicator.label }}
      </button>
    </div>
    <div
      v-if="lowerOffScaleIndicators.length"
      data-testid="offscale-lower-tabs"
      class="offscale-rail offscale-rail--lower"
      :style="{ right: `${rightPriceAxisWidth + 4}px` }"
      aria-label="Levels below the visible price range"
    >
      <button
        v-for="indicator in lowerOffScaleIndicators"
        :key="indicator.id"
        type="button"
        class="offscale-tab offscale-tab--lower"
        :style="{ color: indicator.color, borderColor: indicator.color }"
        :title="`Show ${indicator.label}`"
        :aria-label="`Show ${indicator.label}`"
        @click.stop="focusOffScaleIndicator(indicator)"
      >
        ↓ {{ indicator.label }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.offscale-rail {
  pointer-events: none;
  position: absolute;
  z-index: 20;
  display: flex;
  column-gap: 2px;
  overflow: hidden;
}

.offscale-rail--upper {
  left: 45%;
  top: 0;
  align-content: flex-start;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.offscale-rail--lower {
  left: 4px;
  bottom: 0;
  align-content: flex-end;
  justify-content: center;
  flex-wrap: wrap-reverse;
}

.offscale-tab {
  pointer-events: auto;
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  border: 1px solid;
  background: var(--color-bg);
  padding: 2px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgb(0 0 0 / 35%);
  cursor: pointer;
}

.offscale-tab:hover,
.offscale-tab:focus-visible {
  background: var(--color-bg-alt);
  outline: 1px solid currentColor;
  outline-offset: -2px;
}

.offscale-tab--upper {
  border-top: 0;
}

.offscale-tab--lower {
  border-bottom: 0;
}
</style>
