<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
  type CreatePriceLineOptions,
} from 'lightweight-charts'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'

const store = useDeviceStore()

const { selectedDeviceId, teDevice } = storeToRefs(store)

const containerEl = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Area'> | null = null
// let resizeObserver: ResizeObserver | null = null

const devicePoints = computed(() => {
  if (!teDevice.value) return []
  console.log('teDevice', teDevice.value)
  return (
    (teDevice.value?.points_snapshot.map((price, idx) => ({
      idx,
      price,
    })) as Array<{ idx: number; price: number; ts?: number }>) || []
  )
})

const priceLines = computed<CreatePriceLineOptions[]>(() => {
  const te = teDevice.value
  if (!te) return []
  return [
    {
      price: te.activation_price,
      color: '#f7a529',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'Activation Price',
    },
    {
      price: te.stop_loss,
      color: '#f74e4e',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'Stop Loss',
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

  // Add price lines
  priceLines.value.forEach((line) => {
    series?.createPriceLine(line)
  })

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

watch(priceLines, (lines) => {
  if (!series) return
  series.priceLines().forEach((pl) => {
    series?.removePriceLine(pl)
  })
  lines.forEach((line) => {
    series?.createPriceLine(line)
  })
})

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
  chart?.remove()
})
</script>

<template>
  <section class="relative flex flex-col min-h-0 w-full h-full">
    <div ref="containerEl" class="w-full h-full" />
  </section>
</template>
