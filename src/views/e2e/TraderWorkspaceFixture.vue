<script setup lang="ts">
import { onMounted } from 'vue'

import type {
  BrowserCommandOutcome,
  BrowserMarketSample,
  BrowserPreviewOutcome,
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
  const samples = marketSamples(symbol)
  markets.begin(accountId, symbol, requestId)
  markets.install(accountId, requestId, crypto.randomUUID(), {
    symbol,
    oldest_sequence: 1,
    next_sequence: samples.length + 1,
    samples,
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
onMounted(() => {
  gateway.status = 'ready'
})

function marketSamples(symbol: string): BrowserMarketSample[] {
  const now = Date.now()
  return Array.from({ length: 80 }, (_, index) => {
    const sequence = index + 1
    const price =
      symbol === 'SOL' ? solPrice(index) : symbol === 'ETH' ? ethPrice(index) : btcPrice(index)
    return {
      sequence,
      update_id: `workspace-${symbol.toLowerCase()}-${sequence}`,
      generation: sequence,
      received_at_ms: now - (80 - index) * 1_000,
      exchange_time_ms: now - (80 - index) * 1_000,
      price,
      trade_id: `workspace-${symbol.toLowerCase()}-trade-${sequence}`,
    }
  })
}

function solPrice(index: number): string {
  const movement =
    index <= 12
      ? 144.4 + index * (0.8 / 12)
      : index <= 55
        ? 145.2 - (index - 12) * (1.3 / 43)
        : 143.9 + (index - 55) * 0.028
  const texture = Math.sin(index * 1.7) * 0.035 + Math.sin(index * 0.37) * 0.05
  return (movement + texture).toFixed(4)
}

function ethPrice(index: number): string {
  return (1916 + index * 0.035 + Math.sin(index / 5) * 0.8).toFixed(5)
}

function btcPrice(index: number): string {
  if (index === 79) return '63842.5'
  return (63780 + index * 0.72 + Math.sin(index / 6) * 18).toFixed(5)
}
</script>

<template>
  <TradingTerminal />
</template>
