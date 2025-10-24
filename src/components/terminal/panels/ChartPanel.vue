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

const devicePoints = computed(() => {
  if (!teDevice.value) return []
  return (
    (teDevice.value?.points_snapshot.map((price, idx) => ({
      idx,
      price,
    })) as Array<{ idx: number; price: number; ts?: number }>) || []
  )
})

const draggableLines = computed<DraggablePriceLineDefinition[]>(() => {
  const te = teDevice.value
  if (!te) return []
  return [
    {
      id: 'activation_price',
      options: {
        price: te.activation_price,
        color: '#f7a529',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Activation Price',
      },
    },
    {
      id: 'stop_loss',
      options: {
        price: te.stop_loss,
        color: '#f74e4e',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Stop Loss',
      },
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

onMounted(() => {
  if (!containerEl.value) return
  chart = createChart(containerEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#b9c2cc', attributionLogo: false },
    grid: { vertLines: { color: '#1f2429' }, horzLines: { color: '#1f2429' } },
    rightPriceScale: {
      borderColor: '#2a3139',
      scaleMargins: {
        top: 0.1,
        bottom: 0.2,
      },
    },
    timeScale: { borderColor: '#2a3139' },
  })

  // Add area series
  series = chart.addSeries(AreaSeries, {
    lineColor: '#2f81f7',
    topColor: 'rgba(47,129,247,0.25)',
    bottomColor: 'rgba(47,129,247,0.03)',
    lineWidth: 2,
    pointMarkersVisible: false,
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
})

onBeforeUnmount(() => {
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
