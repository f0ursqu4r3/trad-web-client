<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useWsStore } from '@/stores/ws'
import StickyScroller from '@/components/general/StickyScroller.vue'

const ws = useWsStore()
const { inboundDebugEnabled } = storeToRefs(ws)
const debugEnabled = computed(() => inboundDebugEnabled.value)
const snapshot = ref<InboundMessage[]>([])
const lastClearedAt = ref<number | null>(null)
const maxRows = 500
const refreshMs = 250
let refreshTimer: number | null = null

function refreshSnapshot() {
  if (!debugEnabled.value) {
    snapshot.value = []
    return
  }
  const filtered = ws.inbound.filter((m) => m.kind !== 'Pong') as InboundMessage[]
  snapshot.value = filtered.slice(-maxRows)
}

onMounted(() => {
  refreshSnapshot()
  refreshTimer = window.setInterval(refreshSnapshot, refreshMs)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
const messages = computed<InboundMessage[]>(() => {
  const threshold = lastClearedAt.value
  if (threshold === null) {
    return snapshot.value
  }

  return snapshot.value.filter((message) => {
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

defineExpose({
  totalCount: computed(() => ws.inbound.length),
  messageCount: computed(() => messages.value.length),
  clearMessages,
})
</script>

<template>
  <div class="font-mono flex flex-col h-full overflow-hidden">
    <div
      v-if="!debugEnabled"
      class="p-2 text-xs text-(--color-text-dim) border-b border-gray-600/30"
    >
      Inbound debug disabled. Enable it from the Messages panel toggle.
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

<style scoped></style>
