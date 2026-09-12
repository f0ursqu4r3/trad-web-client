<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type {
  BrowserCommandOutcome,
  BrowserCommandIntent,
  BrowserMarketSample,
  BrowserPreviewOutcome,
} from '@/lib/gateway'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { CommandOutcomeUnknownError, useGatewayStore } from '@/stores/gateway'
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
const submittedIntent = ref<BrowserCommandIntent | null>(null)
const submittedRequestId = ref<string | null>(null)
const submissionCount = ref(0)
const submissionEvidence = computed(() =>
  JSON.stringify({
    count: submissionCount.value,
    request_id: submittedRequestId.value,
    intent: submittedIntent.value,
  }),
)

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
if (new URLSearchParams(location.search).has('two_tps')) {
  const protection = initialProjection.native_protections.find((row) => row.symbol === 'ETH')
  const first = protection?.plan.children.find((row) => row.protection_kind === 'take_profit')
  const firstState = first === undefined ? undefined : protection?.children[first.child_id]
  if (protection && first && firstState) {
    const secondId = '30000000-0000-4000-8000-000000000006'
    protection.plan.children.splice(1, 0, {
      ...structuredClone(first),
      child_id: secondId,
      client_order_id: 'trad-native-take-profit-second',
      trigger_price: '2200.125',
      execution: { kind: 'bounded_market', worst_price: '2190.125' },
    })
    protection.children[secondId] = {
      ...structuredClone(firstState),
      child_id: secondId,
      remote_order_ids: ['native-take-profit-second-remote'],
    }
  }
}
if (new URLSearchParams(location.search).has('closed_stop_pnl')) {
  const position = initialProjection.positions.find((row) => row.symbol === 'ETH')
  const protection = initialProjection.native_protections.find((row) => row.symbol === 'ETH')
  const entry = initialProjection.executions.find((row) => row.event_id === 'fill-eth-1')
  const entryOrder = initialProjection.orders.find((row) => row.order_id === entry?.order?.order_id)
  if (position && protection && entry && entryOrder) {
    initialProjection.executions = initialProjection.executions.filter(
      (row) => row.fill.symbol !== 'ETH',
    )
    entry.fill.price = '80956'
    entry.fill.quantity = '10.02004'
    entry.fill.fee = { asset: 'USDC', amount: '442.256590' }
    entry.fill.builder_fee = { asset: 'USDC', amount: '100' }
    initialProjection.executions.push(entry)
    entryOrder.filled_quantity = '10.02004'
    const exposure = position.owned_exposure['scope-filled']
    if (exposure) {
      exposure.opened_quantity = '10.02004'
      exposure.reduced_quantity = '10.02004'
      exposure.remaining_quantity = '0'
      position.exchange_quantity.long = '0'
      position.owned_quantity.long = '0'
    }
    const stop = structuredClone(entry)
    stop.event_id = 'copied-stopped-long-exit'
    stop.fill.event_id = stop.event_id
    stop.fill.execution_id = stop.event_id
    stop.fill.side = 'sell'
    stop.fill.price = '80282'
    stop.fill.fee = { asset: 'USDC', amount: '429.565005' }
    stop.fill.builder_fee = { asset: 'USDC', amount: '80' }
    stop.order = null
    stop.protection_owner = {
      scope_id: protection.scope_id,
      scope_revision: protection.scope_revision,
      controller: { kind: 'native', id: protection.protection_id },
      child_id: protection.plan.children.find((child) => child.protection_kind === 'stop_loss')!
        .child_id,
    }
    initialProjection.executions.push(stop)
    initialProjection.checkpoint.summary.executions = initialProjection.executions.length
  }
}
if (new URLSearchParams(location.search).has('sync_checking')) {
  initialProjection.checkpoint.summary.reconciliation_status = 'reconciling'
  initialProjection.checkpoint.summary.reconciliation_ready = false
}
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
  if (new URLSearchParams(location.search).has('preview_rejected')) {
    const outcome: BrowserPreviewOutcome = {
      kind: 'rejected',
      rejection: {
        code: 'planning_failed',
        reason: 'fixture exchange evidence was temporarily unavailable',
        retryable: true,
      },
    }
    telemetry.previewResponse(attempt)
    return outcome
  }
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
  telemetry.previewResponse(attempt)
  return outcome
}
gateway.submitCommand = async (
  intent,
  accountId = ENGINE_ACCOUNT_ID,
  requestId = crypto.randomUUID(),
  actionAttemptId,
): Promise<BrowserCommandOutcome> => {
  submittedIntent.value = intent
  submittedRequestId.value = requestId
  submissionCount.value += 1
  const attempt = telemetry.attempt(intent, accountId!, requestId, actionAttemptId)
  telemetry.submitted(attempt)
  telemetry.requestSent(attempt)
  if (new URLSearchParams(location.search).has('delay_close')) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
  }
  const fixtureOptions = new URLSearchParams(location.search)
  if (fixtureOptions.has('close_timeout') || fixtureOptions.has('command_timeout')) {
    if (intent.kind === 'amend_protection' && fixtureOptions.has('protection_terminal')) {
      window.setTimeout(() => {
        const next = structuredClone(initialProjection)
        const primary = next.commands.find((command) => command.accepted.kind === 'place_order')
        if (primary === undefined) return
        next.commands.push({
          ...structuredClone(primary),
          command_id: requestId,
          accepted_at: Date.now(),
          accepted: {
            kind: 'amend_protection',
            parameters: { protection_id: intent.parameters.protection_id },
          },
          root: { kind: 'protection_amendment', id: requestId },
          lifecycle: 'succeeded',
          failure_reason: null,
        })
        const amended = next.native_protections.find(
          (protection) => protection.protection_id === intent.parameters.protection_id,
        )
        if (amended) {
          amended.plan_revision += 1
          const stop = amended.plan.children.find((child) => child.protection_kind === 'stop_loss')
          if (stop) stop.trigger_price = '1801.125'
        }
        next.checkpoint.account_revision += 1
        next.checkpoint.projection_revision += 1
        projections.install(ENGINE_ACCOUNT_ID, ENGINE_SUBSCRIPTION_ID, { kind: 'initial' }, next)
      }, 750)
    }
    throw new CommandOutcomeUnknownError(requestId, 'fixture response timed out')
  }
  const outcome: BrowserCommandOutcome = {
    kind: 'accepted',
    command_id: requestId,
    account_revision: 43,
    duplicate: false,
  }
  telemetry.commandResult(attempt, outcome)
  if (
    intent.kind === 'close_exposure' &&
    new URLSearchParams(location.search).has('close_terminal')
  ) {
    window.setTimeout(() => {
      const next = structuredClone(initialProjection)
      const primary = next.commands.find(
        (command) => command.command_id === intent.parameters.source_command_id,
      )
      if (primary === undefined) return
      next.commands.push({
        ...structuredClone(primary),
        command_id: requestId,
        accepted_at: Date.now(),
        accepted: { kind: 'close_exposure', parameters: { source_command_id: primary.command_id } },
        root: { kind: 'close_workflow', id: requestId },
        lifecycle: 'succeeded',
        failure_reason: null,
      })
      next.checkpoint.account_revision += 1
      next.checkpoint.projection_revision += 1
      projections.install(ENGINE_ACCOUNT_ID, ENGINE_SUBSCRIPTION_ID, { kind: 'initial' }, next)
    }, 150)
  }
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
  <pre data-testid="submitted-command-evidence" hidden>{{ submissionEvidence }}</pre>
</template>
