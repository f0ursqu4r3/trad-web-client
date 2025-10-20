<template>
  <div class="flex items-center space-x-1">
    <span class="ws-indicator-status muted">[{{ ws.status }}]</span>
    <span v-if="ws.latencyMs != null" class="size-xs muted">
      ({{ ws.latencyMs.toFixed(0) }}ms)
    </span>
    <status-indicator
      :title="
        `WS Status: ${ws.status}` +
        (ws.latencyMs != null ? ` (lat ${ws.latencyMs.toFixed(0)}ms)` : '')
      "
      :status="statusMap[ws.status]"
      :animated="ws.status !== 'ready'"
    />
  </div>
</template>

<script setup lang="ts">
import { useWsStore } from '@/stores/ws'

import StatusIndicator from './StatusIndicator.vue'

const ws = useWsStore()

const statusMap: Record<string, string> = {
  connecting: 'info',
  ready: 'success',
  error: 'error',
  disconnected: 'warning',
}
</script>
