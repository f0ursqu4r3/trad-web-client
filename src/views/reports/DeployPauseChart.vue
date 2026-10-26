<script setup lang="ts">
import { deployPauses, instantStartupFrom } from './performance-2026-10'

// Horizontal bars, one per production release, on a linear seconds axis.
const rowHeight = 22
const top = 28
const left = 84
const right = 56
const width = 680
const plotWidth = width - left - right
const axisMax = 480
const height = top + deployPauses.length * rowHeight + 30
const ticks = [0, 60, 120, 180, 240, 300, 360, 420, 480]
const instantIndex = deployPauses.findIndex((entry) => entry.version === instantStartupFrom)

function x(seconds: number): number {
  return left + (plotWidth * seconds) / axisMax
}

function y(index: number): number {
  return top + index * rowHeight
}

function isInstant(index: number): boolean {
  return instantIndex >= 0 && index >= instantIndex
}
</script>

<template>
  <div class="pause-chart-scroll">
    <svg
      class="pause-chart"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      aria-label="Trading pause per production release in seconds, v0.10.10 to v0.10.35.1"
    >
      <g v-for="tick in ticks" :key="tick">
        <line class="grid" :x1="x(tick)" :x2="x(tick)" :y1="top - 6" :y2="height - 26" />
        <text class="tick" :x="x(tick)" :y="top - 12" text-anchor="middle">{{ tick }}</text>
      </g>
      <text class="axis-title" :x="left + plotWidth / 2" :y="height - 8" text-anchor="middle">
        Pause, seconds (services stopped to last account active)
      </text>
      <g v-for="(entry, index) in deployPauses" :key="entry.version">
        <title>v{{ entry.version }}: {{ entry.seconds }} s</title>
        <text class="label" :x="left - 8" :y="y(index) + 15" text-anchor="end">
          v{{ entry.version }}
        </text>
        <rect
          :class="isInstant(index) ? 'bar instant' : 'bar'"
          :x="left"
          :y="y(index) + 5"
          :width="x(entry.seconds) - left"
          :height="rowHeight - 10"
        />
        <text class="value" :x="x(entry.seconds) + 6" :y="y(index) + 15">
          {{ entry.seconds }} s
        </text>
      </g>
    </svg>
    <div class="pause-legend">
      <span><i class="swatch" />before instant startup</span>
      <span><i class="swatch instant" />instant startup, v0.10.35+</span>
    </div>
  </div>
</template>

<style scoped>
.pause-chart-scroll {
  overflow-x: auto;
  padding: 0.75rem 0.75rem 0.6rem;
  border: 1px solid var(--border-subtle);
  background: var(--surface-base);
}
.pause-chart {
  display: block;
  width: 100%;
  min-width: 520px;
  max-width: 820px;
  height: auto;
  font-variant-numeric: tabular-nums;
}
.grid {
  stroke: var(--border-subtle);
  stroke-width: 1;
}
.tick,
.axis-title,
.label,
.value {
  fill: var(--fg-muted);
  font-family: inherit;
  font-size: 11px;
}
.label {
  fill: var(--fg);
}
.value {
  fill: var(--fg-strong);
}
.bar {
  fill: color-mix(in srgb, var(--fg-muted) 55%, var(--surface-base));
}
.bar.instant {
  fill: var(--accent-color);
}
.pause-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.4rem;
  color: var(--fg-muted);
  font-size: 11px;
}
.pause-legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: color-mix(in srgb, var(--fg-muted) 55%, var(--surface-base));
}
.swatch.instant {
  background: var(--accent-color);
}
</style>
