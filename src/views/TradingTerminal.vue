<script setup lang="ts">
import { computed, type Component, onBeforeUnmount, onMounted } from 'vue'
import { useWsStore } from '@/stores/ws'
import { useCommandStore } from '@/stores/command'
import { useAccountsStore } from '@/stores/accounts'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'

import TELongView from '@/components/terminal/views/TELongView.vue'

const ws = useWsStore()
const commandStore = useCommandStore()

const currentComponent = computed<Component | null>(() => {
  if (!commandStore.selectedCommand) return null
  return (
    {
      'TE-LONG': TELongView,
    }[commandStore.selectedCommand?.name.toUpperCase()] || null
  )
})

// View key handlers
function onKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey) {
    const key = event.key
    // 1-0 keys
    if (/^[1-9]$/.test(key) || key === '0') {
      const index = key === '0' ? 9 : parseInt(key, 10) - 1
      const account = useAccountsStore().accounts[index]
      if (account) {
        useAccountsStore().selectedAccountId = account.id
        event.preventDefault()
      }
    }
  }
}

onMounted(() => {
  ws.connect()
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  ws.disconnect()
  window.removeEventListener('keydown', onKeyDown)
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
