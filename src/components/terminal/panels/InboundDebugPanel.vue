<script setup lang="ts">
import { computed } from 'vue'
import { useWsStore } from '@/stores/ws'
import StickyScroller from '@/components/general/StickyScroller.vue'

const ws = useWsStore()
const messages = computed(() => ws.inbound.filter((m) => m.kind !== 'Pong').slice(-10000))

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
    <div class="flex items-center gap-2 px-1.5 py-1 text-sm border-b border-gray-600/60 w-full">
      <strong class="font-semibold">Inbound Messages</strong>
      <div class="flex gap-2 justify-between opacity-70 text-xs ml-auto">
        <span>Total: {{ ws.inbound.length }}</span>
        <span v-if="ws.authAccepted === true">Auth: ✅</span>
        <span v-else-if="ws.authAccepted === false">Auth: ❌</span>
        <span v-if="ws.authError">Err: {{ ws.authError }}</span>
      </div>
    </div>

    <StickyScroller
      class="overflow-y-auto flex-1"
      :trigger="messages.length"
      :smooth="true"
      :showButton="true"
    >
      <div
        v-for="m in messages"
        :key="m.ts + '-' + m.kind"
        class="flex flex-col gap-0.5 p-2 border-b border-gray-600/30 odd:bg-gray-800/30"
      >
        <div class="flex justify-between items-center gap-2">
          <span class="text-blue-400 font-bold text-xs">{{ m.kind }}</span>
          <span class="opacity-60 text-xs">{{ new Date(m.ts).toLocaleTimeString() }}</span>
        </div>
        <div class="m-0 whitespace-pre-wrap break-words text-xs">
          {{ formatPayload(m.payload) }}
        </div>
      </div>

      <div v-if="messages.length === 0" class="opacity-60 italic p-2 text-xs">No messages yet.</div>
    </StickyScroller>
  </div>
</template>
