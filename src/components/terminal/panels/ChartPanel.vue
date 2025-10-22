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
import { useTerminalStore } from '@/stores/terminal'
import { useDeviceStore } from '@/stores/devices'

const terminalStore = useTerminalStore()
const deviceStore = useDeviceStore()

const { selectedDeviceId } = storeToRefs(terminalStore)

const devicePoints = computed(
  () =>
    deviceStore.tePoints.map((price, idx) => ({
      idx,
      price,
    })) as Array<{ idx: number; price: number; ts?: number }>,
)

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

const displayLastPrice = computed(() => {
  const data = chartSeriesData.value
  if (!data.length) return null
  return data[data.length - 1]?.value ?? null
})
const containerEl = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Area'> | null = null
let resizeObserver: ResizeObserver | null = null

function resizeChart() {
  if (!chart || !containerEl.value) return
  const { clientWidth: width, clientHeight: height } = containerEl.value
  if (width === 0 || height === 0) return
  chart.applyOptions({ width, height })
  // Keep timescale fitted after a structural resize
  try {
    chart.timeScale().fitContent()
  } catch {
    /* noop */
  }
}

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
    // Width/height will be set explicitly via resizeChart
    width: containerEl.value.clientWidth,
    height: containerEl.value.clientHeight,
  })
  series = chart.addSeries(AreaSeries, {
    lineColor: '#2f81f7',
    topColor: 'rgba(47,129,247,0.25)',
    bottomColor: 'rgba(47,129,247,0.03)',
    lineWidth: 2,
    pointMarkersVisible: false,
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

  // Observe container resize
  resizeObserver = new ResizeObserver(() => resizeChart())
  resizeObserver.observe(containerEl.value)
  window.addEventListener('resize', resizeChart)
  // Initial explicit resize
  resizeChart()
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
  () => selectedDeviceId.value,
  () => {
    if (!series) return
    series.setData([])
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  resizeObserver?.disconnect()
  chart?.remove()
})
</script>

<template>
  <section class="relative flex flex-col min-h-0 w-full h-full">
    <header class="ml-2 text-sm font-medium flex items-center h-8 border-b border-gray-600/60">
      Chart
      <span class="ml-2 text-(--accent-color)">
        {{ displayLastPrice !== null ? displayLastPrice.toFixed(2) : '—' }}
      </span>
    </header>
    <div ref="containerEl" class="flex w-full h-full" />
  </section>
</template>
