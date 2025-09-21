<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTerminalStore } from '@/stores/terminal'

const terminal = useTerminalStore()
const { logs } = storeToRefs(terminal)
</script>

<template>
  <section class="log-panel">
    <div class="log-lines">
      <div v-for="l in logs" :key="l.id" class="log-line">
        {{ new Date(l.ts).toLocaleTimeString() }} - {{ l.text }}
      </div>
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
