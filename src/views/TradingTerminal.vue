<script setup lang="ts">
import { computed, type Component, onBeforeUnmount, onMounted } from 'vue'
import { useWsStore } from '@/stores/ws'
import { useCommandStore } from '@/stores/command'
import { getv } from '@/lib/utils'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'

import TrailingEntryView from '@/components/terminal/views/TrailingEntryView.vue'
import DeviceDetailsView from '@/components/terminal/views/DeviceDetailsView.vue'

const ws = useWsStore()
const commandStore = useCommandStore()

const componentMap: Record<string, Component> = {
  TrailingEntryOrder: TrailingEntryView,
}

const currentComponent = computed<Component | null>(() => {
  if (!commandStore.selectedCommand) return null
  return (
    getv(componentMap, commandStore.selectedCommand?.command.kind, DeviceDetailsView) ||
    DeviceDetailsView
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
