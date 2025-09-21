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

function toTs(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp
}

onMounted(() => {
  if (!containerEl.value) return
  chart = createChart(containerEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#b9c2cc' },
    grid: { vertLines: { color: '#1f2429' }, horzLines: { color: '#1f2429' } },
    rightPriceScale: { borderColor: '#2a3139' },
    timeScale: { borderColor: '#2a3139' },
  })
  series = chart.addSeries(AreaSeries, {
    lineColor: '#2f81f7',
    topColor: 'rgba(47,129,247,0.25)',
    bottomColor: 'rgba(47,129,247,0.03)',
    lineWidth: 2,
    pointMarkersVisible: false,
  })
  const initial: AreaData[] = priceSeries.value.map((p) => ({ time: toTs(p.time), value: p.value }))
  if (initial.length && series) series.setData(initial)
})

watch(priceSeries, (pts) => {
  if (!series || !pts.length) return
  const last = pts[pts.length - 1]
  series.update({ time: toTs(last.time), value: last.value })
})

onBeforeUnmount(() => {
  chart?.remove()
})
</script>

<template>
  <section class="panel chart-panel">
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
}
.chart-container {
  flex: 1;
  min-height: 100px;
}
.panel-header .last {
  margin-left: 8px;
  color: var(--accent-color);
}
</style>
