<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'

import {
  createDraggablePriceLinesPlugin,
  type DraggablePriceLineDefinition,
  type DraggablePriceLinesPluginApi,
} from '@/lib/chart/draggablePriceLines'
import {
  sampleAtTrailingEntryPoint,
  trailingEntryChartLines,
  type TrailingEntryChartLine,
  type TrailingEntryLineId,
} from '@/lib/chart/trailingEntryChart'
import type { TrailingEntryProjection } from '@/lib/gateway'
import { formatNumberShort } from '@/lib/numberFormat'
import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'

const props = defineProps<{
  accountId: string
  trailingEntry: TrailingEntryProjection
}>()
const emit = defineEmits<{
  (event: 'edit-line', line: TrailingEntryLineId, price: number): void
}>()

const gateway = useGatewayStore()
const markets = useMarketStore()
const container = ref<HTMLDivElement | null>(null)
const offScale = ref<OffScaleIndicator[]>([])
const rightAxisWidth = ref(0)

let chart: IChartApi | null = null
let series: ISeriesApi<'Line'> | null = null
let markers: ISeriesMarkersPluginApi<Time> | null = null
let linesPlugin: DraggablePriceLinesPluginApi | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let offScaleFrame: number | null = null

const PRICE_AXIS_WHEEL_FACTOR = 1.12
const OFF_SCALE_PADDING = 0.05

interface OffScaleIndicator {
  id: TrailingEntryLineId
  edge: 'upper' | 'lower'
  price: number
  label: string
  color: string
}

interface PriceRange {
  from: number
  to: number
}

const symbol = computed(() => props.trailingEntry.plan.symbol)
const stream = computed(() => markets.stream(props.accountId, symbol.value))
const samples = computed(() => stream.value?.samples ?? [])
const latestSample = computed(() => samples.value[samples.value.length - 1] ?? null)
const chartModel = computed<{ lines: TrailingEntryChartLine[]; error: string | null }>(() => {
  try {
    return { lines: trailingEntryChartLines(props.trailingEntry), error: null }
  } catch (error) {
    return { lines: [], error: error instanceof Error ? error.message : String(error) }
  }
})
const chartLines = computed(() => chartModel.value.lines)
const chartError = computed(() => chartModel.value.error)
const seriesData = computed<LineData[]>(() =>
  samples.value.flatMap((sample) => {
    const value = Number(sample.price)
    if (!Number.isFinite(value) || value <= 0) return []
    return [{ time: sample.sequence as UTCTimestamp, value }]
  }),
)
const upperIndicators = computed(() =>
  offScale.value
    .filter((indicator) => indicator.edge === 'upper')
    .sort((left, right) => left.price - right.price || left.id.localeCompare(right.id)),
)
const lowerIndicators = computed(() =>
  offScale.value
    .filter((indicator) => indicator.edge === 'lower')
    .sort((left, right) => right.price - left.price || left.id.localeCompare(right.id)),
)
const streamSummary = computed(() => {
  const current = stream.value
  if (current === null) return 'Waiting for market subscription'
  if (current.status === 'subscribing') return 'Loading recent node history'
  if (current.status === 'error') return current.error ?? 'Market stream unavailable'
  if (current.samples.length === 0) return 'Live stream ready; waiting for trades'
  return `Recent node history · ${current.samples.length} trades`
})
const latestPrice = computed(() => {
  const value = latestSample.value === null ? null : Number(latestSample.value.price)
  return value !== null && Number.isFinite(value)
    ? formatNumberShort(value, { minDecimals: 2, maxDecimals: 8 })
    : '-'
})
const chartTitle = computed(() => {
  const side =
    props.trailingEntry.plan.position_side === 'long'
      ? 'Long'
      : props.trailingEntry.plan.position_side === 'short'
        ? 'Short'
        : props.trailingEntry.plan.position_side
  return `Graph of TE: ${side} ${symbol.value} - ${props.trailingEntry.trailing_entry_id}`
})

const lineDefinitions = computed<DraggablePriceLineDefinition[]>(() => {
  return buildLineDefinitions(chartLines.value)
})

function buildLineDefinitions(lines: TrailingEntryChartLine[]): DraggablePriceLineDefinition[] {
  const colors = chartColors()
  return lines.map((line) => ({
    id: line.id,
    draggable: line.editable,
    options: {
      price: line.price,
      color: colors[line.tone],
      lineWidth: 1,
      lineStyle: line.tone === 'peak' ? 1 : 2,
      axisLabelVisible: true,
      title: line.label,
    },
  }))
}

