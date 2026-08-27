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
import { GatewayTelemetryObserver } from '@/lib/telemetry/gatewayObservation'
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
const telemetry = new GatewayTelemetryObserver()

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
const initialProjection = engineProjectionSnapshot()
if (new URLSearchParams(location.search).has('low_margin')) {
  const settlement = initialProjection.balances.find((balance) => balance.asset === 'USDC')
  if (settlement) settlement.available = '10'
}
if (new URLSearchParams(location.search).has('reconciliation')) {
  const position = initialProjection.positions.find((candidate) => candidate.symbol === 'ETH')
  if (position) {
    position.status = 'reconciliation_required'
    position.reconciliation_required = true
  }
  const protection = initialProjection.native_protections.find(
    (candidate) => candidate.symbol === 'ETH',
  )
  if (protection) {
    protection.status = 'reconciliation_required'
    protection.failure_reason = 'fixture protection quantity mismatch'
  }
}
if (new URLSearchParams(location.search).has('active_close')) {
  const entry = initialProjection.orders.find(
    (candidate) => candidate.current_request.symbol === 'ETH',
  )
  const position = initialProjection.positions.find((candidate) => candidate.symbol === 'ETH')
  const primary = initialProjection.commands.find(
    (candidate) => candidate.accepted.kind === 'place_order',
  )
  if (entry && position && primary) {
    position.status = 'awaiting_exchange_confirmation'
    initialProjection.close_workflows.push({
      close_workflow_id: '39000000-0000-4000-8000-000000000001',
      command_id: '39000000-0000-4000-8000-000000000002',
      source_command_ids: [primary.command_id],
      symbol: 'ETH',
      position_side: 'long',
      requested_reductions: [{ scope_id: 'scope-filled', quantity: '0.00210001' }],
      close_all: false,
      authoritative_side: false,
      requested_external_quantity: '0',
      submitted_reductions: null,
      submitted_external_quantity: '0',
      requested_quantity: '0.00210001',
      source_order_ids: [entry.order_id],
      execution: { kind: 'market' },
      execution_root: { kind: 'order', order_id: '39000000-0000-4000-8000-000000000003' },
      close_order_id: '39000000-0000-4000-8000-000000000003',
      submission_operation_id: '39000000-0000-4000-8000-000000000004',
      client_order_id: 'fixture-active-close',
      lifecycle: 'running',
      last_reason: null,
      created_at: Date.now(),
    })
  }
}
projections.install(
  ENGINE_ACCOUNT_ID,
  ENGINE_SUBSCRIPTION_ID,
  { kind: 'initial' },
  initialProjection,
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
gateway.previewCommand = async (
  intent,
  accountId = ENGINE_ACCOUNT_ID,
  requestId = crypto.randomUUID(),
  actionAttemptId,
): Promise<BrowserPreviewOutcome> => {
  const attempt = telemetry.attempt(intent, accountId!, requestId, actionAttemptId)
  telemetry.previewRequested(attempt)
  telemetry.requestSent(attempt)
  const outcome: BrowserPreviewOutcome = {
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
  }
  telemetry.previewResult(attempt, outcome)
  return outcome
}
gateway.submitCommand = async (
  intent,
  accountId = ENGINE_ACCOUNT_ID,
  requestId = crypto.randomUUID(),
  actionAttemptId,
): Promise<BrowserCommandOutcome> => {
  const attempt = telemetry.attempt(intent, accountId!, requestId, actionAttemptId)
  telemetry.submitted(attempt)
  telemetry.requestSent(attempt)
  const outcome: BrowserCommandOutcome = {
    kind: 'accepted',
    command_id: crypto.randomUUID(),
    account_revision: 43,
    duplicate: false,
  }
  telemetry.commandResult(attempt, outcome)
  return outcome
}
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
