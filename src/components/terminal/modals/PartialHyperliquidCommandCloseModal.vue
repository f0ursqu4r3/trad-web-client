<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import type { MarketContext, PositionSide } from '@/lib/ws/protocol'
import { NetworkType } from '@/lib/ws/protocol'
import { marketContextAccountId } from '@/lib/marketContext'
import { formatQty } from '@/components/terminal/devices/utils'

const props = defineProps<{
  open: boolean
  commandId: string
  symbol: string
  marketContext: MarketContext
  positionSide: PositionSide
  ownedQuantity: number
  protectionCount: number
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (
    event: 'submit',
    data: { quantity: number; expectedOwnedQuantity: number; fullClose: boolean },
  ): void
}>()

const accounts = useAccountsStore()
const ws = useWsStore()
const quantity = ref(0)
const sizeDecimals = ref<number | null>(null)
const rulesError = ref<string | null>(null)
const submitting = ref(false)
let abort: AbortController | null = null

const account = computed(
  () =>
    accounts.accounts.find((item) => item.id === marketContextAccountId(props.marketContext)) ??
    null,
)
const step = computed(() => (sizeDecimals.value == null ? null : 1 / 10 ** sizeDecimals.value))
const normalizedQuantity = computed(() => {
  if (step.value == null || !Number.isFinite(quantity.value) || quantity.value <= 0) return 0
  const units = Math.floor(quantity.value / step.value + 1e-9)
  return Number((units * step.value).toFixed(sizeDecimals.value ?? 0))
})
const ownedUnits = computed(() => {
  if (step.value == null) return 0
  return Math.round(props.ownedQuantity / step.value)
})
const closeUnits = computed(() => {
  if (step.value == null) return 0
  return Math.round(normalizedQuantity.value / step.value)
})
const fullClose = computed(() => ownedUnits.value > 0 && closeUnits.value >= ownedUnits.value)
const remainingQuantity = computed(() =>
  fullClose.value ? 0 : Math.max(0, props.ownedQuantity - normalizedQuantity.value),
)
const ownership = computed(() => ws.hyperliquidOwnershipForMarketContext(props.marketContext))
const symbolOwnership = computed(
  () =>
    ownership.value?.symbols.find(
      (item) => item.symbol.toUpperCase() === props.symbol.toUpperCase(),
    ) ?? null,
)
const validationError = computed(() => {
  if (rulesError.value) return rulesError.value
  if (sizeDecimals.value == null) return 'Loading Hyperliquid size rules.'
  if (normalizedQuantity.value <= 0) {
    return `Close quantity must be at least one size step (${formatQty(step.value ?? 0)}).`
  }
  if (closeUnits.value > ownedUnits.value) {
    return `Close quantity exceeds this command's owned ${formatQty(props.ownedQuantity)}.`
  }
  if (
    !fullClose.value &&
    props.protectionCount > 0 &&
    remainingQuantity.value < (step.value ?? 0)
  ) {
    return 'The protected remainder is below one exchange size step.'
  }
  return null
})
const canSubmit = computed(() => !validationError.value && !submitting.value)

function choosePercent(percent: number) {
  quantity.value = props.ownedQuantity * percent
}

async function loadSizeRules() {
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  sizeDecimals.value = null
  rulesError.value = null
  try {
    const endpoint =
      account.value?.network === NetworkType.Testnet
        ? 'https://api.hyperliquid-testnet.xyz/info'
        : 'https://api.hyperliquid.xyz/info'
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as {
      universe?: Array<{ name?: string; szDecimals?: number }>
    }
    const asset = body.universe?.find(
      (item) => item.name?.toUpperCase() === props.symbol.toUpperCase(),
    )
    if (!asset || !Number.isInteger(asset.szDecimals) || (asset.szDecimals ?? -1) < 0) {
      throw new Error(`size rules unavailable for ${props.symbol}`)
    }
    sizeDecimals.value = asset.szDecimals ?? null
  } catch (error) {
    if (!controller.signal.aborted) {
      rulesError.value = error instanceof Error ? error.message : String(error)
    }
  }
}

