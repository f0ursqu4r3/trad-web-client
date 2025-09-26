<template>
  <div class="panel-card p-2">
    <div class="panel-header-row">
      <div class="inline-flex items-center gap-2">
        <span class="badge">Other</span>
        <span class="mono text-[11px]">{{ command.name }}</span>
        <span class="mono dim text-[10px]">#{{ shortId }}</span>
      </div>
      <span class="pill-info">{{ command.status }}</span>
    </div>
    <div class="mt-2 text-[12px] whitespace-pre-wrap break-words">{{ command.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CommandHistoryItem } from '@/lib/ws/protocol'

const props = defineProps<{ command: CommandHistoryItem }>()
const shortId = computed(() => props.command.command_id.slice(0, 8))
</script>

<style scoped></style>
