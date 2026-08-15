<script setup lang="ts">
import { onMounted, ref } from 'vue'

import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import EngineWorkspace from '@/components/engine/EngineWorkspace.vue'
import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'
import type {
  BrowserAccountDelta,
  BrowserCommandIntent,
  BrowserCommandOutcome,
  BrowserReconciliationRefreshOutcome,
  CommandLifecycle,
} from '@/lib/gateway'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'
import {
  ACCEPTED_AT,
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionHistoryPage,
  engineProjectionSnapshot,
} from './engineProjectionFixtureData'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const gateway = useGatewayStore()
const markets = useMarketStore()
const latestAction = ref<{ accountId: string; intent: BrowserCommandIntent } | null>(null)

accounts.accountsRaw = [
  {
    id: ENGINE_ACCOUNT_ID,
    label: 'Engine Projection Testnet',
    key: 'fixture',
    network: NetworkType.Testnet,
    exchange: ExchangeType.Hyperliquid,
    exchange_metadata: {
      product: 'usdc_perp',
      margin_mode: 'cross',
      agent_address: '0xagent',
      agent_approved: true,
      builder_approved: true,
      default_leverage: 20,
    },
  },
]
projections.install(
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  { kind: 'initial' },
  engineProjectionSnapshot(),
)

gateway.requestOlderHistory = async () => {
  projections.mergeHistory(ENGINE_ACCOUNT_ID, engineProjectionHistoryPage())
}
gateway.subscribeMarket = (accountId, symbol) => {
  const requestId = '50000000-0000-4000-8000-000000000001'
  markets.begin(accountId, symbol, requestId)
  markets.install(accountId, requestId, '50000000-0000-4000-8000-000000000002', {
    symbol,
    oldest_sequence: 100,
    next_sequence: 355,
    samples: Array.from({ length: 128 }, (_, index) => {
      const price = index < 108 ? 145.4 - index * 0.014 : 143.888 + (index - 108) * 0.048
      const latest = index === 127
      return {
        sequence: 100 + index * 2,
        update_id: `market-update-${index}`,
        generation: 31,
        received_at_ms: ACCEPTED_AT + 1_873 + index,
        exchange_time_ms: latest ? ACCEPTED_AT + 2_000 : ACCEPTED_AT + 1_873 + index,
        price: latest ? '144.8' : price.toFixed(4),
        trade_id: latest ? 'sol-trade-31' : `sol-trade-${index}`,
      }
    }),
  })
}
gateway.unsubscribeMarket = (accountId, symbol) => markets.remove(accountId, symbol)
gateway.submitCommand = async (intent, accountId): Promise<BrowserCommandOutcome> => {
  latestAction.value = { accountId: accountId ?? '', intent }
  return {
    kind: 'accepted',
    command_id: crypto.randomUUID(),
    account_revision: 43,
    duplicate: false,
  }
}
gateway.refreshReconciliation = async (
  accountId = accounts.selectedAccountId,
  requestId = crypto.randomUUID(),
): Promise<BrowserReconciliationRefreshOutcome> => {
  if (accountId === null) throw new Error('no account selected')
  const cycleId = crypto.randomUUID()
  gateway.reconciliationRefreshByAccount[accountId] = {
    requestId,
    cycleId,
    duplicate: false,
    error: null,
  }
  const summary = projections.selectedLive?.checkpoint.summary
  if (summary !== undefined) {
    projections.byAccount[accountId]!.status = 'ready'
    summary.reconciliation_cycle_id = cycleId
    summary.reconciliation_status = 'reconciling'
    summary.reconciliation_ready = false
    window.setTimeout(() => {
      projections.byAccount[accountId]!.status = 'ready'
      summary.reconciliation_status = 'ready'
      summary.reconciliation_ready = true
    }, 500)
  }
  return { kind: 'accepted', cycle_id: cycleId, duplicate: false }
}
accounts.selectedAccountId = ENGINE_ACCOUNT_ID

function applyFixtureDelta(options: {
  commandId?: string
  lifecycle?: CommandLifecycle
  reconciliationReady?: boolean
}): void {
  const live = projections.selectedLive
  if (live === null) throw new Error('fixture projection is not installed')
  const command =
    options.commandId === undefined
      ? []
      : live.commands
          .filter((row) => row.command_id === options.commandId)
          .map((row) => ({ ...row, lifecycle: options.lifecycle ?? row.lifecycle }))
  if (options.commandId !== undefined && command.length !== 1) {
    throw new Error(`fixture command ${options.commandId} is not present`)
  }
  const update: BrowserAccountDelta = {
    checkpoint: {
      ...live.checkpoint,
      projection_revision: live.checkpoint.projection_revision + 1,
      summary: {
        ...live.checkpoint.summary,
        reconciliation_ready:
          options.reconciliationReady ?? live.checkpoint.summary.reconciliation_ready,
      },
    },
    commands: command,
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    native_protections: [],
    orders: [],
    positions: [],
    executions: [],
    balances: [],
    protections: [],
    relationships: [],
  }
  projections.apply(ENGINE_ACCOUNT_ID, ENGINE_SUBSCRIPTION_ID, update)
}

declare global {
  interface Window {
    __tradEngineProjectionFixture?: {
      applyDelta: typeof applyFixtureDelta
    }
  }
}

window.__tradEngineProjectionFixture = { applyDelta: applyFixtureDelta }

onMounted(() => {
  gateway.status = 'ready'
})
</script>

<template>
  <main class="engine-fixture" data-testid="engine-projection-fixture">
    <OrdersColumn />
    <EngineWorkspace />
    <EngineCommandModalContainer />
    <pre class="action-evidence" data-testid="latest-lifecycle-intent">{{
      latestAction ? JSON.stringify(latestAction) : 'none'
    }}</pre>
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

.action-evidence {
  position: fixed;
  right: 6px;
  bottom: 6px;
  z-index: -1;
  max-width: 1px;
  max-height: 1px;
  overflow: hidden;
}

@media (max-width: 760px) {
  .engine-fixture {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 58%) minmax(0, 42%);
  }
}
</style>
