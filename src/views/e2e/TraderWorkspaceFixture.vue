<script setup lang="ts">
import { onMounted, ref } from 'vue'

import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'
import TradeWorkspace, {
  type TraderWorkspaceSection,
} from '@/components/trader/TradeWorkspace.vue'
import type { BrowserCommandOutcome, BrowserReconciliationRefreshOutcome } from '@/lib/gateway'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import {
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionSnapshot,
} from './engineProjectionFixtureData'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const gateway = useGatewayStore()
const section = ref<TraderWorkspaceSection>('trades')

accounts.accountsRaw = [
  {
    id: ENGINE_ACCOUNT_ID,
    label: 'Krio demo',
    key: 'fixture',
    network: NetworkType.Mainnet,
    exchange: ExchangeType.Hyperliquid,
    exchange_metadata: {
      product: 'usdc_perp',
      margin_mode: 'cross',
      agent_address: '0xagent',
      agent_approved: true,
      builder_approved: true,
      builder_target_total_tenths_bps: 52,
      default_leverage: 1,
    },
  },
]
accounts.selectedAccountId = ENGINE_ACCOUNT_ID
projections.install(
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  { kind: 'initial' },
  engineProjectionSnapshot(),
)

gateway.submitCommand = async (): Promise<BrowserCommandOutcome> => ({
  kind: 'accepted',
  command_id: crypto.randomUUID(),
  account_revision: 43,
  duplicate: false,
})
gateway.refreshReconciliation = async (): Promise<BrowserReconciliationRefreshOutcome> => ({
  kind: 'accepted',
  cycle_id: crypto.randomUUID(),
  duplicate: false,
})

onMounted(() => {
  gateway.status = 'ready'
})
</script>

<template>
  <main class="workspace-fixture">
    <nav class="fixture-tabs">
      <button v-for="tab in (['trades', 'positions', 'orders'] as TraderWorkspaceSection[])" :key="tab" type="button" @click="section = tab">
        {{ tab }}
      </button>
    </nav>
    <TradeWorkspace :section="section" @section="section = $event" />
    <EngineCommandModalContainer />
  </main>
</template>

<style scoped>
.workspace-fixture {
  display: flex;
  width: 100vw;
  height: 100vh;
  flex-direction: column;
  color: var(--fg);
  background: var(--surface-canvas);
}
.fixture-tabs {
  display: flex;
  min-height: 38px;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border-normal);
}
.fixture-tabs button {
  color: var(--fg-muted);
  text-transform: capitalize;
  background: none;
  border: 0;
}
</style>
