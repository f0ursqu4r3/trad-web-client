<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { NativeProtectionState } from '@/stores/devices'
import { useAccountsStore } from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import { NetworkType, PositionSide } from '@/lib/ws/protocol'
import type { TakeProfitLadder } from '@/lib/ws/protocol'
import { normalizeMarketContext } from '@/lib/marketContext'
import { formatPrice, formatQty } from '@/components/terminal/devices/utils'
import TakeProfitLadderEditor from '@/components/terminal/modals/commands/TakeProfitLadderEditor.vue'

const props = defineProps<{
  open: boolean
  deviceId: string
  device: NativeProtectionState
}>()

const emit = defineEmits<{ (event: 'close'): void }>()
const accounts = useAccountsStore()
const ws = useWsStore()
const takeProfit = ref<number | null>(null)
const takeProfitLadder = ref<TakeProfitLadder | null>(null)
const takeProfitLadderValid = ref(true)
const stopLoss = ref<number | null>(null)
const marketPrice = ref<number | null>(null)
const marketError = ref<string | null>(null)
const submitting = ref(false)
let abort: AbortController | null = null

function copyTakeProfitLadder(ladder: TakeProfitLadder): TakeProfitLadder {
  return {
    version: ladder.version,
    legs: ladder.legs.map((leg) => ({
      leg_id: leg.leg_id,
      trigger_price: leg.trigger_price,
      allocation: { ...leg.allocation },
    })),
  }
}

const accountId = computed(() => {
  const context = normalizeMarketContext(props.device.market_context)
  return context.type === 'hyperliquid' ? context.account_id : null
})
const account = computed(
  () => accounts.accounts.find((item) => item.id === accountId.value) ?? null,
)
const unsupportedStructureChange = computed(
  () =>
    (props.device.take_profit == null) !== (takeProfit.value == null) ||
    (props.device.take_profit_ladder == null) !== (takeProfitLadder.value == null) ||
    (props.device.stop_loss == null) !== (stopLoss.value == null),
)
const directionError = computed(() => {
  const price = marketPrice.value
  if (!price) return null
  if (props.device.position_side === PositionSide.Long) {
    if (takeProfit.value != null && takeProfit.value <= price) {
      return `Long take profit must be above current mid $${formatPrice(price)}.`
    }
    if (stopLoss.value != null && stopLoss.value >= price) {
      return `Long stop loss must be below current mid $${formatPrice(price)}.`
    }
    if (takeProfitLadder.value?.legs.some((leg) => leg.trigger_price <= price)) {
      return `Long take-profit levels must be above current mid $${formatPrice(price)}.`
    }
  } else {
    if (takeProfit.value != null && takeProfit.value >= price) {
      return `Short take profit must be below current mid $${formatPrice(price)}.`
    }
    if (stopLoss.value != null && stopLoss.value <= price) {
      return `Short stop loss must be above current mid $${formatPrice(price)}.`
    }
    if (takeProfitLadder.value?.legs.some((leg) => leg.trigger_price >= price)) {
      return `Short take-profit levels must be below current mid $${formatPrice(price)}.`
    }
  }
  return null
})
const changed = computed(
  () =>
    takeProfit.value !== props.device.take_profit ||
    JSON.stringify(takeProfitLadder.value) !== JSON.stringify(props.device.take_profit_ladder) ||
    stopLoss.value !== props.device.stop_loss,
)
const canSubmit = computed(
  () =>
    changed.value &&
    !unsupportedStructureChange.value &&
    takeProfitLadderValid.value &&
    !directionError.value &&
    marketPrice.value !== null &&
    !submitting.value,
)

async function loadMarketPrice() {
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  marketPrice.value = null
  marketError.value = null
  try {
    const endpoint =
      account.value?.network === NetworkType.Testnet
        ? 'https://api.hyperliquid-testnet.xyz/info'
        : 'https://api.hyperliquid.xyz/info'
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as Record<string, string | undefined>
    const price = Number(body[props.device.symbol.toUpperCase()])
    if (!Number.isFinite(price) || price <= 0) throw new Error('mid price unavailable')
    marketPrice.value = price
  } catch (error) {
    if (!controller.signal.aborted) {
      marketError.value = error instanceof Error ? error.message : String(error)
    }
  }
}

function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  ws.sendEditHyperliquidProtection(
    props.deviceId,
    takeProfit.value,
    stopLoss.value,
    takeProfitLadder.value,
  )
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    takeProfit.value = props.device.take_profit
    takeProfitLadder.value = props.device.take_profit_ladder
      ? copyTakeProfitLadder(props.device.take_profit_ladder)
      : null
    takeProfitLadderValid.value = true
    stopLoss.value = props.device.stop_loss
    submitting.value = false
    void loadMarketPrice()
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
        class="w-[min(520px,92vw)] bg-[var(--panel-bg)] border border-[var(--border-color)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Edit Hyperliquid protection"
      >
        <header class="flex items-center justify-between p-3 border-b border-[var(--border-color)]">
          <div>
            <div class="text-[11px] uppercase text-[var(--accent-color)]">Edit Protection</div>
            <div class="text-[11px] font-mono text-[var(--color-text-dim)] mt-1">
              {{ device.symbol }} · {{ device.position_side }} ·
              {{ formatQty(device.owned_remaining_qty) }} protected
            </div>
          </div>
          <button class="btn btn-sm" type="button" @click="emit('close')">close</button>
        </header>

        <div class="p-4 space-y-4 text-[12px]">
          <div class="grid grid-cols-2 gap-3">
            <label v-if="device.take_profit_ladder == null" class="space-y-1">
              <span class="text-[10px] uppercase text-[var(--color-text-dim)]">Take Profit</span>
              <input
                v-model.number="takeProfit"
                class="input w-full font-mono"
                type="number"
                step="any"
                :disabled="device.take_profit == null"
              />
            </label>
            <label class="space-y-1">
              <span class="text-[10px] uppercase text-[var(--color-text-dim)]">Stop Loss</span>
              <input
                v-model.number="stopLoss"
                class="input w-full font-mono"
                type="number"
                step="any"
                :disabled="device.stop_loss == null"
              />
            </label>
          </div>
          <TakeProfitLadderEditor
            v-if="device.take_profit_ladder"
            v-model="takeProfitLadder"
            @validity="takeProfitLadderValid = $event"
          />

          <div class="border-y border-[var(--border-color)] py-3 space-y-1 font-mono">
            <div>
              Current mid:
              <span v-if="marketPrice">${{ formatPrice(marketPrice) }}</span>
              <span v-else-if="marketError" class="text-[var(--color-error)]">
                unavailable ({{ marketError }})
              </span>
              <span v-else>loading</span>
            </div>
            <div>
              Existing legs: atomic batch modify by exact CLOID. Added/removed legs: staged and
              verified while the stop remains active.
            </div>
            <div>Stop coverage remains active for the full owned quantity.</div>
          </div>

          <p v-if="directionError" class="m-0 text-[var(--color-error)]">{{ directionError }}</p>
          <p v-if="unsupportedStructureChange" class="m-0 text-[var(--color-error)]">
            Converting between single-TP, TP-ladder, or missing-leg modes is not available here.
          </p>
          <p
            v-if="device.take_profit == null || device.stop_loss == null"
            class="m-0 text-[var(--color-text-dim)]"
          >
            Missing protection legs cannot be added by this edit path.
          </p>

          <p class="m-0 text-[var(--color-text-dim)]">
            Apply protection updates the exact exchange-owned trigger orders for this command. A
            mixed exchange outcome blocks further opens until reconciliation.
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
            apply protection
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
