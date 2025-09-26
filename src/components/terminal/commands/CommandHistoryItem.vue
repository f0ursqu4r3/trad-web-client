<template>
  <div class="command-history-item">
    <div>{{ command.command_id }}</div>
    <div>{{ command.name }}</div>
    <div>{{ command.status }}</div>
    <div>{{ command.text }}</div>
  </div>
</template>

<script setup lang="ts">
import type { CommandHistoryItem } from '@/lib/ws'

defineProps<{
  command: CommandHistoryItem
}>()
</script>

<style scoped>
.command-history-item {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-bottom: 1px solid #444;
}
</style>
