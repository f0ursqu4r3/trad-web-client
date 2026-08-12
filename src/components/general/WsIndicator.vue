<template>
  <div class="flex items-center space-x-1">
    <span class="ws-indicator-status muted">[{{ gateway.status }}]</span>
    <span v-if="gateway.latencyMs != null" class="size-xs muted">
      ({{ gateway.latencyMs.toFixed(0) }}ms)
    </span>
    <status-indicator
      :title="
        `Gateway status: ${gateway.status}` +
        (gateway.latencyMs != null ? ` (lat ${gateway.latencyMs.toFixed(0)}ms)` : '')
      "
      :status="statusMap[gateway.status]"
      :animated="gateway.status !== 'ready'"
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

const gateway = useGatewayStore()

const statusMap: Record<string, string> = {
  connecting: 'info',
  ready: 'success',
  error: 'error',
  idle: 'neutral',
  authenticating: 'info',
  reconnecting: 'warning',
  disconnected: 'warning',
}

const authStatus = computed(() => {
  if (gateway.status === 'ready') return 'success'
  if (gateway.status === 'error') return 'error'
  return 'neutral'
})

const authTitle = computed(() => {
  if (gateway.status === 'ready') return 'Auth: OK'
  if (gateway.status === 'error') {
    return gateway.lastError ? `Auth: ${gateway.lastError}` : 'Auth: Failed'
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