watch(
  () => [props.accountId, symbol.value] as const,
  ([accountId, nextSymbol], previous) => {
    if (previous !== undefined) gateway.unsubscribeMarket(previous[0], previous[1])
    if (accountId !== '' && nextSymbol !== '') gateway.subscribeMarket(accountId, nextSymbol)
  },
  { immediate: true },
)

watch(
  seriesData,
  (data) => {
    series?.setData(data)
    syncMarkers()
    if (data.length > 0 && stream.value?.status === 'ready') {
      chart?.timeScale().fitContent()
    }
    scheduleOffScaleUpdate()
  },
  { deep: true },
)

watch(
  lineDefinitions,
  (definitions) => {
    linesPlugin?.setLines(definitions)
    scheduleOffScaleUpdate()
  },
  { deep: true },
)

watch(
  () => [props.trailingEntry.activation_point_index, props.trailingEntry.trigger] as const,
  () => syncMarkers(),
  { deep: true },
)

onMounted(() => {
  if (container.value === null) return
  const colors = chartColors()
  chart = createChart(container.value, {
    layout: {
      background: { color: colors.background },
      textColor: colors.text,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    localization: {
      priceFormatter: (price: number) =>
        formatNumberShort(price, { minDecimals: 2, maxDecimals: 8 }),
    },
    rightPriceScale: {
      borderColor: colors.border,
      scaleMargins: { top: 0.1, bottom: 0.15 },
    },
    timeScale: { visible: false, borderColor: colors.border },
  })
  series = chart.addSeries(LineSeries, {
    color: colors.price,
    lineWidth: 2,
    pointMarkersVisible: false,
    priceLineVisible: true,
  })
  markers = createSeriesMarkers(series, [])
  linesPlugin = createDraggablePriceLinesPlugin(series, {
    lines: lineDefinitions.value,
    onDragEnd: (event) => {
      if (!editableLine(event.id)) return
      emit('edit-line', event.id, event.price)
      window.requestAnimationFrame(() => linesPlugin?.setLines(lineDefinitions.value))
    },
  })

  resizeObserver = new ResizeObserver(syncSize)
  resizeObserver.observe(container.value)
  themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  container.value.addEventListener('wheel', handlePriceAxisWheel, {
    passive: false,
    capture: true,
  })
  container.value.addEventListener('dblclick', handleDoubleClick)
  container.value.addEventListener('pointermove', handlePointerMove)
  chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOffScaleUpdate)
  syncSize()
  series.setData(seriesData.value)
  syncMarkers()
  chart.timeScale().fitContent()
  scheduleOffScaleUpdate()
})

onBeforeUnmount(() => {
  if (props.accountId !== '' && symbol.value !== '') {
    gateway.unsubscribeMarket(props.accountId, symbol.value)
  }
  if (container.value !== null) {
    container.value.removeEventListener('wheel', handlePriceAxisWheel, { capture: true })
    container.value.removeEventListener('dblclick', handleDoubleClick)
    container.value.removeEventListener('pointermove', handlePointerMove)
  }
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  linesPlugin?.destroy()
  markers?.detach()
  chart?.remove()
  if (offScaleFrame !== null) window.cancelAnimationFrame(offScaleFrame)
  chart = null
  series = null
  markers = null
  linesPlugin = null
})

function syncSize(): void {
  if (chart === null || container.value === null) return
  if (container.value.clientWidth <= 0 || container.value.clientHeight <= 0) return
  chart.resize(container.value.clientWidth, container.value.clientHeight)
  scheduleOffScaleUpdate()
}

function applyTheme(): void {
  const colors = chartColors()
  chart?.applyOptions({
    layout: { background: { color: colors.background }, textColor: colors.text },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.border },
  })
  series?.applyOptions({ color: colors.price })
  linesPlugin?.setLines(buildLineDefinitions(chartLines.value))
  syncMarkers()
}

