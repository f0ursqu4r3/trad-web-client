<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'

import {
  addExact,
  compareExact,
  formatExactDecimal,
  multiplyExact,
  subtractExact,
} from '@/lib/exactDecimalMath'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import type { NativeProtectionChildProjection } from '@/lib/gateway'
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
const latestPrice = computed(() => {
  const samples = market.value?.samples ?? []
  return samples[samples.length - 1]?.price ?? null
})
let subscribedAccountId: string | null = null
const unrealized = computed(() => {
  if (latestPrice.value === null || props.trade.averageEntryPrice === null) return null
  const change =
    props.trade.side === 'long'
      ? subtractExact(latestPrice.value, props.trade.averageEntryPrice)
      : subtractExact(props.trade.averageEntryPrice, latestPrice.value)
  return multiplyExact(change, props.trade.remainingQuantity)
})
const liveTradePnl = computed(() => {
  const realized = props.trade.realizedPnl.get('USDC') ?? '0'
  const fees = props.trade.totalFees.get('USDC') ?? '0'
  return unrealized.value === null
    ? null
    : subtractExact(addExact(realized, unrealized.value), fees)
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

onMounted(() => {
  subscribedAccountId = accountId.value
  if (subscribedAccountId) gateway.subscribeMarket(subscribedAccountId, props.trade.symbol, 64)
})
onBeforeUnmount(() => {
  if (subscribedAccountId) gateway.unsubscribeMarket(subscribedAccountId, props.trade.symbol)
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
    <div>
      <span>Filled / requested</span>
      <strong>
        {{ formatExactDecimal(trade.filledQuantity) }} /
        {{ trade.requestedQuantity ? formatExactDecimal(trade.requestedQuantity) : '-' }}
      </strong>
    </div>
    <div>
      <span>Managed remainder</span>
      <strong>{{ formatExactDecimal(trade.remainingQuantity) }}</strong>
    </div>
    <div>
      <span title="Estimate from the latest Trad market sample and this trade's scoped entry basis."
        >Live trade P&amp;L est.</span
      >
      <strong v-if="liveTradePnl !== null" :class="totalTone(new Map([['USDC', liveTradePnl]]))">
        {{ formatExactDecimal(liveTradePnl) }} USDC
      </strong>
      <strong v-else>-</strong>
    </div>
    <div>
      <span title="Scoped exits measured against this trade's own weighted entry basis."
        >Scoped realized</span
      >
      <strong :class="totalTone(trade.realizedPnl)">{{ totals(trade.realizedPnl) }}</strong>
    </div>
    <div>
      <span title="Scoped realized P&amp;L after every fee attributed to this trade."
        >Realized net</span
      >
      <strong :class="totalTone(trade.netAfterFees)">{{ totals(trade.netAfterFees) }}</strong>
    </div>
    <div>
      <span title="The loss amount requested when this trade used risk-at-stop sizing."
        >Risk budget</span
      >
      <strong>{{ trade.plannedRisk ? formatExactDecimal(trade.plannedRisk) : '-' }}</strong>
    </div>
    <div>
      <span title="Expected loss from the normalized accepted entry plan to its initial stop."
        >Initial planned loss</span
      >
      <strong>{{
        trade.initialPlannedLoss ? `${formatExactDecimal(trade.initialPlannedLoss)} USDC` : '-'
      }}</strong>
    </div>
    <div>
      <span
        title="Expected loss from the scoped entry basis to the current stop for the managed remainder."
        >Current risk to stop</span
      >
      <strong>{{
        trade.currentStopExposure ? `${formatExactDecimal(trade.currentStopExposure)} USDC` : '-'
      }}</strong>
    </div>
    <div>
      <span title="Hyperliquid reports a total fee that already includes Trad's builder component."
        >Exchange · Trad fees</span
      >
      <strong>{{ totals(exchangeFees) }} · {{ totals(trade.builderFees) }}</strong>
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
        size
        {{ formatExactDecimal(trade.protection.children[child.child_id]?.target_quantity ?? '0') }}
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
  grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
  gap: 1px;
  background: var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.trade-metrics > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.18rem;
  padding: 0.65rem 0.7rem;
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
