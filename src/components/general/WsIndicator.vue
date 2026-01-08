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
import { useWsStore } from '@/stores/ws'

import StatusIndicator from './StatusIndicator.vue'

const ws = useWsStore()

const statusMap: Record<string, string> = {
  connecting: 'info',
  ready: 'success',
  error: 'error',
  disconnected: 'warning',
}

const authStatus = computed(() => {
  if (ws.authAccepted === true) return 'success'
  if (ws.authAccepted === false) return 'error'
  return 'neutral'
})

const authTitle = computed(() => {
  if (ws.authAccepted === true) return 'Auth: OK'
  if (ws.authAccepted === false) {
    return ws.authError ? `Auth: ${ws.authError}` : 'Auth: Failed'
  }
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
