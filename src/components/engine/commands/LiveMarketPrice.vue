<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'

const props = defineProps<{
  active: boolean
  accountId: string
  symbol: string
  quoteAsset?: string | null
}>()

const gateway = useGatewayStore()
const markets = useMarketStore()
const now = ref(Date.now())
let held: { accountId: string; symbol: string } | null = null
let clock: number | null = null

const normalizedSymbol = computed(() => props.symbol.trim().toUpperCase())
const stream = computed(() =>
  markets.stream(props.accountId || null, normalizedSymbol.value || null),
)
const latest = computed(() => {
  const samples = stream.value?.samples ?? []
  return samples.length === 0 ? null : samples[samples.length - 1]!
})
const ageSeconds = computed(() => {
  if (latest.value === null) return null
  return Math.max(0, Math.floor((now.value - latest.value.received_at_ms) / 1_000))
})
const formattedPrice = computed(() => {
  const price = Number(latest.value?.price)
  if (!Number.isFinite(price) || price <= 0) return null
  return price.toLocaleString(undefined, { maximumFractionDigits: 8 })
})
const status = computed(() => {
  if (!props.active || props.accountId === '' || normalizedSymbol.value === '') return 'idle'
  return stream.value?.status ?? 'subscribing'
})
const freshness = computed(() => {
  const age = ageSeconds.value
  if (age === null) return ''
  if (age < 2) return 'live'
  if (age < 60) return age + 's ago'
  return Math.floor(age / 60) + 'm ago'
})

watch(
  () => [props.active, props.accountId, normalizedSymbol.value] as const,
  ([active, accountId, symbol]) => {
    release()
    if (!active || accountId === '' || symbol === '') return
    gateway.subscribeMarket(accountId, symbol)
    held = { accountId, symbol }
  },
  { immediate: true },
)

watch(
  () => props.active,
  (active) => {
    if (clock !== null) window.clearInterval(clock)
    clock = active ? window.setInterval(() => (now.value = Date.now()), 1_000) : null
  },
  { immediate: true },
)

function release(): void {
  if (held === null) return
  gateway.unsubscribeMarket(held.accountId, held.symbol)
  held = null
}

onBeforeUnmount(() => {
  release()
  if (clock !== null) window.clearInterval(clock)
})
</script>

<template>
  <span
    class="market-price"
    :class="{ stale: ageSeconds !== null && ageSeconds >= 10, failed: status === 'error' }"
    title="Latest exchange trade from Trad's shared market stream. Execution preview uses the current executable bid or ask."
  >
    <span class="status-dot" />
    <template v-if="formattedPrice">
      Live trade {{ formattedPrice }} {{ quoteAsset ?? '' }}
      <span v-if="freshness" class="freshness">· {{ freshness }}</span>
    </template>
    <template v-else-if="status === 'error'"> Price unavailable </template>
    <template v-else> Loading live price… </template>
  </span>
</template>

<style scoped>
.market-price {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--color-success);
  font-size: 11px;
  font-weight: 400;
  text-transform: none;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: currentColor;
}

.freshness {
  color: var(--color-text-dim);
}

.market-price.stale {
  color: var(--color-warning);
}

.market-price.failed {
  color: var(--color-error);
}
</style>