function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  emit('submit', {
    quantity: normalizedQuantity.value,
    expectedOwnedQuantity: props.ownedQuantity,
    fullClose: fullClose.value,
  })
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    quantity.value = props.ownedQuantity * 0.25
    submitting.value = false
    ws.requestHyperliquidPositionOwnership(props.marketContext, props.symbol)
    void loadSizeRules()
  },
  { immediate: true },
)

onBeforeUnmount(() => abort?.abort())
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[450] bg-black/40 flex items-start justify-center pt-[8vh]"
      @click.self="emit('close')"
    >
      <section
        class="w-[min(560px,92vw)] bg-[var(--panel-bg)] border border-[var(--border-color)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Partially close Hyperliquid command"
      >
        <header class="flex items-center justify-between p-3 border-b border-[var(--border-color)]">
          <div>
            <div class="text-[11px] uppercase text-[var(--accent-color)]">
              Close Command Exposure
            </div>
            <div class="text-[11px] font-mono text-[var(--color-text-dim)] mt-1">
              {{ symbol }} · {{ positionSide }} · {{ formatQty(ownedQuantity) }} command-owned
            </div>
          </div>
          <button class="btn btn-sm" type="button" @click="emit('close')">close</button>
        </header>

        <div class="p-4 space-y-4 text-[12px]">
          <div class="grid grid-cols-4 gap-2" role="group" aria-label="Close percentage">
            <button
              v-for="percent in [0.25, 0.5, 0.75, 1]"
              :key="percent"
              class="btn btn-sm"
              type="button"
              @click="choosePercent(percent)"
            >
              {{ percent * 100 }}%
            </button>
          </div>

          <label class="space-y-1 block">
            <span class="text-[10px] uppercase text-[var(--color-text-dim)]">Exact Quantity</span>
            <input
              v-model.number="quantity"
              class="input w-full font-mono"
              type="number"
              step="any"
            />
          </label>

          <div
            class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-y border-[var(--border-color)] py-3 font-mono"
          >
            <span class="text-[var(--color-text-dim)]">Exchange size step</span>
            <span>{{ step == null ? 'loading' : formatQty(step) }}</span>
            <span class="text-[var(--color-text-dim)]">Normalized reduce-only close</span>
            <span>{{ formatQty(normalizedQuantity) }}</span>
            <span class="text-[var(--color-text-dim)]">Command remainder</span>
            <span>{{ formatQty(remainingQuantity) }}</span>
            <span class="text-[var(--color-text-dim)]">Protection plan</span>
            <span class="text-right">
              {{
                fullClose
                  ? 'cancel exact owned TP/SL after flat'
                  : protectionCount
                    ? `atomically resize ${protectionCount} protection group(s)`
                    : 'no attached protection'
              }}
            </span>
            <template v-if="symbolOwnership">
              <span class="text-[var(--color-text-dim)]">Live symbol position</span>
              <span>{{ formatQty(Math.abs(symbolOwnership.live_signed_quantity)) }}</span>
              <span class="text-[var(--color-text-dim)]">All Trad-owned on side</span>
              <span>{{ formatQty(symbolOwnership.owned_same_side_quantity) }}</span>
              <span class="text-[var(--color-text-dim)]">External / unresolved</span>
              <span>
                {{ formatQty(symbolOwnership.external_same_side_quantity) }} /
                {{ formatQty(symbolOwnership.unresolved_deficit_quantity) }}
              </span>
            </template>
          </div>

          <p v-if="validationError" class="m-0 text-[var(--color-error)]">{{ validationError }}</p>
          <p class="m-0 text-[var(--color-text-dim)]">
            Trad cancels and confirms any working entry first, revalidates command ownership, then
            submits an exact reduce-only close. Protection is resized to the actual filled
            remainder, including partial fills.
          </p>
        </div>

        <footer class="flex justify-end gap-2 p-3 border-t border-[var(--border-color)]">
          <button class="btn btn-sm" type="button" @click="emit('close')">cancel</button>
          <button
            class="btn btn-sm btn-primary"
            type="button"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ fullClose ? 'close position' : 'close part' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
