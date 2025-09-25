<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTerminalStore } from '@/stores/terminal'

const terminal = useTerminalStore()
const { logs } = storeToRefs(terminal)
</script>

<template>
  <section class="log-panel crt-overlay">
    <div class="log-lines mono">
      <div v-for="l in logs" :key="l.id" class="log-line dim">
        {{ new Date(l.ts).toLocaleTimeString() }} - {{ l.text }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.log-panel {
  overflow: auto;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.log-lines {
  font-size: 12px;
  line-height: 1.2;
  overflow-y: auto;
  white-space: pre-wrap;
  padding: 4px 6px;
}
</style>
