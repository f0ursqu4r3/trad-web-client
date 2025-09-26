<template>
  <span class="ws-indicator-status muted">[{{ ws.status }}]</span>
  <span v-if="ws.latencyMs != null" class="ws-indicator-lat muted">
    ({{ ws.latencyMs.toFixed(0) }}ms)
  </span>
  <span
    :title="
      `WS Status: ${ws.status}` +
      (ws.latencyMs != null ? ` (lat ${ws.latencyMs.toFixed(0)}ms)` : '')
    "
    class="ws-indicator"
    :data-status="ws.status"
  ></span>
</template>

<script setup lang="ts">
import { useWsStore } from '@/stores/ws'

const ws = useWsStore()
</script>

<style scoped>
.ws-indicator {
  user-select: none;
  width: 0.75em;
  height: 0.75em;
  display: inline-flex;
  border-radius: 50%;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  transition: background-color 0.3s;
  background-color: #9e9e9e; /* Grey */
  border: 1px solid rgba(158, 158, 158, 0.25);
  box-shadow:
    0 0 0 3px rgba(158, 158, 158, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.35);
  font-size: 0.8em;
}

.ws-indicator[data-status='ready'] {
  background-color: #00c853; /* vivid green */
  border: 1px solid rgba(0, 200, 83, 0.2);
  box-shadow:
    0 0 0 3px rgba(0, 200, 83, 0.1),
    0 2px 6px rgba(0, 0, 0, 0.35);
}
.ws-indicator[data-status='connecting'] {
  background-color: #ffb300; /* bold amber */
  border: 1px solid rgba(255, 179, 0, 0.2);
  box-shadow:
    0 0 0 3px rgba(255, 179, 0, 0.1),
    0 2px 6px rgba(0, 0, 0, 0.25);
}
.ws-indicator[data-status='reconnecting'] {
  background-color: #ff6d00; /* strong orange */
  border: 1px solid rgba(255, 109, 0, 0.2);
  box-shadow:
    0 0 0 3px rgba(255, 109, 0, 0.1),
    0 2px 6px rgba(0, 0, 0, 0.28);
}
.ws-indicator[data-status='error'] {
  background-color: #d50000; /* vivid red */
  border: 1px solid rgba(213, 0, 0, 0.25);
  box-shadow:
    0 0 0 3px rgba(213, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.4);
}
.ws-indicator-status,
.ws-indicator-lat {
  font-size: 12px;
}
</style>
