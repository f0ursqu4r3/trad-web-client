<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import EngineOrdersColumn from '@/components/engine/EngineOrdersColumn.vue'
import EngineWorkspace from '@/components/engine/EngineWorkspace.vue'
import SplitView from '@/components/general/SplitView.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const accounts = useAccountsStore()
const gateway = useGatewayStore()

onMounted(async () => {
  if (accounts.lastFetchedAt === null && !accounts.loading) {
    await accounts.fetchAccounts()
  }
  gateway.connect()
})

onBeforeUnmount(() => {
  gateway.disconnect()
})
</script>

<template>
  <SplitView storage-key="trading-terminal-split-horizontal">
    <template #left>
      <EngineOrdersColumn />
    </template>

    <template #right>
      <EngineWorkspace />
    </template>
  </SplitView>
</template>
