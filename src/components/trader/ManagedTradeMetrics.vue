<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { recordTelemetry } from '@/lib/telemetry'
import { marketStreamEvent } from '@/lib/telemetry/marketObservation'

import {
  addExact,
  compareExact,
  formatExactDecimal,
  multiplyExact,
  subtractExact,
} from '@/lib/exactDecimalMath'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { tradeFeeSummary, type FeeLeg } from '@/lib/projection/tradeFees'
import type { NativeProtectionChildProjection } from '@/lib/gateway'
import { formatNumberAuto, formatNumberShort } from '@/lib/numberFormat'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'

const props = defineProps<{ trade: ManagedTradeView }>()
const emit = defineEmits<{ (event: 'move-protection', childId: string): void }>()
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const markets = useMarketStore()
const accountId = computed(() => accounts.selectedAccountId)
const market = computed(() => markets.stream(accountId.value, props.trade.symbol))
const historical = computed(
  () => props.trade.lifecycle === 'closed' || props.trade.lifecycle === 'taken_over',
)
const latestSample = computed(() => {
  const samples = market.value?.samples ?? []
  return samples[samples.length - 1] ?? null
})
const now = ref(Date.now())
let freshnessClock: number | null = null
const priceAgeSeconds = computed(() =>
  latestSample.value === null
    ? null
    : Math.max(0, Math.floor((now.value - latestSample.value.exchange_time_ms) / 1_000)),
)
// Non-null only once the last trade is old enough to mention, so the 1 s clock
// re-renders a card only while its price is stale.
const stalePriceSeconds = computed(() =>
  priceAgeSeconds.value !== null && priceAgeSeconds.value >= 15 ? priceAgeSeconds.value : null,
)
const latestPrice = computed(() => {
  if (market.value?.status !== 'ready') return null
  return latestSample.value?.price ?? null
})
let subscribed: { accountId: string; symbol: string } | null = null
const unrealized = computed(() => {
  if (latestPrice.value === null || props.trade.averageEntryPrice === null) return null
  const change =
    props.trade.side === 'long'
      ? subtractExact(latestPrice.value, props.trade.averageEntryPrice)
      : subtractExact(props.trade.averageEntryPrice, latestPrice.value)
  return multiplyExact(change, props.trade.remainingQuantity)
})
const liveTradePnl = computed(() => {
  const asset = props.trade.pnlAsset
  if (!props.trade.pnlEvidenceComplete || asset === null) return null
  if (historical.value) return props.trade.netAfterFees.get(asset) ?? null
  const realized = props.trade.realizedPnl.get(asset) ?? '0'
  const fees = props.trade.totalFees.get(asset) ?? '0'
  return unrealized.value === null
    ? null
    : subtractExact(addExact(realized, unrealized.value), fees)
})
const liveMissing = computed(() => {
  if (props.trade.lifecycle === 'taken_over' && !props.trade.pnlEvidenceComplete) {
    return {
      label: 'unknown after takeover',
      title:
        'Trad stopped managing this trade at Take Over; complete attributed exit fills are needed for final P&L',
    }
  }
  if (!props.trade.pnlEvidenceComplete) {
    return {
      label: 'incomplete',
      title: 'Closing-fill evidence is incomplete; P&L is not estimated from fees alone',
    }
  }
  if (market.value?.status === 'reconnecting') {
    return {
      label: latestSample.value === null ? 'waiting for price' : 'feed reconnecting',
      title:
        'Waiting for the exchange price feed to recover; cached prices are not used as live P&L',
    }
  }
  if (market.value?.status === 'error' && market.value.unknownMarket) {
    return {
      label: 'unknown market',
      title: 'The exchange does not list this market, so Trad cannot price it',
    }
  }
  if (market.value?.status === 'error') {
    return {
      label: 'feed unavailable',
      title: 'The Trad market subscription failed or disconnected',
    }
  }
  if (
    market.value === null ||
    market.value.status === 'idle' ||
    market.value.status === 'subscribing' ||
    latestSample.value === null
  ) {
    return { label: 'waiting for price', title: 'Waiting for the first Trad market sample' }
  }
  return {
    label: 'unavailable',
    title: 'The current trade cannot be valued from available evidence',
  }
})
const exchangeFees = computed(() => {
  const values = new Map(props.trade.totalFees)
  for (const [asset, builder] of props.trade.builderFees) {
    values.set(asset, subtractExact(values.get(asset) ?? '0', builder))
  }
  return values
})
const pinnedAllIn = computed(() =>
  props.trade.pinnedAllInTargetTenthsBps === null
    ? '-'
    : `${(props.trade.pinnedAllInTargetTenthsBps / 10).toFixed(1)} bps`,
)
// Fees the venue charged on this trade's fills (absent from older projections
// and before the trade has a position).
const actualFees = computed(() => tradeFeeSummary(props.trade.exposure?.fees))
const feeAsset = computed(() =>
  actualFees.value === null
    ? commonAsset(exchangeFees.value, props.trade.builderFees)
    : commonAsset(actualFees.value.total),
)

