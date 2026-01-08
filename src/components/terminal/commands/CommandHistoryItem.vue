<template>
  <div class="panel-card p-2">
    <div class="panel-header-row">
      <div class="inline-flex items-center gap-2">
        <span class="badge">{{ commandKind }}</span>
        <span class="mono dim text-[10px]">#{{ shortId }}</span>
      </div>
      <div class="inline-flex items-center gap-2">
        <span v-if="createdAtLabel" class="mono dim text-[10px]">{{ createdAtLabel }}</span>
        <span class="pill pill-info">{{ command.status }}</span>
      </div>
    </div>
    <div class="mt-2 text-[12px] whitespace-pre-wrap break-words font-mono">
      {{ JSON.stringify(command.command.data, null, 2) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CommandHistoryItem } from '@/lib/ws/protocol'

const props = defineProps<{ command: CommandHistoryItem }>()
const shortId = computed(() => props.command.command_id.slice(0, 8))
const commandKind = computed(() => props.command.command.kind)
const createdAtLabel = computed(() => {
  if (!props.command.created_at) return ''
  try {
    return new Date(props.command.created_at).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
})
</script>

<style scoped></style>
