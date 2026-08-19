<script setup lang="ts">
import { nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import EngineWorkspace from '@/components/engine/EngineWorkspace.vue'
import TerminalAccountEmptyState from '@/components/terminal/TerminalAccountEmptyState.vue'
import { useAccountsStore } from '@/stores/accounts'
import { openCommandPalette } from '@/lib/engineCommands/palette'

const accounts = useAccountsStore()
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  if (accounts.lastFetchedAt === null && !accounts.loading) await accounts.fetchAccounts()
  if (route.query.commands === 'open' && accounts.accounts.length > 0) {
    await nextTick()
    openCommandPalette()
    const query = { ...route.query }
    delete query.commands
    void router.replace({ query })
  }
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
