<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  ExchangeType,
  MarketAction,
  OrderSide,
  PositionSide,
  type LimitOrderCommand,
  type LimitTimeInForce,
  type MarketContext,
  type OrderQuantityMode,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import {
  accountMetadataChips,
  isHyperliquidMetadataReady,
  useAccountsStore,
} from '@/stores/accounts'
import { createLogger } from '@/lib/utils'
import {
  isValidHyperliquidPerpSymbol,
  normalizeHyperliquidPerpSymbol,
} from '@/lib/bybitOrderValidation'

const logger = createLogger('commands')
const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()
const accounts = useAccountsStore()
const selectedAccountId = ref('')
const lastAccountId = ref('')
const symbol = ref('BTC')
const action = ref<MarketAction>(MarketAction.Open)
const positionSide = ref<PositionSide>(PositionSide.Long)
const quantityMode = ref<OrderQuantityMode>('notional')
const quantity = ref<number | null>(50)
const price = ref<number | null>(null)
const timeInForce = ref<LimitTimeInForce>('gtc')
const takeProfit = ref<number | null>(null)
const stopLoss = ref<number | null>(null)

const selectedMarketContext = computed<MarketContext | null>(() =>
  accounts.getMarketContextForAccount(selectedAccountId.value),
)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const capabilities = computed(() => ws.capabilitiesForMarketContext(selectedMarketContext.value))
const supportsLimitOrders = computed(() => capabilities.value?.supports_limit_orders === true)
const isHyperliquid = computed(() => selectedAccount.value?.exchange === ExchangeType.Hyperliquid)
const supportsAttachedExit = computed(
  () =>
    action.value === MarketAction.Open &&
    capabilities.value?.supports_attached_take_profit_stop_loss === true,
)
const blocksOpeningOrder = computed(
  () =>
    action.value === MarketAction.Open &&
    isHyperliquid.value &&
    (!isHyperliquidMetadataReady(selectedAccount.value) ||
      capabilities.value?.new_open_orders_enabled === false),
)
const derivedSide = computed(() => {
  if (action.value === MarketAction.Open) {
    return positionSide.value === PositionSide.Long ? OrderSide.Buy : OrderSide.Sell
  }
  return positionSide.value === PositionSide.Long ? OrderSide.Sell : OrderSide.Buy
})
const exitLevelError = computed(() => {
  if (!supportsAttachedExit.value || price.value === null || price.value <= 0) return null
  if (
    takeProfit.value !== null &&
    (takeProfit.value <= 0 ||
      (positionSide.value === PositionSide.Long
        ? takeProfit.value <= price.value
        : takeProfit.value >= price.value))
  ) {
    return `${positionSide.value} take profit must be ${positionSide.value === PositionSide.Long ? 'above' : 'below'} the limit price.`
  }
  if (
    stopLoss.value !== null &&
    (stopLoss.value <= 0 ||
      (positionSide.value === PositionSide.Long
        ? stopLoss.value >= price.value
        : stopLoss.value <= price.value))
  ) {
    return `${positionSide.value} stop loss must be ${positionSide.value === PositionSide.Long ? 'below' : 'above'} the limit price.`
  }
  return null
})

function requestCapabilities() {
  if (selectedMarketContext.value) ws.requestMarketCapabilities(selectedMarketContext.value)
}

function reset() {
  selectedAccountId.value = accounts.selectedAccount?.id ?? ''
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  action.value = MarketAction.Open
  positionSide.value = PositionSide.Long
  quantityMode.value = isHyperliquid.value ? 'notional' : 'base'
  quantity.value = isHyperliquid.value ? 50 : 0.001
  price.value = null
  timeInForce.value = 'gtc'
  takeProfit.value = null
  stopLoss.value = null
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
      requestCapabilities()
    }
  },
)

watch(selectedAccountId, (next, previous) => {
  const previousDefault = accounts.getDefaultSymbolForAccount(previous || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === previousDefault) symbol.value = nextDefault
  lastAccountId.value = next
  quantityMode.value = isHyperliquid.value ? 'notional' : 'base'
  requestCapabilities()
})

watch(supportsAttachedExit, (supported) => {
  if (!supported) {
    takeProfit.value = null
    stopLoss.value = null
  }
})

