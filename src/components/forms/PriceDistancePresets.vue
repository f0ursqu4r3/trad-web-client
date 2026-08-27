<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { formatExactDecimal } from '@/lib/exactDecimalMath'
import type { PositionSideIntent } from '@/lib/gateway'
import {
  priceDistanceFromReference,
  priceFromReference,
  STOP_PRICE_DISTANCES,
  type PriceDirection,
  type StopPriceDistance,
} from '@/lib/engineCommands/stopPricePresets'
import { loadMarketPriceRule, type MarketPriceRule } from '@/lib/marketCatalog'
import { useAccountsStore } from '@/stores/accounts'
import { useMarketStore } from '@/stores/market'

const props = defineProps<{
  accountId: string
  symbol: string
  positionSide: PositionSideIntent
  purpose: 'stop' | 'take_profit' | 'activation'
}>()
const model = defineModel<string>({ required: true })
const accounts = useAccountsStore()
const markets = useMarketStore()
const now = ref(Date.now())
const priceRule = ref<MarketPriceRule | null>(null)
const ruleLoading = ref(false)
let ruleGeneration = 0
const clock = window.setInterval(() => (now.value = Date.now()), 1_000)

const stream = computed(() =>
  markets.stream(props.accountId || null, props.symbol.trim().toUpperCase() || null),
)
const account = computed(
  () => accounts.accounts.find((item) => item.id === props.accountId) ?? null,
)
const sample = computed(() => {
  const samples = stream.value?.samples ?? []
  return samples.length === 0 ? null : samples[samples.length - 1]!
})
const reference = computed(() => {
  const latest = sample.value
  if (latest === null || now.value - latest.received_at_ms >= 10_000) return null
  return latest.price
})
const directions = computed<PriceDirection[]>(() => {
  if (props.purpose === 'activation') return ['decrease', 'increase']
  const increase =
    props.purpose === 'take_profit'
      ? props.positionSide === 'long'
      : props.positionSide === 'short'
  return [increase ? 'increase' : 'decrease']
})
const currentDistance = computed(() =>
  reference.value === null ? null : priceDistanceFromReference(model.value, reference.value),
)
const available = computed(() => reference.value !== null && priceRule.value !== null)

watch(
  () =>
    [account.value?.exchange, account.value?.network, props.symbol.trim().toUpperCase()] as const,
  async ([exchange, network, symbol]) => {
    const generation = ++ruleGeneration
    priceRule.value = null
    if (!exchange || !network || !symbol) return
    ruleLoading.value = true
    try {
      const loaded = await loadMarketPriceRule({ exchange, network }, symbol)
      if (generation === ruleGeneration) priceRule.value = loaded
    } catch {
      // Presets require venue normalization rules.
    } finally {
      if (generation === ruleGeneration) ruleLoading.value = false
    }
  },
  { immediate: true },
)

function apply(direction: PriceDirection, distance: StopPriceDistance): void {
  if (reference.value === null || priceRule.value === null) return
  model.value = priceFromReference(reference.value, direction, distance, priceRule.value)
}

function sign(direction: PriceDirection): string {
  return direction === 'decrease' ? '−' : '+'
}

onBeforeUnmount(() => window.clearInterval(clock))
</script>

<template>
  <div class="price-distance-presets">
    <div class="preset-heading">
      <span>Price distance from latest trade</span>
      <span v-if="ruleLoading">loading price rules</span>
      <span v-else-if="priceRule === null">price rules unavailable</span>
      <span v-else-if="reference">
        <template v-if="currentDistance">current {{ currentDistance }} · </template>
        <span v-if="directions.length === 1">
          {{ directions[0] === 'decrease' ? 'below' : 'above' }}
          {{ formatExactDecimal(reference) }}
        </span>
        <span v-else>latest {{ formatExactDecimal(reference) }}</span>
      </span>
      <span v-else>waiting for a fresh price</span>
    </div>
    <div class="preset-buttons">
      <template v-for="direction in directions" :key="direction">
        <button
          v-for="distance in STOP_PRICE_DISTANCES"
          :key="`${direction}:${distance}`"
          type="button"
          class="preset-button"
          :disabled="!available"
          :title="`Set ${sign(direction)}${distance}% from the latest exchange trade.`"
          @click="apply(direction, distance)"
        >
          {{ sign(direction) }}{{ distance }}%
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.price-distance-presets {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.preset-heading {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--fg-muted);
  font-size: 9px;
  text-transform: uppercase;
}
.preset-heading span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-buttons {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.25rem;
}
.preset-button {
  min-width: 0;
  min-height: 27px;
  padding: 0.25rem;
  border: 1px solid var(--border-normal);
  color: var(--fg-muted);
  font: inherit;
  font-size: 10px;
  background: var(--surface-sunken);
}
.preset-button:hover:not(:disabled),
.preset-button:focus-visible:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--fg-strong);
  background: var(--surface-active);
}
.preset-button:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
</style>
