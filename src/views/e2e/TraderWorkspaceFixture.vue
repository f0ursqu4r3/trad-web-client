<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuth } from '@/lib/auth'

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
const marketWire = new URLSearchParams(location.search).has('market_wire')
const telemetry = new GatewayTelemetryObserver()
const requestedAccountId = new URLSearchParams(location.search).get('account_id')
const fixtureAccountId =
  requestedAccountId &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedAccountId,
  )
    ? requestedAccountId
    : ENGINE_ACCOUNT_ID
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

// `agent_valid_for_ms=<ms>` puts the agent wallet's expiry that far from now.
const agentValidFor = new URLSearchParams(location.search).get('agent_valid_for_ms')
const agentValidUntilMs = agentValidFor === null ? null : Date.now() + Number(agentValidFor)

accounts.accountsRaw = [
  {
    id: fixtureAccountId,
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
      agent_valid_until_ms: agentValidUntilMs,
      builder_address: '0x9585dc2df331106464f56e73d57cecda7d226510',
      builder_approved: true,
      builder_target_total_tenths_bps: 52,
      max_builder_fee_tenths_bps: 100,
      default_leverage: 1,
    },
  },
]
accounts.selectedAccountId = fixtureAccountId
accounts.lastFetchedAt = Date.now()
const initialProjection = engineProjectionSnapshot()
if (new URLSearchParams(location.search).has('pro_rata_protection')) {
  const takeProfit = initialProjection.native_protections
    .find((row) => row.symbol === 'ETH')
    ?.plan.children.find((row) => row.protection_kind === 'take_profit')
  if (takeProfit) {
    takeProfit.allocation = {
      kind: 'pro_rata',
      value: {
        fraction: '1',
        terminal: '0.0045',
        terminal_basis: '0.0045',
        quantity_step: '0.0001',
      },
    }
  }
}
if (new URLSearchParams(location.search).has('taken_over_pnl')) {
  const exposure = initialProjection.positions.find((row) => row.symbol === 'ETH')?.owned_exposure[
    'scope-filled'
  ]
  if (exposure) {
    exposure.detached = true
    exposure.reduced_quantity = exposure.opened_quantity
    exposure.remaining_quantity = '0'
  }
}
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
// A trade whose stop Trad flagged after it was canceled on the venue.
const rearmOption = new URLSearchParams(location.search).get('rearm')
if (rearmOption !== null) {
  const protection = initialProjection.native_protections.find(
    (candidate) => candidate.symbol === 'ETH',
  )
  const stop = protection?.plan.children.find((child) => child.protection_kind === 'stop_loss')
  if (protection && stop) {
    protection.status = 'reconciliation_required'
    protection.failure_reason =
      'owned protection stop loss order trad-native-stop-loss was canceled at the venue outside Trad'
    protection.children[stop.child_id]!.confirmed_quantity = '0'
    protection.children[stop.child_id]!.remote_order_ids = []
    protection.rearm =
      rearmOption === 'refused'
        ? { available: false, refused_reason: 'a close of this trade is still working' }
        : { available: true }
  }
}
if (new URLSearchParams(location.search).has('chase_fee_risk')) {
  const chase = initialProjection.chases[0]
  if (chase) {
    chase.price_risk = {
      revision: 8,
      stop_price: '81350',
      candidate_price: '80662',
      calculation_cap: '4.05844',
      filled_quantity: '0.025',
      filled_price_risk: '17.0',
      fee_risk: {
        consumed_entry_fees: '1.1',
        expected_entry_fees: '1.05',
        observed_entry_fee_variance: '0.05',
        expected_filled_exit_fees: '1.12',
        total_consumed_risk: '19.22',
        actual_entry_fee_quantity: '0.025',
        modeled_entry_fee_quantity: '0',
      },
      remaining_risk: '5.78',
      permitted_remainder: '0.1',
      permitted_total: '0.125',
      over_budget: '0',
      disposition: 'executable',
    }
  }
}
if (new URLSearchParams(location.search).has('fees_approx')) {
  const fees = initialProjection.positions.find((candidate) => candidate.symbol === 'ETH')
    ?.owned_exposure['scope-filled']?.fees
  if (fees) {
    fees.exit = [{ asset: 'USDC', exchange_fee: '0.0019', builder_fee: '0.0011' }]
    fees.apportioned = true
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
if (!marketWire)
  projections.install(
    fixtureAccountId,
    ENGINE_SUBSCRIPTION_ID,
    { kind: 'initial' },
    initialProjection,
  )

if (!marketWire) {
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
    if (new URLSearchParams(location.search).has('market_error') && symbol === 'ETH') {
      markets.fail(accountId, symbol, 'fixture market stream unavailable')
    }
  }
  gateway.unsubscribeMarket = () => undefined
}
gateway.previewCommand = async (
  intent,
  accountId = fixtureAccountId,
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
  accountId = fixtureAccountId,
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
  // The node refuses a re-armed stop that is already through the market.
  if (
    intent.kind === 'rearm_protection' &&
    fixtureOptions.has('rearm_through') &&
    intent.parameters.price_edits === undefined
  ) {
    const rejected: BrowserCommandOutcome = {
      kind: 'rejected',
      rejection: {
        code: 'planning_failed',
        reason:
          'the stop loss at 1800.125 is already through the market (1795); give it a new price to re-arm',
        retryable: false,
      },
    }
    telemetry.commandResult(attempt, rejected)
    return rejected
  }
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
        projections.install(fixtureAccountId, ENGINE_SUBSCRIPTION_ID, { kind: 'initial' }, next)
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
      projections.install(fixtureAccountId, ENGINE_SUBSCRIPTION_ID, { kind: 'initial' }, next)
    }, 150)
  }
  return outcome
}
onMounted(() => {
  if (marketWire) {
    void useAuth()
      .waitUntilReady()
      .then(async () => {
        await nextTick()
        gateway.connect()
      })
  } else gateway.status = 'ready'
})
onBeforeUnmount(() => {
  if (marketWire) gateway.disconnect()
})

function marketSamples(symbol: string): BrowserMarketSample[] {
  const now = Date.now()
  const staleOffset = new URLSearchParams(location.search).has('stale_market') ? 20_000 : 0
  return Array.from({ length: 80 }, (_, index) => {
    const sequence = index + 1
    const price =
      symbol === 'SOL' ? solPrice(index) : symbol === 'ETH' ? ethPrice(index) : btcPrice(index)
    return {
      sequence,
      update_id: `workspace-${symbol.toLowerCase()}-${sequence}`,
      generation: sequence,
      received_at_ms: now - staleOffset - (80 - index) * 1_000,
      exchange_time_ms: now - staleOffset - (80 - index) * 1_000,
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
