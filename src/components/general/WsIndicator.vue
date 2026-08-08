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
    <span class="ws-indicator-divider muted">|</span>
    <span class="ws-indicator-auth muted">auth</span>
    <status-indicator
      :title="authTitle"
      :status="authStatus"
      :animated="authStatus === 'neutral'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGatewayStore } from '@/stores/gateway'

import StatusIndicator from './StatusIndicator.vue'

const ws = useGatewayStore()

const statusMap: Record<string, string> = {
  connecting: 'info',
  authenticating: 'info',
  reconnecting: 'warning',
  ready: 'success',
  error: 'error',
  idle: 'warning',
}

const authStatus = computed(() => {
  if (ws.status === 'ready') return 'success'
  if (ws.status === 'error') return 'error'
  return 'neutral'
})

const authTitle = computed(() => {
  if (ws.status === 'ready') return 'Auth: OK'
  if (ws.status === 'error') return ws.lastError ? `Auth: ${ws.lastError}` : 'Auth: Failed'
  return 'Auth: Pending'
})
</script>

<style scoped>
.ws-indicator-divider {
  margin: 0 2px;
}

.ws-indicator-auth {
  font-size: 11px;
}
</style>
