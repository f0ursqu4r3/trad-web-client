<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
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

const { priceSeries, lastPrice } = storeToRefs(useTerminalStore())
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

function toTs(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp
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
  const initial: AreaData[] = priceSeries.value.map((p) => ({ time: toTs(p.time), value: p.value }))
  if (initial.length && series) {
    series.setData(initial)
    chart.timeScale().fitContent()
  }

  // Observe container resize
  resizeObserver = new ResizeObserver(() => resizeChart())
  resizeObserver.observe(containerEl.value)
  window.addEventListener('resize', resizeChart)
  // Initial explicit resize
  resizeChart()
})

// Watch only the length so pushes trigger updates (array ref itself isn't replaced)
watch(
  () => priceSeries.value.length,
  (len, prev) => {
    if (!series || len === 0 || len === prev) return
    const last = priceSeries.value[len - 1]
    series.update({ time: toTs(last.time), value: last.value })
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  resizeObserver?.disconnect()
  chart?.remove()
})
</script>

<template>
  <section class="chart-panel">
    <header class="panel-header">
      Chart <span class="last">{{ lastPrice.toFixed(2) }}</span>
    </header>
    <div ref="containerEl" class="chart-container" />
  </section>
</template>

<style scoped>
.chart-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Allow panel to expand within parent flex layout */
  flex: 1 1 auto;
  min-height: 0; /* prevents flex overflow clipping in some browsers */

  height: 100%;
  width: 100%;
}
.chart-container {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
}
.panel-header .last {
  margin-left: 8px;
  color: var(--accent-color);
}
</style>
