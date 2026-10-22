<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import ExecutionPreviewPanel from '@/components/engine/commands/ExecutionPreviewPanel.vue'
import type { BrowserPreviewIntent } from '@/lib/gateway'
import {
  formatExecutionGuardPercent,
  resolveHyperliquidExecutionGuards,
} from '@/lib/hyperliquidExecutionGuards'
import type { AccountRecord } from '@/stores/accounts'
import { useMarketInstrument } from '@/composables/useMarketInstrument'
import { loadHyperliquidFeeTier } from '@/lib/engineCommands/hyperliquidFeeTier'
import {
  aboveTargetNote,
  marketFees,
  venueSymbolFallback,
  type AccountFeeTier,
} from '@/lib/hyperliquidMarkets'

const props = defineProps<{
  account: AccountRecord | null
  accountId: string
  intent: BrowserPreviewIntent | null
  symbol?: string
  quoteAsset: string | null
  actionAttemptId?: string | null
}>()
const emit = defineEmits<{
  (event: 'ready', value: boolean): void
  (event: 'status', value: 'idle' | 'planning' | 'ready' | 'rejected'): void
}>()

const target = computed(() => props.account?.exchange_metadata?.builder_target_total_tenths_bps)
const approval = computed(() => props.account?.exchange_metadata?.max_builder_fee_tenths_bps)
const entryGuard = computed(
  () => resolveHyperliquidExecutionGuards(props.account?.exchange_metadata).entry_market_tenths_bps,
)

// The selected market's exchange fees: the account's Hyperliquid tier rates
// times the market's multipliers (HIP-3 dexes such as xyz charge more), and
// the builder fee left under the all-in target.
const instrument = useMarketInstrument(
  () => props.account,
  () => props.symbol ?? '',
)
const tier = ref<AccountFeeTier | null>(null)
let tierGeneration = 0
watch(
  () => {
    const metadata = props.account?.exchange_metadata
    if (props.account?.exchange !== 'hyperliquid') return null
    const user = metadata?.vault_address || metadata?.user_address
    return user ? `${props.account.network}|${user}` : null
  },
  async (key) => {
    const generation = ++tierGeneration
    tier.value = null
    if (key === null) return
    const [network, user] = key.split('|') as [string, string]
    try {
      const loaded = await loadHyperliquidFeeTier({ network, user })
      if (generation === tierGeneration) tier.value = loaded
    } catch {
      // Fee display is advisory; the preview carries the planned rates.
    }
  },
  { immediate: true },
)
const venueSymbol = computed(
  () => instrument.value?.venueSymbol ?? venueSymbolFallback((props.symbol ?? '').toUpperCase()),
)
const fees = computed(() =>
  // Wait for the market's catalog row: its multipliers set the rate.
  tier.value === null || instrument.value === null
    ? null
    : marketFees(tier.value, instrument.value?.hyperliquid ?? null, target.value, approval.value),
)
const feeNote = computed(() =>
  fees.value === null ? null : aboveTargetNote(venueSymbol.value, fees.value, target.value),
)

function rateLabel(taker: number, maker: number): string {
  return `taker ${taker.toFixed(1)} · maker ${maker.toFixed(1)} bps`
}

function bps(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Server policy' : `${(value / 10).toFixed(1)} bps`
}
</script>

<template>
  <section class="ticket-policy">
    <div class="policy-grid">
      <span>Entry market guard</span>
      <strong>{{ formatExecutionGuardPercent(entryGuard) }}</strong>
      <span>Current all-in target / side</span>
      <strong>{{ bps(target) }}</strong>
      <span>Venue + builder split</span>
      <strong>Live fee tier, by order role</strong>
      <span>Wallet approval ceiling</span>
      <strong>{{ bps(approval) }}</strong>
      <template v-if="fees">
        <span>{{ venueSymbol }} exchange fee</span>
        <strong data-testid="market-exchange-fee">{{
          rateLabel(fees.takerBps, fees.makerBps)
        }}</strong>
        <span>Trad builder fee</span>
        <strong data-testid="market-builder-fee">{{
          rateLabel(fees.takerBuilderBps, fees.makerBuilderBps)
        }}</strong>
      </template>
    </div>
    <p v-if="feeNote" class="fee-note" data-testid="market-fee-note">{{ feeNote }}</p>
    <p>
      Trad targets the configured all-in cost. The exchange fee is charged first; only the remainder
      is sent to the Trad builder, never above the wallet-approved ceiling. Take profits, Chase and
      resting limits use the maker rate; stops, market orders and limits that cross the book use the
      taker rate.
    </p>
  </section>

  <ExecutionPreviewPanel
    compact
    :account-id="accountId"
    :intent="intent"
    :active="true"
    :quote-asset="quoteAsset"
    :action-attempt-id="actionAttemptId"
    @update:ready="emit('ready', $event)"
    @update:status="emit('status', $event)"
  />
</template>

<style scoped>
.ticket-policy {
  padding: 0.7rem;
  border: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
}
.policy-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.28rem 0.75rem;
}
.policy-grid span {
  color: var(--fg-muted);
  font-size: 10px;
}
.policy-grid strong {
  color: var(--fg);
  font-size: 10px;
  font-weight: 500;
  text-align: right;
}
.ticket-policy .fee-note {
  color: var(--fg);
}
.ticket-policy p {
  margin: 0.6rem 0 0;
  color: var(--fg-muted);
  font-size: 10px;
  line-height: 1.45;
}
</style>
