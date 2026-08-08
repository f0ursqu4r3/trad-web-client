<script setup lang="ts">
import EngineOrdersColumn from '@/components/engine/EngineOrdersColumn.vue'
import ProjectionDetails from '@/components/engine/ProjectionDetails.vue'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import {
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionHistoryPage,
  engineProjectionSnapshot,
} from './engineProjectionFixtureData'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const gateway = useGatewayStore()

accounts.accountsRaw = [
  {
    id: ENGINE_ACCOUNT_ID,
    label: 'Engine Projection Testnet',
    key: 'fixture',
    network: NetworkType.Testnet,
    exchange: ExchangeType.Hyperliquid,
  },
]
accounts.selectedAccountId = ENGINE_ACCOUNT_ID
projections.install(
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  { kind: 'initial' },
  engineProjectionSnapshot(),
)

gateway.requestOlderHistory = async () => {
  projections.mergeHistory(ENGINE_ACCOUNT_ID, engineProjectionHistoryPage())
}
</script>

<template>
  <main class="engine-fixture" data-testid="engine-projection-fixture">
    <EngineOrdersColumn />
    <ProjectionDetails />
  </main>
</template>

<style scoped>
.engine-fixture {
  display: grid;
  width: 100vw;
  height: 100vh;
  grid-template-columns: minmax(480px, 44%) minmax(0, 1fr);
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-bg);
}

@media (max-width: 760px) {
  .engine-fixture {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 58%) minmax(0, 42%);
  }
}
</style>
