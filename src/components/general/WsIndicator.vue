<template>
  <div class="ws-health" :aria-label="statusTitle" :title="statusTitle">
    <span class="ws-health-label">{{ statusLabel }}</span>
    <status-indicator
      :title="statusTitle"
      :status="statusMap[gateway.status]"
      :animated="gateway.status !== 'ready'"
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

const statusLabel = computed(() => {
  if (gateway.status === 'ready') {
    return gateway.latencyMs === null ? '— ms' : `${gateway.latencyMs.toFixed(0)} ms`
  }
  return gateway.status === 'error' ? 'connection error' : gateway.status
})

const statusTitle = computed(() => {
  const latency = gateway.latencyMs === null ? '' : `, ${gateway.latencyMs.toFixed(0)} ms latency`
  const detail = gateway.lastError ? `: ${gateway.lastError}` : ''
  return `Trad connection ${gateway.status}${latency}${detail}`
})
</script>

<style scoped>
.ws-health {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.ws-health-label {
  color: var(--fg-muted);
  font-size: 11px;
  white-space: nowrap;
}
</style>
