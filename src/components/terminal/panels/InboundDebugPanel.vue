<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWsStore } from '@/stores/ws'
import StickyScroller from '@/components/general/StickyScroller.vue'

const ws = useWsStore()
const lastClearedAt = ref<number | null>(null)
const rawMessages = computed<InboundMessage[]>(
  () => ws.inbound.filter((m) => m.kind !== 'Pong').slice(-10000) as InboundMessage[],
)
const messages = computed<InboundMessage[]>(() => {
  const threshold = lastClearedAt.value
  if (threshold === null) {
    return rawMessages.value
  }

  return rawMessages.value.filter((message) => {
    const messageMs = timestampToMs(message.ts)
    if (messageMs === null) {
      return true
    }

    return messageMs > threshold
  })
})

const expandedMessages = ref<Record<string, boolean>>({})

interface InboundMessage {
  kind: string
  payload: unknown
  ts: number | string
  [key: string]: unknown
}

function messageKey(message: InboundMessage): string {
  return `${message.ts}-${message.kind}`
}

function timestampToMs(ts: InboundMessage['ts']): number | null {
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return ts
  }

  const parsed = new Date(ts).valueOf()
  return Number.isFinite(parsed) ? parsed : null
}

function isExpanded(key: string): boolean {
  return expandedMessages.value[key] === true
}

function toggleExpanded(key: string): void {
  expandedMessages.value = {
    ...expandedMessages.value,
    [key]: !expandedMessages.value[key],
  }
}

function clearMessages(): void {
  expandedMessages.value = {}
  lastClearedAt.value = Date.now()
}

watch(messages, (newMessages) => {
  const allowedKeys = new Set(newMessages.map((message) => messageKey(message)))
  const nextState: Record<string, boolean> = {}

  for (const [key, value] of Object.entries(expandedMessages.value)) {
    if (allowedKeys.has(key)) {
      nextState[key] = value
    }
  }

  expandedMessages.value = nextState
})

function formatPayload(p: unknown): string {
  try {
    return JSON.stringify(p, null, 2)
  } catch {
    return String(p)
  }
}
</script>

<template>
  <div class="font-mono flex flex-col h-full overflow-hidden">
    <div class="inbound-header">
      <div class="inbound-header-left">
        <span class="inbound-title">Inbound Messages</span>
        <span class="inbound-total">Total: {{ ws.inbound.length }}</span>
      </div>
      <button
        type="button"
        class="btn btn-ghost-neutral btn-xs dim"
        :disabled="messages.length === 0"
        @click="clearMessages"
      >
        Clear
      </button>
    </div>

    <StickyScroller
      class="overflow-y-auto flex-1"
      :trigger="messages.length"
      :smooth="true"
      :showButton="true"
    >
      <div
        v-for="m in messages"
        :key="messageKey(m)"
        class="flex flex-col gap-0.5 p-2 border-b border-gray-600/30 odd:bg-gray-800/30"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-primary font-normal text-xs">{{ m.kind }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn icon-btn btn-ghost-neutral btn-sm dim"
              :aria-expanded="isExpanded(messageKey(m))"
              @click="toggleExpanded(messageKey(m))"
            >
              {{ new Date(m.ts).toLocaleTimeString() }}
              <span aria-hidden="true">
                {{ isExpanded(messageKey(m)) ? '▾' : '▸' }}
              </span>
            </button>
          </div>
        </div>
        <div v-if="isExpanded(messageKey(m))" class="m-0 whitespace-pre-wrap break-words text-xs">
          {{ formatPayload(m.payload) }}
        </div>
      </div>

      <div v-if="messages.length === 0" class="opacity-60 italic p-2 text-xs">No messages yet.</div>
    </StickyScroller>
  </div>
</template>

<style scoped>
.inbound-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0.35rem 0.6rem;
  background: var(--panel-header-bg);
  border-bottom: 1px solid var(--panel-border-inner);
}

.inbound-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inbound-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
}

.inbound-total {
  font-size: 11px;
  color: var(--color-text-dim);
}
</style>