function validate(): boolean {
  if (!supportsLimitOrders.value || !selectedAccountId.value || blocksOpeningOrder.value)
    return false
  if (!symbol.value.trim()) return false
  if (isHyperliquid.value && !isValidHyperliquidPerpSymbol(symbol.value)) return false
  if (quantity.value === null || !Number.isFinite(quantity.value) || quantity.value <= 0)
    return false
  if (price.value === null || !Number.isFinite(price.value) || price.value <= 0) return false
  if (exitLevelError.value) return false
  return true
}

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext || !validate() || quantity.value === null || price.value === null) {
    logger.error('Limit order validation failed')
    return
  }
  const attachedExitPlan =
    supportsAttachedExit.value && (takeProfit.value !== null || stopLoss.value !== null)
      ? { take_profit: takeProfit.value, stop_loss: stopLoss.value }
      : null
  const data: LimitOrderCommand = {
    action: action.value,
    side: derivedSide.value,
    symbol: isHyperliquid.value ? normalizeHyperliquidPerpSymbol(symbol.value) : symbol.value,
    quantity: quantity.value,
    quantity_mode: quantityMode.value,
    price: price.value,
    time_in_force: timeInForce.value,
    position_side: positionSide.value,
    market_context: marketContext,
    attached_exit_plan: attachedExitPlan,
  }
  const payload: Extract<UserCommandPayload, { kind: 'LimitOrder' }> = {
    kind: 'LimitOrder',
    data,
  }
  ws.sendUserCommand(payload)
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Limit Order" :open="open" @close="emit('close')">
    <form id="limit-order" class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Account</span>
          <select v-model="selectedAccountId" class="input">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} ({{ accountMetadataChips(account).join(' / ') }})
            </option>
          </select>
        </label>
        <label class="field"><span>Symbol</span><input v-model="symbol" class="input" /></label>
        <label class="field">
          <span>Action</span>
          <select v-model="action" class="input">
            <option :value="MarketAction.Open">Open</option>
            <option :value="MarketAction.Close">Close</option>
          </select>
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="positionSide" class="input">
            <option :value="PositionSide.Long">Long</option>
            <option :value="PositionSide.Short">Short</option>
          </select>
        </label>
        <label class="field">
          <span>Amount Type</span>
          <select v-model="quantityMode" class="input" :disabled="!isHyperliquid">
            <option value="notional">USDC Notional</option>
            <option value="base">Base Quantity</option>
          </select>
        </label>
        <label class="field">
          <span>{{ quantityMode === 'notional' ? 'USDC Amount' : 'Base Quantity' }}</span>
          <input v-model.number="quantity" type="number" step="any" class="input" />
        </label>
        <label class="field">
          <span>Limit Price</span>
          <input v-model.number="price" type="number" step="any" class="input" />
        </label>
        <label class="field">
          <span>Time in Force</span>
          <select v-model="timeInForce" class="input" :disabled="!isHyperliquid">
            <option value="gtc">Good Till Canceled</option>
            <option value="alo">Post Only (ALO)</option>
          </select>
        </label>
        <template v-if="supportsAttachedExit">
          <label class="field">
            <span>Take Profit</span>
            <input v-model.number="takeProfit" type="number" step="any" class="input" />
          </label>
          <label class="field">
            <span>Stop Loss</span>
            <input v-model.number="stopLoss" type="number" step="any" class="input" />
          </label>
        </template>
      </div>
      <p class="m-0 text-[11px] text-[var(--color-text-dim)]">
        {{ action }} {{ positionSide }} submits {{ derivedSide
        }}{{ action === MarketAction.Close ? ' reduce-only' : '' }}.
      </p>
      <p v-if="blocksOpeningOrder" class="m-0 text-xs text-error">
        Hyperliquid account setup or server trading mode does not permit new opens.
      </p>
      <p v-else-if="exitLevelError" class="m-0 text-xs text-error">{{ exitLevelError }}</p>
      <p v-else-if="!supportsLimitOrders" class="m-0 text-[11px] text-[var(--color-text-dim)]">
        Limit orders are unavailable for this market.
      </p>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button form="limit-order" type="submit" class="btn btn-primary" :disabled="!validate()">
          Submit
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>