function syncMarkers(): void {
  if (markers === null) return
  const next: SeriesMarker<Time>[] = []
  const activation = sampleAtTrailingEntryPoint(
    samples.value,
    props.trailingEntry,
    props.trailingEntry.activation_point_index,
  )
  if (activation !== null) {
    next.push({
      time: activation.sequence as UTCTimestamp,
      position: 'inBar',
      color: chartColors().activation,
      shape: 'square',
      size: 0.7,
      text: 'Activation',
    })
  }
  const triggered =
    props.trailingEntry.trigger === null
      ? null
      : samples.value.find(
          (sample) =>
            sample.generation === props.trailingEntry.trigger?.decision_trade.generation &&
            sample.trade_id === props.trailingEntry.trigger?.decision_trade.trade_id,
        )
  if (triggered !== null && triggered !== undefined) {
    next.push({
      time: triggered.sequence as UTCTimestamp,
      position: 'inBar',
      color: chartColors().jump,
      shape: 'square',
      size: 0.7,
      text: props.trailingEntry.plan.position_side === 'long' ? 'Bought' : 'Sold',
    })
  }
  markers.setMarkers(next.sort((left, right) => Number(left.time) - Number(right.time)))
}

function scheduleOffScaleUpdate(): void {
  if (offScaleFrame !== null) return
  offScaleFrame = window.requestAnimationFrame(() => {
    offScaleFrame = null
    updateOffScale()
  })
}

function updateOffScale(): void {
  if (series === null || chart === null || container.value === null) {
    offScale.value = []
    return
  }
  const height = container.value.clientHeight
  rightAxisWidth.value = chart.priceScale('right').width()
  offScale.value = lineDefinitions.value.flatMap((definition) => {
    const coordinate = series?.priceToCoordinate(definition.options.price)
    if (coordinate == null || !Number.isFinite(coordinate)) return []
    const edge = coordinate < 0 ? 'upper' : coordinate > height ? 'lower' : null
    if (edge === null) return []
    return [
      {
        id: definition.id as TrailingEntryLineId,
        edge,
        price: definition.options.price,
        label: `${definition.options.title ?? definition.id} ${formatNumberShort(
          definition.options.price,
          { minDecimals: 2, maxDecimals: 8 },
        )}`,
        color: definition.options.color ?? chartColors().text,
      },
    ]
  })
}

function focusIndicator(indicator: OffScaleIndicator): void {
  if (series === null) return
  const scale = series.priceScale()
  const current = scale.getVisibleRange() ?? fallbackRange()
  if (current === null || current.to <= current.from) return
  const margins = scale.options().scaleMargins
  const usable = 1 - margins.top - margins.bottom
  if (usable <= 0) return
  const renderedSpan = (current.to - current.from) / usable
  const rendered = {
    from: current.from - margins.bottom * renderedSpan,
    to: current.to + margins.top * renderedSpan,
  }
  const padding = OFF_SCALE_PADDING / (1 - OFF_SCALE_PADDING)
  const expanded =
    indicator.edge === 'upper'
      ? {
          from: rendered.from,
          to: indicator.price + (indicator.price - rendered.from) * padding,
        }
      : {
          from: indicator.price - (rendered.to - indicator.price) * padding,
          to: rendered.to,
        }
  const span = expanded.to - expanded.from
  scale.setAutoScale(false)
  scale.setVisibleRange({
    from: expanded.from + margins.bottom * span,
    to: expanded.to - margins.top * span,
  })
  scheduleOffScaleUpdate()
}

function fallbackRange(): PriceRange | null {
  const values = seriesData.value.map((point) => point.value).filter(Number.isFinite)
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, Math.abs(max) * 0.001, 1)
  return { from: min - span * 0.2, to: max + span * 0.2 }
}

function handlePriceAxisWheel(event: WheelEvent): void {
  if (series === null || container.value === null || !isPriceAxisPointer(event)) return
  const current = series.priceScale().getVisibleRange() ?? fallbackRange()
  if (current === null || current.to <= current.from || event.deltaY === 0) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const rect = container.value.getBoundingClientRect()
  const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
  const coordinate = series.coordinateToPrice(y)
  const anchor =
    coordinate !== null && Number.isFinite(coordinate)
      ? coordinate
      : (current.from + current.to) / 2
  const factor = event.deltaY > 0 ? PRICE_AXIS_WHEEL_FACTOR : 1 / PRICE_AXIS_WHEEL_FACTOR
  const next = {
    from: anchor - (anchor - current.from) * factor,
    to: anchor + (current.to - anchor) * factor,
  }
  if (!Number.isFinite(next.from) || !Number.isFinite(next.to) || next.to <= next.from) return
  series.priceScale().setAutoScale(false)
  series.priceScale().setVisibleRange(next)
  scheduleOffScaleUpdate()
}

function handleDoubleClick(event: MouseEvent): void {
  if (series !== null && isPriceAxisPointer(event)) series.priceScale().setAutoScale(true)
  scheduleOffScaleUpdate()
}

