<script setup lang="ts">
import { onMounted } from 'vue'

import type {
  BrowserCommandOutcome,
  BrowserPreviewOutcome,
  BrowserReconciliationRefreshOutcome,
} from '@/lib/gateway'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'
import TradingTerminal from '@/views/TradingTerminal.vue'
import {
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionSnapshot,
} from './engineProjectionFixtureData'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const gateway = useGatewayStore()
const markets = useMarketStore()

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
      user_address: '0x7d6cabebf3ab638ee10e0eaabe671bfcfb8336dc3',
      agent_address: '0xagent',
      agent_approved: true,
      builder_address: '0x9585dc2df331106464f56e73d57cecda7d226510',
      builder_approved: true,
      builder_target_total_tenths_bps: 52,
      max_builder_fee_tenths_bps: 100,
      default_leverage: 1,
    },
  },
]
accounts.selectedAccountId = ENGINE_ACCOUNT_ID
accounts.lastFetchedAt = Date.now()
projections.install(
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  { kind: 'initial' },
  engineProjectionSnapshot(),
)

gateway.subscribeMarket = (accountId, symbol) => {
  const requestId = crypto.randomUUID()
  markets.begin(accountId, symbol, requestId)
  markets.install(accountId, requestId, crypto.randomUUID(), {
    symbol,
    oldest_sequence: 1,
    next_sequence: 2,
    samples: [
      {
        sequence: 1,
        update_id: 'workspace-market-1',
        generation: 1,
        received_at_ms: Date.now(),
        exchange_time_ms: Date.now(),
        price: '63842.5',
        trade_id: 'workspace-trade-1',
      },
    ],
  })
}
gateway.unsubscribeMarket = () => undefined
gateway.previewCommand = async (intent): Promise<BrowserPreviewOutcome> => ({
  kind: 'ready',
  preview: {
    kind:
      intent.kind === 'place_order'
        ? 'order'
        : intent.kind === 'place_chase'
          ? 'chase'
          : 'trailing_entry',
    symbol: intent.parameters.symbol,
    position_side: intent.parameters.position_side,
    decision_price: '63842.5',
    price_source: intent.parameters.position_side === 'long' ? 'best_ask' : 'best_bid',
    market_observed_at_ms: Date.now(),
    raw_base_quantity: '0.00078318',
    normalized_base_quantity: '0.00078',
    normalized_quote_notional: '49.79715',
    children: [{ base_quantity: '0.00078', quote_notional: '49.79715' }],
    instrument: {
      price: { kind: 'hyperliquid_perpetual', size_decimals: 5 },
      quantity_step: '0.00001',
      minimum_order_quantity: '0.00001',
      maximum_order_quantity: null,
      minimum_order_notional: '10',
      observed_at_ms: Date.now(),
    },
    warnings: [],
  },
})
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
  <TradingTerminal />
</template>
