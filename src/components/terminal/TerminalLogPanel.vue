<script setup lang="ts">
// Placeholder props & state; will later fetch log lines via store or websocket
import { ref } from 'vue'

const lines = ref<string[]>([
  'MarketOrder d36bf6c-03b8-4309-8947-a77b82dc900a rejected: -2015',
  'MarketOrder 1f27ee1b-304a-43cd-a9ac-07659dc2d3c2 rejected: -2015',
  'Split device 5f4e30a0-6ad4-4d29-bb6c-872e87287ae7 is complete',
])
</script>

<template>
  <section class="panel log-panel">
    <header class="panel-header">Log</header>
    <div class="log-lines">
      <div v-for="(l, i) in lines" :key="i" class="log-line">{{ l }}</div>
    </div>
  </section>
</template>

<style scoped>
.log-panel {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.log-lines {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.2;
  overflow-y: auto;
  white-space: pre-wrap;
  padding: 4px 6px;
}
.log-line {
  color: var(--color-text-dim);
}
</style>
