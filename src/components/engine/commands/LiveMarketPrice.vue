<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'
import { formatExactDecimal } from '@/lib/exactDecimalMath'
import { loadMarketSymbols } from '@/lib/marketCatalog'
import {
  marketSymbolDecision,
  type MarketCatalogState,
} from '@/lib/gateway/marketSubscriptionPolicy'

const props = defineProps<{
  active: boolean
  accountId: string
  symbol: string
  quoteAsset?: string | null
}>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const markets = useMarketStore()
const now = ref(Date.now())
let held: { accountId: string; symbol: string } | null = null
let clock: number | null = null

// `symbol` is the ticket's selected market: the market picker changes it only
// when the trader selects a market, never while typing. It reaches the gateway
// only when the account's catalog lists it: asking the exchange for an
// unknown coin drops every price feed on the shared connection.
const symbol = computed(() => props.symbol.trim().toUpperCase())
const account = computed(
  () => accounts.accounts.find((candidate) => candidate.id === props.accountId) ?? null,
)
const catalog = ref<MarketCatalogState>({ status: 'loading' })
const decision = computed(() => marketSymbolDecision(symbol.value, catalog.value))

const stream = computed(() => markets.stream(props.accountId || null, symbol.value || null))
const latest = computed(() => {
  const samples = stream.value?.samples ?? []
  return samples.length === 0 ? null : samples[samples.length - 1]!
})
const ageSeconds = computed(() => {
  if (latest.value === null) return null
  return Math.max(0, Math.floor((now.value - latest.value.received_at_ms) / 1_000))
})
const formattedPrice = computed(() => {
  if (decision.value !== 'subscribe' || stream.value?.status !== 'ready') return null
  const exactPrice = latest.value?.price
  const price = Number(exactPrice)
  if (!Number.isFinite(price) || price <= 0) return null
  return formatExactDecimal(exactPrice!)
})
const status = computed(() => {
  if (!props.active || props.accountId === '' || symbol.value === '') return 'idle'
  if (decision.value === 'wait') return 'subscribing'
  if (decision.value === 'unknown' || stream.value?.unknownMarket) return 'unknown'
  return stream.value?.status ?? 'subscribing'
})
const freshness = computed(() => {
  const age = ageSeconds.value
  if (age === null) return ''
  if (age < 60) return age + 's ago'
  return Math.floor(age / 60) + 'm ago'
})

// Keyed by exchange and network so an accounts refresh does not drop and
// re-request the held market.
watch(
  catalogDomain,
  async (domain) => {
    const current = account.value
    if (domain === null || current === null) {
      catalog.value = { status: 'unavailable' }
      return
    }
    catalog.value = { status: 'loading' }
    try {
      const symbols = await loadMarketSymbols(current)
      if (catalogDomain() === domain) catalog.value = { status: 'ready', symbols }
    } catch {
      if (catalogDomain() === domain) catalog.value = { status: 'unavailable' }
    }
  },
  { immediate: true },
)

function catalogDomain(): string | null {
  return account.value === null ? null : `${account.value.exchange}:${account.value.network}`
}

watch(
  () => [props.active, props.accountId, symbol.value, decision.value] as const,
  ([active, accountId, next, current]) => {
    const wanted = active && accountId !== '' && current === 'subscribe'
    if (wanted && held?.accountId === accountId && held.symbol === next) return
    release()
    if (!wanted) return
    gateway.subscribeMarket(accountId, next)
    held = { accountId, symbol: next }
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
    v-if="status !== 'idle'"
    class="market-price"
    :class="{
      stale: formattedPrice !== null && ageSeconds !== null && ageSeconds >= 10,
      failed: status === 'error' || status === 'unknown',
    }"
    title="Latest exchange trade from Trad's shared market stream. Execution preview uses the current executable bid or ask."
  >
    <template v-if="formattedPrice">
      <span class="price-value">{{ formattedPrice }}</span>
      <span v-if="freshness" class="freshness">· {{ freshness }}</span>
    </template>
    <template v-else-if="status === 'unknown'"> Unknown market </template>
    <template v-else-if="status === 'error'"> Price unavailable </template>
    <template v-else-if="status === 'reconnecting'"> Price feed reconnecting… </template>
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

.price-value {
  min-width: 0;
  white-space: nowrap;
}

.freshness {
  flex: 0 0 auto;
  color: var(--color-text-dim);
  white-space: nowrap;
}

.market-price.stale .freshness {
  color: var(--color-warning);
}

.market-price.failed {
  color: var(--color-error);
}
</style>
