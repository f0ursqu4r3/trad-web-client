<script setup lang="ts">
import { computed, type Component, onBeforeUnmount, onMounted } from 'vue'
import { useWsStore } from '@/stores/ws'
import { useCommandStore } from '@/stores/command'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'

import TELongView from '@/components/terminal/views/TELongView.vue'

const ws = useWsStore()
const commandStore = useCommandStore()

const currentComponent = computed<Component | null>(() => {
  if (!commandStore.selectedCommand) return null
  return (
    {
      TrailingEntryOrder: TELongView,
    }[commandStore.selectedCommand?.command.kind] || null
  )
})

onMounted(() => {
  ws.connect()
})

onBeforeUnmount(() => {
  ws.disconnect()
})
</script>

<template>
  <SplitView storage-key="trading-terminal-split-horizontal">
    <template #left>
      <OrdersColumn />
    </template>

    <template #right>
      <component :is="currentComponent" />
    </template>
  </SplitView>
</template>