function handlePointerMove(event: PointerEvent): void {
  if (event.buttons !== 0) scheduleOffScaleUpdate()
}

function isPriceAxisPointer(event: MouseEvent): boolean {
  if (chart === null || container.value === null) return false
  const width = chart.priceScale('right').width()
  const bounds = container.value.getBoundingClientRect()
  return event.clientX - bounds.left >= bounds.width - width
}

function chartColors() {
  const css = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  return {
    background: css('--chart-bg', '#11161c'),
    text: css('--chart-text', '#8b949e'),
    grid: css('--chart-grid', '#1f2429'),
    border: css('--chart-border', '#2a3139'),
    price: css('--chart-line', '#d0d7de'),
    activation: css('--chart-price-line-activation', '#f7a529'),
    stop: css('--chart-price-line-stop', '#f87171'),
    take_profit: css('--chart-price-line-jump', '#22c55e'),
    peak: css('--chart-price-line-peak', '#f59e0b'),
    jump: css('--chart-price-line-jump', '#22c55e'),
  }
}

function editableLine(value: string): value is TrailingEntryLineId {
  return ['activation_price', 'stop_loss', 'take_profit', 'jump_trigger'].includes(value)
}
</script>

<template>
  <section class="te-chart" data-testid="engine-te-chart">
    <header class="chart-header">
      <span class="chart-title" :title="chartTitle">{{ chartTitle }}</span>
      <span class="history-status" :class="{ stale: trailingEntry.market_stale }">
        {{ streamSummary }}
      </span>
      <span class="current-price">{{ latestPrice }}</span>
    </header>
    <div ref="container" class="chart-canvas" />
    <div
      v-if="upperIndicators.length"
      class="offscale-rail offscale-upper"
      :style="{ right: `${rightAxisWidth + 4}px` }"
      data-testid="engine-offscale-upper"
    >
      <button
        v-for="indicator in upperIndicators"
        :key="indicator.id"
        class="offscale-tab"
        type="button"
        :style="{ color: indicator.color, borderColor: indicator.color }"
        :title="`Show ${indicator.label}`"
        @click.stop="focusIndicator(indicator)"
      >
        ↑ {{ indicator.label }}
      </button>
    </div>
    <div
      v-if="lowerIndicators.length"
      class="offscale-rail offscale-lower"
      :style="{ right: `${rightAxisWidth + 4}px` }"
      data-testid="engine-offscale-lower"
    >
      <button
        v-for="indicator in lowerIndicators"
        :key="indicator.id"
        class="offscale-tab"
        type="button"
        :style="{ color: indicator.color, borderColor: indicator.color }"
        :title="`Show ${indicator.label}`"
        @click.stop="focusIndicator(indicator)"
      >
        ↓ {{ indicator.label }}
      </button>
    </div>
    <p v-if="chartError" class="chart-error">{{ chartError }}</p>
  </section>
</template>

<style scoped>
.te-chart {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 220px;
  flex-direction: column;
  overflow: hidden;
}

.chart-header {
  display: grid;
  min-height: 31px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  color: var(--color-text-dim);
  border-bottom: 1px solid var(--border-color);
  font-size: 10px;
  text-transform: uppercase;
}

.history-status {
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.history-status.stale,
.chart-error {
  color: var(--color-warning);
}

.current-price {
  color: var(--color-text);
  font-size: 12px;
}

.chart-canvas {
  width: 100%;
  min-height: 0;
  flex: 1;
}

.offscale-rail {
  pointer-events: none;
  position: absolute;
  z-index: 4;
  display: flex;
  left: 42%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px;
  overflow: hidden;
}

.offscale-upper {
  top: 31px;
  align-content: flex-start;
}

.offscale-lower {
  bottom: 0;
  align-content: flex-end;
  flex-wrap: wrap-reverse;
}

.offscale-tab {
  pointer-events: auto;
  max-width: 250px;
  overflow: hidden;
  border: 1px solid;
  background: var(--color-bg);
  padding: 1px 7px;
  font: inherit;
  font-size: 10px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-error {
  position: absolute;
  right: 12px;
  bottom: 8px;
  margin: 0;
  background: var(--color-bg);
  padding: 3px 6px;
}

@media (max-width: 680px) {
  .chart-header {
    grid-template-columns: 1fr auto;
  }

  .history-status {
    display: none;
  }

  .offscale-rail {
    left: 4px;
  }
}
</style>
