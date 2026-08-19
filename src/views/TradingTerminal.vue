<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import EngineWorkspace from '@/components/engine/EngineWorkspace.vue'
import TerminalAccountEmptyState from '@/components/terminal/TerminalAccountEmptyState.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const accounts = useAccountsStore()
const gateway = useGatewayStore()

onMounted(async () => {
  if (accounts.lastFetchedAt === null && !accounts.loading) await accounts.fetchAccounts()
  gateway.connect()
})

onBeforeUnmount(() => {
  gateway.disconnect()
})
</script>

<template>
  <TerminalAccountEmptyState
    v-if="accounts.lastFetchedAt !== null && accounts.accounts.length === 0"
  />
  <SplitView v-else storage-key="trading-terminal-split-horizontal">
    <template #left>
      <OrdersColumn />
    </template>

    <template #right>
      <EngineWorkspace />
    </template>
  </SplitView>
</template>
