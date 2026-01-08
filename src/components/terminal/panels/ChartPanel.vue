<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
} from 'lightweight-charts'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import {
  createDraggablePriceLinesPlugin,
  type DraggablePriceLineDefinition,
  type DraggablePriceLineDragEvent,
  type DraggablePriceLinesPluginApi,
} from '@/lib/chart/draggablePriceLines'
import { TrailingEntryLifecycle } from '@/lib/ws/protocol'

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
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

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

const draggableLines = computed<DraggablePriceLineDefinition[]>(() => {
  const te = teDevice.value
  if (!te) return []
  const theme = getChartTheme()
  return [
    {
      id: 'activation_price',
      options: {
        price: te.activation_price,
        color: theme.activationPrice,
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Activation Price',
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
        title: 'Stop Loss',
      },
      draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
    },
  ]
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

function syncChartSize() {
  if (!chart || !containerEl.value) return
  const { clientWidth, clientHeight } = containerEl.value
  if (!clientWidth || !clientHeight) return
  chart.resize(clientWidth, clientHeight)
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

  // Watch for theme changes (data-theme attribute on html element)
  themeObserver = new MutationObserver(() => {
    applyChartTheme()
    // Update draggable lines with new theme colors
    if (draggableLinesPlugin && teDevice.value) {
      const theme = getChartTheme()
      const te = teDevice.value
      draggableLinesPlugin.setLines([
        {
          id: 'activation_price',
          options: {
            price: te.activation_price,
            color: theme.activationPrice,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Activation Price',
          },
          draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
        },
        {
          id: 'stop_loss',
          options: {
            price: te.stop_loss,
            color: theme.stopLoss,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Stop Loss',
          },
          draggable: teDeviceLifecycle.value === TrailingEntryLifecycle.Running,
        },
      ])
    }
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
  if (initial.length && series) {
    series.setData(initial)
    try {
      chart.timeScale().fitContent()
    } catch {
      /* noop */
    }
  }
})

watch(
  chartSeriesData,
  (data) => {
    if (!series) return
    if (!data.length) {
      series.setData([])
      return
    }
    series.setData(data)
    try {
      chart?.timeScale().fitContent()
    } catch {
      /* noop */
    }
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

watch(selectedDeviceId, () => {
  if (!series) return
  const initial = chartSeriesData.value
  if (initial.length && series) {
    series.setData(initial)
    try {
      chart?.timeScale().fitContent()
    } catch {
      /* noop */
    }
  }
})

onBeforeUnmount(() => {
  if (!series) return
  const initial = chartSeriesData.value
  if (initial.length && series) {
    series.setData(initial)
    try {
      chart?.timeScale().fitContent()
    } catch {
      /* noop */
    }
  }
  resizeObserver?.disconnect()
  resizeObserver = null
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
  draggableLinesPlugin?.destroy()
  draggableLinesPlugin = null
  chart?.remove()
  chart = null
  series = null
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
    <div ref="containerEl" class="w-full h-full" />
  </section>
</template>
