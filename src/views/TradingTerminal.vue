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

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useCommandStore } from '@/stores/command'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'

import TELongView from '@/components/terminal/views/TELongView.vue'

const commandStore = useCommandStore()

const currentComponent = computed<Component | null>(() => {
  if (!commandStore.selectedCommand) return null
  return (
    {
      'TE-LONG': TELongView,
    }[commandStore.selectedCommand?.name.toUpperCase()] || null
  )
})
</script>
