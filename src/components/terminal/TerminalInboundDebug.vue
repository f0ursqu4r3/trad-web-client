<script setup lang="ts">
import { computed } from 'vue'
import { useWsStore } from '@/stores/ws'

const ws = useWsStore()
const messages = computed(() => [...ws.inbound].slice(-200).reverse())
</script>

<template>
  <div class="inbound-debug">
    <div class="summary">
      <strong>Inbound Messages</strong>
      <span class="meta">Total: {{ ws.inbound.length }}</span>
      <span class="meta" v-if="ws.authAccepted === true">Auth: ✅</span>
      <span class="meta" v-else-if="ws.authAccepted === false">Auth: ❌</span>
      <span class="meta" v-if="ws.authError">Err: {{ ws.authError }}</span>
    </div>
    <div class="list">
      <div v-for="m in messages" :key="m.ts + '-' + m.kind" class="row">
        <span class="time">{{ new Date(m.ts).toLocaleTimeString() }}</span>
        <span class="kind">{{ m.kind }}</span>
        <pre class="payload">{{ formatPayload(m.payload) }}</pre>
      </div>
      <div v-if="messages.length === 0" class="empty">No messages yet.</div>
    </div>
  </div>
</template>

<script lang="ts">
function formatPayload(p: unknown): string {
  try {
    return JSON.stringify(p, null, 0)
  } catch {
    return String(p)
  }
}
</script>

<style scoped>
.inbound-debug {
  font-family: var(--dv-font-family, ui-monospace, monospace);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 12px;
  border-bottom: 1px solid #4446;
}
.meta {
  opacity: 0.7;
}
.list {
  flex: 1;
  overflow: auto;
  font-size: 11px;
  line-height: 1.2;
  padding: 4px;
}
.row {
  display: grid;
  grid-template-columns: 70px 120px 1fr;
  gap: 4px;
  padding: 2px 0;
  border-bottom: 1px dotted #3334;
}
.row:nth-child(odd) {
  background: #0002;
}
.time {
  opacity: 0.6;
}
.kind {
  font-weight: 600;
  color: #8cf;
}
.payload {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.empty {
  opacity: 0.6;
  font-style: italic;
  padding: 8px;
}
</style>