const stop = computed(() =>
  props.trade.protection?.plan.children.find((child) => child.protection_kind === 'stop_loss'),
)
const takeProfits = computed(
  () =>
    props.trade.protection?.plan.children.filter(
      (child) => child.protection_kind === 'take_profit',
    ) ?? [],
)

function totals(values: Map<string, string>): string {
  if (values.size === 0) return '-'
  return [...values]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([asset, value]) => `${formatExactDecimal(value)} ${asset}`)
    .join(', ')
}

function legAmount(leg: FeeLeg): string {
  if (leg.exchange.size === 0 && leg.builder.size === 0) return '-'
  const asset = feeAsset.value
  if (asset === null) return `${totals(leg.exchange)} + ${totals(leg.builder)}`
  return `${feeAmount(leg.exchange)} + ${feeAmount(leg.builder)}`
}

// Fee amounts in the quote asset, at most six decimals (USDC precision) so
// entry and exit fit the column; the exact values are in the titles.
function feeAmount(values: Map<string, string>): string {
  const asset = feeAsset.value
  if (asset === null) return totals(values)
  const value = values.get(asset)
  if (value === undefined) return values.size === 0 ? '0' : totals(values)
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return formatExactDecimal(value)
  return formatNumberAuto(numeric, { maxDecimals: 6 })
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

function legTitle(name: string, leg: FeeLeg): string {
  return `${name} fees charged: exchange ${totals(leg.exchange)} + Trad builder ${totals(leg.builder)}`
}

function commonAsset(...values: Map<string, string>[]): string | null {
  const assets = new Set(values.flatMap((totals) => [...totals.keys()]))
  return assets.size === 1 ? [...assets][0]! : null
}

function amount(values: Map<string, string>, asset: string | null): string {
  if (asset === null) return totals(values)
  const value = values.get(asset)
  return value === undefined ? '-' : formatExactDecimal(value)
}

function compactAmount(value: string | null): string {
  if (value === null) return '-'
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? formatNumberShort(numeric, { maxDecimals: 6 })
    : formatExactDecimal(value)
}

function totalTone(values: Map<string, string>): '' | 'positive' | 'negative' {
  if (values.size !== 1) return ''
  const value = values.values().next().value
  if (value === undefined) return ''
  const compared = compareExact(value, '0')
  return compared > 0 ? 'positive' : compared < 0 ? 'negative' : ''
}

function childState(child: NativeProtectionChildProjection | undefined): string {
  if (child === undefined) return 'planned'
  if (child.failure_reason?.startsWith('deferred_minimum_notional:')) {
    return 'waiting for minimum size'
  }
  if (child.failure_reason) return 'failed'
  if (child.pending_operation_id) return 'updating'
  if (child.remote_order_ids.length > 0) return 'working'
  return 'installing'
}

function syncMarketSubscription(): void {
  const nextAccountId = historical.value ? null : accountId.value
  const nextSymbol = props.trade.symbol
  if (subscribed?.accountId === nextAccountId && subscribed.symbol === nextSymbol) return
  if (subscribed) gateway.unsubscribeMarket(subscribed.accountId, subscribed.symbol)
  subscribed = nextAccountId ? { accountId: nextAccountId, symbol: nextSymbol } : null
  if (subscribed) gateway.subscribeMarket(subscribed.accountId, subscribed.symbol, 64)
}

onMounted(() => {
  freshnessClock = window.setInterval(() => (now.value = Date.now()), 1_000)
  syncMarketSubscription()
})
watch([accountId, () => props.trade.symbol, () => props.trade.lifecycle], () => {
  if (freshnessClock !== null) syncMarketSubscription()
})
watch(
  [
    accountId,
    () => market.value?.status,
    () => props.trade.lifecycle,
    () => props.trade.symbol,
    () => latestSample.value !== null,
  ],
  ([currentAccountId, status, lifecycle, symbol]) => {
    if (lifecycle === 'closed' || lifecycle === 'taken_over' || !currentAccountId || !status) return

    recordTelemetry(
      marketStreamEvent(
        currentAccountId,
        symbol,
        status === 'reconnecting'
          ? 'reconnecting'
          : status === 'error'
            ? 'error'
            : status === 'ready' && latestSample.value
              ? 'ready'
              : 'waiting_for_sample',
        {
          source: 'card',
          lastSampleReceivedAtMs: latestSample.value?.received_at_ms ?? null,
        },
      ),
    )
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (freshnessClock !== null) window.clearInterval(freshnessClock)
  if (subscribed) gateway.unsubscribeMarket(subscribed.accountId, subscribed.symbol)
})
</script>

<template>
  <div class="trade-metrics">
    <div>
      <span>Entry avg</span>
      <strong>{{
        trade.averageEntryPrice ? formatExactDecimal(trade.averageEntryPrice) : '-'
      }}</strong>
    </div>
    <div class="metric-group">
      <span title="Filled quantity and originally requested quantity">Filled / req.</span>
      <div class="metric-values metric-values-stacked">
        <strong :title="`Filled: ${formatExactDecimal(trade.filledQuantity)}`">
          <small>Filled</small><b>{{ formatExactDecimal(trade.filledQuantity) }}</b>
        </strong>
        <strong
          :title="`Requested: ${trade.requestedQuantity ? formatExactDecimal(trade.requestedQuantity) : '-'}`"
        >
          <small>Req.</small
          ><b>{{ trade.requestedQuantity ? formatExactDecimal(trade.requestedQuantity) : '-' }}</b>
        </strong>
      </div>
    </div>
    <div>
      <span title="Trad-managed quantity remaining">Managed rem.</span>
      <strong>{{ formatExactDecimal(trade.remainingQuantity) }}</strong>
    </div>
    <div class="metric-group metric-pnl">
      <span
        title="Trad scope: entry-to-exit realized P&L less attributed fees; live price uses the latest Trad sample"
        >P&amp;L{{ trade.pnlAsset ? ` · ${trade.pnlAsset}` : ' · mixed assets' }}</span
      >
      <div class="metric-values metric-values-stacked">
        <strong
          v-if="unrealized !== null && trade.pnlAsset !== null && !historical"
          :class="totalTone(new Map([[trade.pnlAsset, unrealized]]))"
          :title="`Gross open P&L before fees: ${formatExactDecimal(unrealized)} ${trade.pnlAsset}`"
        >
          <small>Gross open</small><b>{{ formatExactDecimal(unrealized) }}</b>
        </strong>
        <strong
          :class="totalTone(trade.netAfterFees)"
          :title="
            trade.pnlEvidenceComplete
              ? `Realized P&L less attributed fees: ${totals(trade.netAfterFees)}`
              : liveMissing.title
          "
        >
          <small>{{ historical ? 'Final net' : 'Realized net' }}</small
          ><b>{{
            trade.pnlEvidenceComplete ? amount(trade.netAfterFees, trade.pnlAsset) : 'incomplete'
          }}</b>
        </strong>
        <strong
          v-if="liveTradePnl !== null"
          :class="totalTone(new Map([[trade.pnlAsset ?? 'USDC', liveTradePnl]]))"
          :title="
            historical
              ? `Final net: ${formatExactDecimal(liveTradePnl)} ${trade.pnlAsset}`
              : `Realized plus gross open P&L less attributed fees: ${formatExactDecimal(liveTradePnl)} ${trade.pnlAsset}`
          "
        >
          <small>{{ historical ? 'Final' : 'Live net' }}</small
          ><b>{{ formatExactDecimal(liveTradePnl) }}</b>
        </strong>
        <strong v-else :title="liveMissing.title">
          <small>{{ historical ? 'Final' : 'Live net' }}</small
          ><b>{{ liveMissing.label }}</b>
        </strong>
        <p v-if="trade.lifecycle === 'taken_over' && !trade.pnlEvidenceComplete" class="pnl-note">
          Trad stopped managing this trade at Take Over. Without complete attributed exit fills, its
          final P&amp;L cannot be calculated here.
        </p>
        <p
          v-if="!historical && liveTradePnl !== null && stalePriceSeconds !== null"
          class="pnl-note"
          title="P&L uses the last traded price. The feed is connected; no newer trade has arrived."
        >
          Last trade {{ stalePriceSeconds }}s ago
        </p>
      </div>
    </div>
    <div class="metric-group metric-risk">
      <span>Risk · USDC</span>
      <div class="metric-values metric-values-stacked">
        <strong title="Loss amount requested for risk-at-stop sizing">
          <small>Budget</small><b>{{ compactAmount(trade.plannedRisk) }}</b>
        </strong>
        <div class="metric-inline-pair">
          <strong
            :title="
              'Expected loss from the accepted entry plan to its initial stop: ' +
              (trade.initialPlannedLoss ? formatExactDecimal(trade.initialPlannedLoss) : '-')
            "
          >
            <small>{{ trade.chasePriceRisk ? 'Filled' : 'Initial' }}</small
            ><b>{{
              compactAmount(
                trade.chasePriceRisk?.fee_risk?.total_consumed_risk ??
                  trade.chasePriceRisk?.filled_price_risk ??
                  trade.initialPlannedLoss,
              )
            }}</b>
          </strong>
          <strong
            :title="
              'Expected loss from the scoped entry basis to the current stop: ' +
              (trade.currentStopExposure ? formatExactDecimal(trade.currentStopExposure) : '-')
            "
          >
            <small>To SL</small><b>{{ compactAmount(trade.currentStopExposure) }}</b>
          </strong>
        </div>
        <div v-if="trade.chasePriceRisk" class="metric-inline-pair">
          <strong
            :title="`Risk-authorized unfilled Chase remainder: ${formatExactDecimal(trade.chasePriceRisk.permitted_remainder)} ${trade.symbol}`"
          >
            <small>Entry rem.</small
            ><b>{{ formatExactDecimal(trade.chasePriceRisk.permitted_remainder) }}</b>
          </strong>
          <strong
            :class="compareExact(trade.chasePriceRisk.over_budget, '0') > 0 ? 'negative' : ''"
            :title="
              trade.chasePriceRisk.fee_risk
                ? `Confirmed all-in modeled risk above budget; excludes stop slippage: ${formatExactDecimal(trade.chasePriceRisk.over_budget)} USDC`
                : `Confirmed fill price risk above budget; excludes fees and stop slippage: ${formatExactDecimal(trade.chasePriceRisk.over_budget)} USDC`
            "
          >
            <small>Over</small><b>{{ compactAmount(trade.chasePriceRisk.over_budget) }}</b>
          </strong>
        </div>
        <template v-if="trade.chasePriceRisk?.fee_risk">
          <strong
            :title="`Risk-model estimate, not the fee charged (see Fees). Entry fees counted against the risk budget: ${formatExactDecimal(trade.chasePriceRisk.fee_risk.consumed_entry_fees)} USDC; model: ${formatExactDecimal(trade.chasePriceRisk.fee_risk.expected_entry_fees)} USDC; observed variance: ${formatExactDecimal(trade.chasePriceRisk.fee_risk.observed_entry_fee_variance)} USDC`"
          >
            <small>Est. entry fee</small
            ><b>{{ compactAmount(trade.chasePriceRisk.fee_risk.consumed_entry_fees) }}</b>
          </strong>
          <strong
            :title="`Risk-model estimate, not the fee charged (see Fees). Expected fee if the stop closes the filled size: ${formatExactDecimal(trade.chasePriceRisk.fee_risk.expected_filled_exit_fees)} USDC`"
          >
            <small>Est. exit fee at SL</small
            ><b>{{ compactAmount(trade.chasePriceRisk.fee_risk.expected_filled_exit_fees) }}</b>
          </strong>
        </template>
      </div>
    </div>
    <div class="metric-group metric-fees">
      <span
        >Fees{{ feeAsset ? ` · ${feeAsset}` : '' }}
        <em
          v-if="actualFees?.approximateReason"
          class="fee-approx"
          data-testid="trade-fees-approx"
          :title="actualFees.approximateReason"
          >approx.</em
        ></span
      >
      <div v-if="actualFees" class="metric-values metric-values-stacked" data-testid="trade-fees">
        <strong
          :title="`Fees charged on this trade, entry and exit, exchange plus Trad builder: ${totals(actualFees.total)}`"
        >
          <small>Total</small><b>{{ feeAmount(actualFees.total) }}</b>
        </strong>
        <strong :title="legTitle('Entry', actualFees.entry)">
          <small>Entry</small><b>{{ legAmount(actualFees.entry) }}</b>
        </strong>
        <strong :title="legTitle('Exit', actualFees.exit)">
          <small>Exit</small><b>{{ legAmount(actualFees.exit) }}</b>
        </strong>
      </div>
      <div v-else class="metric-values metric-values-stacked">
        <strong :title="`Exchange fee: ${totals(exchangeFees)}`">
          <small>Exchange</small><b>{{ amount(exchangeFees, feeAsset) }}</b>
        </strong>
        <strong :title="`Trad builder fee: ${totals(trade.builderFees)}`">
          <small>Trad</small><b>{{ amount(trade.builderFees, feeAsset) }}</b>
        </strong>
      </div>
    </div>
    <div>
      <span
        title="The all-in target captured when this trade was accepted. Later admin changes do not rewrite it."
        >Pinned all-in</span
      >
      <strong
        :title="
          trade.pinnedFeeSource
            ? `Source: ${trade.pinnedFeeSource} · policy v${trade.pinnedFeePolicyVersion}`
            : ''
        "
        >{{ pinnedAllIn }}</strong
      >
    </div>
  </div>

  <div class="protection-strip" :class="{ unprotected: !trade.protection }">
    <ShieldCheck :size="13" />
    <template v-if="trade.protection">
      <span>
        SL {{ stop ? formatExactDecimal(stop.trigger_price) : 'none' }} ·
        {{ takeProfits.length }} TP{{ takeProfits.length === 1 ? '' : 's' }} ·
        {{ formatExactDecimal(trade.protection.covered_quantity) }} /
        {{ formatExactDecimal(trade.protection.target_quantity) }} covered
      </span>
      <span class="protection-state">{{ trade.protection.status }}</span>
    </template>
    <span v-else>No attached protection is currently projected</span>
  </div>
  <div v-if="trade.protection" class="protection-legs">
    <div v-for="child in trade.protection.plan.children" :key="child.child_id">
      <span class="leg-kind" :class="child.protection_kind === 'stop_loss' ? 'stop' : 'take'">
        {{ child.protection_kind === 'stop_loss' ? 'SL' : 'TP' }}
      </span>
      <strong>{{ formatExactDecimal(child.trigger_price) }}</strong>
      <span class="leg-size">
        {{
          formatExactDecimal(trade.protection.children[child.child_id]?.confirmed_quantity ?? '0')
        }}
        working
        <template
          v-if="
            trade.protection.children[child.child_id]?.pending_target_quantity &&
            trade.protection.children[child.child_id]?.pending_target_quantity !==
              trade.protection.children[child.child_id]?.confirmed_quantity
          "
        >
          · resizing to
          {{
            formatExactDecimal(
              trade.protection.children[child.child_id]?.pending_target_quantity ?? '0',
            )
          }}
        </template>
        <template
          v-else-if="
            trade.protection.children[child.child_id]?.target_quantity !==
            trade.protection.children[child.child_id]?.confirmed_quantity
          "
        >
          · desired
          {{
            formatExactDecimal(trade.protection.children[child.child_id]?.target_quantity ?? '0')
          }}
        </template>
      </span>
      <span class="leg-state">
        {{ childState(trade.protection.children[child.child_id]) }}
      </span>
      <button
        class="btn btn-xs move-leg"
        type="button"
        :disabled="trade.protection.status !== 'tracking'"
        :title="`Move this ${child.protection_kind === 'stop_loss' ? 'stop loss' : 'take profit'}`"
        @click="emit('move-protection', child.child_id)"
      >
        move
      </button>
    </div>
  </div>
</template>

<style scoped>
.trade-metrics {
  display: grid;
  grid-template-columns: 0.75fr 1.1fr 0.85fr 1.25fr 1.35fr 1.4fr 0.6fr;
  gap: 1px;
  background: var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.trade-metrics > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.45rem 0.6rem;
  background: var(--surface-sunken);
}
.trade-metrics span {
  color: var(--fg-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.trade-metrics strong {
  overflow: hidden;
  color: var(--fg-strong);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-values {
  display: grid;
  min-width: 0;
  gap: 0.5rem;
}
.metric-values-stacked {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}
.metric-values strong {
  display: grid;
  grid-template-columns: minmax(2.6rem, auto) minmax(0, 1fr);
  min-width: 0;
  gap: 0.4rem;
  align-items: baseline;
  font-size: 11px;
  line-height: 1.15;
}
.metric-values small {
  flex: none;
  color: var(--fg-muted);
  font-size: 9px;
  font-weight: 400;
  text-transform: uppercase;
}
.metric-values b {
  overflow: hidden;
  min-width: 0;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pnl-note {
  margin: 0.25rem 0 0;
  color: var(--fg-muted);
  font-size: 10px;
  line-height: 1.35;
}
.fee-approx {
  color: var(--state-warning);
  font-size: 9px;
  font-style: normal;
  cursor: help;
}
.metric-inline-pair {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.metric-inline-pair strong {
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.25rem;
}
.positive {
  color: var(--state-success) !important;
}
.negative {
  color: var(--state-error) !important;
}
.protection-strip {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--border-subtle);
}
.protection-strip svg {
  color: var(--state-success);
}
.protection-strip.unprotected,
.protection-strip.unprotected svg {
  color: var(--state-warning);
}
.protection-state {
  margin-left: auto;
  font-size: 10px;
  text-transform: uppercase;
}
.protection-legs {
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
}
.protection-legs > div {
  display: grid;
  min-height: 28px;
  grid-template-columns: 32px minmax(80px, auto) minmax(90px, 1fr) auto auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0.75rem;
  border-top: 1px solid var(--border-subtle);
  color: var(--fg-muted);
  font-size: 11px;
}
.move-leg {
  min-width: 44px;
}
.protection-legs strong {
  color: var(--fg);
  font-weight: 500;
}
.leg-kind {
  padding: 0.1rem 0.25rem;
  text-align: center;
  border-radius: 2px;
}
.leg-kind.stop {
  color: var(--state-error);
  background: color-mix(in srgb, var(--state-error) 18%, transparent);
}
.leg-kind.take {
  color: var(--state-success);
  background: color-mix(in srgb, var(--state-success) 18%, transparent);
}
.leg-state {
  text-transform: uppercase;
  font-size: 9px;
}
@media (max-width: 1180px) {
  .trade-metrics {
    grid-template-columns: repeat(3, minmax(105px, 1fr));
  }
}
@media (max-width: 760px) {
  .trade-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .trade-metrics strong {
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }
  .trade-metrics > div {
    gap: 0.08rem;
    padding: 0.38rem 0.45rem;
  }
  .trade-metrics span {
    font-size: 8px;
  }
  .trade-metrics strong {
    font-size: 11px;
    line-height: 1.2;
  }
  .protection-strip {
    min-height: 27px;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.45rem;
    font-size: 10px;
  }
  .protection-state {
    margin-left: 0;
  }
  .protection-legs > div {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    min-height: 24px;
    padding: 0.18rem 0.45rem;
  }
  .leg-state {
    grid-column: 2;
  }
  .move-leg {
    grid-column: 3;
  }
}
</style>
