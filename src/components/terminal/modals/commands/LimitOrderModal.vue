<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  ExchangeType,
  MarketAction,
  NetworkType,
  OrderSide,
  PositionSide,
  type LimitOrderCommand,
  type LimitTimeInForce,
  type HyperliquidExecutionGuardOverrides,
  type HyperliquidPositionEffectPreviewRequest,
  type MarketContext,
  type OrderQuantityMode,
  type TakeProfitLadder,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import { useModalStore } from '@/stores/modals'
import {
  accountMetadataChips,
  isHyperliquidMetadataReady,
  useAccountsStore,
} from '@/stores/accounts'
import { createLogger } from '@/lib/utils'
import {
  hyperliquidLimitPriceReferenceError,
  isValidHyperliquidPerpSymbol,
  normalizeHyperliquidPerpSymbol,
} from '@/lib/bybitOrderValidation'
import {
  executionGuardOverridesFromPercent,
  formatExecutionGuardPercent,
  isValidExecutionGuardPercent,
  resolveHyperliquidExecutionGuards,
  tenthsBpsToPercent,
} from '@/lib/hyperliquidExecutionGuards'
import type { LimitOrderPrefill } from './types'
import HyperliquidPositionEffectPreview from './HyperliquidPositionEffectPreview.vue'
import TakeProfitLadderEditor from './TakeProfitLadderEditor.vue'
import { useHyperliquidPositionEffectPreview } from '@/composables/useHyperliquidPositionEffectPreview'
import { useHyperliquidMidPrice } from '@/composables/useHyperliquidMidPrice'
import { useUiStore } from '@/stores/ui'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import HyperliquidTargetTotalField from './HyperliquidTargetTotalField.vue'

const logger = createLogger('commands')
const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()
const accounts = useAccountsStore()
const modals = useModalStore()
const ui = useUiStore()
const selectedAccountId = ref('')
const lastAccountId = ref('')
const symbol = ref('BTC')
const action = ref<MarketAction>(MarketAction.Open)
const positionSide = ref<PositionSide>(PositionSide.Long)
const quantityMode = ref<OrderQuantityMode>('notional')
const quantity = ref<number | null>(50)
const price = ref<number | null>(null)
const timeInForce = ref<LimitTimeInForce>('gtc')
const takeProfit = ref<number | null | ''>(null)
const takeProfitLadderEnabled = ref(false)
const takeProfitLadder = ref<TakeProfitLadder | null>(null)
const takeProfitLadderValid = ref(true)
const stopLoss = ref<number | null | ''>(null)
const overrideProtectionGuards = ref(false)
const takeProfitGuardPercent = ref(1)
const stopLossGuardPercent = ref(10)
const builderTargetTotalTenthsBps = ref(52)
const presetAccountChangePending = ref(false)

const selectedMarketContext = computed<MarketContext | null>(() =>
  accounts.getMarketContextForAccount(selectedAccountId.value),
)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const capabilities = computed(() => ws.capabilitiesForMarketContext(selectedMarketContext.value))
const supportsLimitOrders = computed(() => capabilities.value?.supports_limit_orders === true)
const isHyperliquid = computed(() => selectedAccount.value?.exchange === ExchangeType.Hyperliquid)
const hyperliquidSymbol = computed(() =>
  isValidHyperliquidPerpSymbol(symbol.value) ? normalizeHyperliquidPerpSymbol(symbol.value) : '',
)
const hyperliquidNetwork = computed(
  () => selectedAccount.value?.network ?? (null as NetworkType | null),
)
const hyperliquidMid = useHyperliquidMidPrice(
  hyperliquidNetwork,
  hyperliquidSymbol,
  computed(() => props.open && isHyperliquid.value),
)
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
    !takeProfitLadderEnabled.value &&
    takeProfit.value !== null &&
    takeProfit.value !== '' &&
    (takeProfit.value <= 0 ||
      (positionSide.value === PositionSide.Long
        ? takeProfit.value <= price.value
        : takeProfit.value >= price.value))
  ) {
    return `${positionSide.value} take profit must be ${positionSide.value === PositionSide.Long ? 'above' : 'below'} the limit price.`
  }
  if (takeProfitLadderEnabled.value) {
    if (!takeProfitLadderValid.value || !takeProfitLadder.value) {
      return 'Complete every take-profit ladder level.'
    }
    const invalid = takeProfitLadder.value.legs.find((leg) =>
      positionSide.value === PositionSide.Long
        ? leg.trigger_price <= price.value!
        : leg.trigger_price >= price.value!,
    )
    if (invalid) {
      return `${positionSide.value} take profit must be ${positionSide.value === PositionSide.Long ? 'above' : 'below'} the limit price.`
    }
  }
  if (
    stopLoss.value !== null &&
    stopLoss.value !== '' &&
    (stopLoss.value <= 0 ||
      (positionSide.value === PositionSide.Long
        ? stopLoss.value >= price.value
        : stopLoss.value <= price.value))
  ) {
    return `${positionSide.value} stop loss must be ${positionSide.value === PositionSide.Long ? 'below' : 'above'} the limit price.`
  }
  return null
})
const limitPriceReferenceError = computed(() =>
  isHyperliquid.value
    ? hyperliquidLimitPriceReferenceError(price.value, hyperliquidMid.price.value)
    : null,
)
const accountExecutionGuards = computed(() =>
  resolveHyperliquidExecutionGuards(selectedAccount.value?.exchange_metadata),
)
const accountProtectionGuardLabel = computed(() => {
  const guards = accountExecutionGuards.value
  return [
    `TP ${formatExecutionGuardPercent(guards.take_profit_market_tenths_bps)}`,
    `SL ${formatExecutionGuardPercent(guards.stop_loss_market_tenths_bps)}`,
  ].join(' / ')
})
const quantityLabel = computed(() => {
  if (quantityMode.value === 'base') return 'Base Quantity'
  if (quantityMode.value === 'risk') return 'Risk at Stop (USDC)'
  if (selectedAccount.value?.exchange === ExchangeType.Bybit) return 'USDT Amount'
  return 'USDC Amount'
})
const positionEffectRequest = computed<HyperliquidPositionEffectPreviewRequest | null>(() => {
  const marketContext = selectedMarketContext.value
  if (
    !marketContext ||
    !isHyperliquid.value ||
    !isValidHyperliquidPerpSymbol(symbol.value) ||
    quantity.value === null ||
    quantity.value <= 0 ||
    price.value === null ||
    price.value <= 0 ||
    (quantityMode.value === 'risk' && optionalPositivePrice(stopLoss.value) === null)
  ) {
    return null
  }
  return {
    market_context: marketContext,
    symbol: normalizeHyperliquidPerpSymbol(symbol.value),
    action: action.value,
    position_side: positionSide.value,
    quantity: quantity.value,
    quantity_mode: quantityMode.value,
    reference_price: price.value,
    risk_stop_loss: optionalPositivePrice(stopLoss.value),
    risk_entry_is_maker: timeInForce.value === 'alo',
    risk_entry_slippage_fraction: 0,
  }
})
const positionEffect = useHyperliquidPositionEffectPreview(
  positionEffectRequest,
  computed(() => props.open && isHyperliquid.value),
)

function resetProtectionGuards() {
  const guards = accountExecutionGuards.value
  overrideProtectionGuards.value = false
  takeProfitGuardPercent.value = tenthsBpsToPercent(guards.take_profit_market_tenths_bps)
  stopLossGuardPercent.value = tenthsBpsToPercent(guards.stop_loss_market_tenths_bps)
}

function requestCapabilities() {
  if (selectedMarketContext.value) ws.requestMarketCapabilities(selectedMarketContext.value)
}

function applyInitialValues() {
  const preset = (modals.modalValues['LimitOrder'] as LimitOrderPrefill | undefined) ?? null
  const presetAccountId = preset?.account_id
  const initialAccountId =
    (presetAccountId && accounts.accounts.some((account) => account.id === presetAccountId)
      ? presetAccountId
      : accounts.selectedAccount?.id) ?? ''
  presetAccountChangePending.value = initialAccountId !== selectedAccountId.value
  selectedAccountId.value = initialAccountId
  symbol.value = preset?.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  action.value = preset?.action ?? MarketAction.Open
  positionSide.value = preset?.position_side ?? PositionSide.Long
  quantityMode.value =
    preset?.quantity_mode ?? (isHyperliquid.value ? ui.orderQuantityMode : 'base')
  quantity.value = preset?.quantity ?? (isHyperliquid.value ? 50 : 0.001)
  price.value = preset?.price ?? null
  timeInForce.value = preset?.time_in_force ?? 'gtc'
  takeProfit.value = preset?.take_profit ?? null
  takeProfitLadderEnabled.value = preset?.take_profit_ladder != null
  takeProfitLadder.value = preset?.take_profit_ladder ?? null
  takeProfitLadderValid.value = true
  stopLoss.value = preset?.stop_loss ?? null
  builderTargetTotalTenthsBps.value =
    preset?.builder_target_total_tenths_bps ??
    hyperliquidTargetTotalTenthsBps(selectedAccount.value?.exchange_metadata)
  resetProtectionGuards()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      applyInitialValues()
      requestCapabilities()
    }
  },
)

watch(selectedAccountId, (next, previous) => {
  if (presetAccountChangePending.value) {
    presetAccountChangePending.value = false
    return
  }
  const previousDefault = accounts.getDefaultSymbolForAccount(previous || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === previousDefault) symbol.value = nextDefault
  lastAccountId.value = next
  quantityMode.value = isHyperliquid.value ? ui.orderQuantityMode : 'base'
  builderTargetTotalTenthsBps.value = hyperliquidTargetTotalTenthsBps(
    selectedAccount.value?.exchange_metadata,
  )
  resetProtectionGuards()
  requestCapabilities()
})

watch(supportsAttachedExit, (supported) => {
  if (!supported) {
    takeProfit.value = null
    takeProfitLadderEnabled.value = false
    takeProfitLadder.value = null
    stopLoss.value = null
  }
})

watch(action, (next) => {
  if (next !== MarketAction.Open && quantityMode.value === 'risk') {
    quantityMode.value = isHyperliquid.value ? 'notional' : 'base'
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
  if (isHyperliquid.value && hyperliquidMid.price.value === null) return false
  if (limitPriceReferenceError.value) return false
  if (exitLevelError.value) return false
  if (takeProfitLadderEnabled.value && (!takeProfitLadderValid.value || !takeProfitLadder.value)) {
    return false
  }
  if (
    quantityMode.value === 'risk' &&
    (action.value !== MarketAction.Open || optionalPositivePrice(stopLoss.value) === null)
  ) {
    return false
  }
  if (
    isHyperliquid.value &&
    supportsAttachedExit.value &&
    overrideProtectionGuards.value &&
    (!isValidExecutionGuardPercent(takeProfitGuardPercent.value) ||
      !isValidExecutionGuardPercent(stopLossGuardPercent.value))
  ) {
    return false
  }
  return true
}

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (
    !marketContext ||
    !validate() ||
    !positionEffect.canSubmit.value ||
    quantity.value === null ||
    price.value === null
  ) {
    logger.error('Limit order validation failed')
    return
  }
  const normalizedTakeProfit = optionalPositivePrice(takeProfit.value)
  const normalizedStopLoss = optionalPositivePrice(stopLoss.value)
  const attachedExitPlan =
    supportsAttachedExit.value &&
    ((takeProfitLadderEnabled.value && takeProfitLadder.value !== null) ||
      normalizedTakeProfit !== null ||
      normalizedStopLoss !== null)
      ? {
          take_profit: takeProfitLadderEnabled.value ? null : normalizedTakeProfit,
          take_profit_ladder: takeProfitLadderEnabled.value ? takeProfitLadder.value : null,
          stop_loss: normalizedStopLoss,
        }
      : null
  const executionGuardOverrides: HyperliquidExecutionGuardOverrides | null =
    isHyperliquid.value && supportsAttachedExit.value && overrideProtectionGuards.value
      ? executionGuardOverridesFromPercent({
          takeProfit: takeProfitGuardPercent.value,
          stopLoss: stopLossGuardPercent.value,
        })
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
    execution_guard_overrides: executionGuardOverrides,
    builder_target_total_tenths_bps: isHyperliquid.value ? builderTargetTotalTenthsBps.value : null,
  }
  const payload: Extract<UserCommandPayload, { kind: 'LimitOrder' }> = {
    kind: 'LimitOrder',
    data,
  }
  ws.sendUserCommand(payload)
  emit('close')
}

function optionalPositivePrice(value: number | null | ''): number | null {
  if (value === null || value === '') return null
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function rememberQuantityMode() {
  if (isHyperliquid.value) ui.setOrderQuantityMode(quantityMode.value)
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
        <label class="field">
          <span>Symbol</span><input v-model="symbol" class="input" aria-label="Symbol" />
          <small v-if="isHyperliquid && hyperliquidMid.price.value !== null">
            Current mid ${{ hyperliquidMid.price.value.toLocaleString() }}
          </small>
          <small v-else-if="isHyperliquid && hyperliquidMid.loading.value">
            Loading current midpoint
          </small>
          <small v-else-if="isHyperliquid && hyperliquidMid.error.value" class="text-error">
            Midpoint unavailable
          </small>
        </label>
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
          <select
            v-model="quantityMode"
            class="input"
            :disabled="!isHyperliquid"
            @change="rememberQuantityMode"
          >
            <option value="notional">USDC Notional</option>
            <option value="base">Base Quantity</option>
            <option v-if="isHyperliquid && action === MarketAction.Open" value="risk">
              Risk at Stop
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ quantityLabel }}</span>
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
          <label v-if="isHyperliquid" class="field col-span-2 flex-row items-center gap-2">
            <input v-model="takeProfitLadderEnabled" type="checkbox" />
            <span>Use multiple take-profit levels</span>
          </label>
          <TakeProfitLadderEditor
            v-if="isHyperliquid && takeProfitLadderEnabled"
            v-model="takeProfitLadder"
            @validity="takeProfitLadderValid = $event"
          />
          <label v-else class="field">
            <span>Take Profit Price (optional)</span>
            <input v-model.number="takeProfit" type="number" step="any" class="input" />
          </label>
          <label class="field">
            <span>Stop Loss Price (optional)</span>
            <input v-model.number="stopLoss" type="number" step="any" class="input" />
          </label>
          <label v-if="isHyperliquid" class="field col-span-2 flex-row items-center gap-2">
            <input v-model="overrideProtectionGuards" type="checkbox" />
            <span>Override account protection guards</span>
          </label>
          <template v-if="isHyperliquid && overrideProtectionGuards">
            <label class="field">
              <span>Market TP Guard (%)</span>
              <input
                v-model.number="takeProfitGuardPercent"
                type="number"
                min="0"
                max="50"
                step="0.001"
                class="input"
              />
            </label>
            <label class="field">
              <span>Market SL Guard (%)</span>
              <input
                v-model.number="stopLossGuardPercent"
                type="number"
                min="0"
                max="50"
                step="0.001"
                class="input"
              />
            </label>
          </template>
          <p v-if="isHyperliquid" class="col-span-2 m-0 text-[11px] text-[var(--color-text-dim)]">
            {{
              overrideProtectionGuards
                ? 'These market TP/SL guards are recorded with this command.'
                : `Account defaults: ${accountProtectionGuardLabel}.`
            }}
          </p>
        </template>
        <HyperliquidTargetTotalField
          v-if="isHyperliquid && selectedAccount"
          v-model="builderTargetTotalTenthsBps"
          :account="selectedAccount"
        />
      </div>
      <p class="m-0 text-[11px] text-[var(--color-text-dim)]">
        {{ action }} {{ positionSide }} submits {{ derivedSide
        }}{{ action === MarketAction.Close ? ' reduce-only' : '' }}.
      </p>
      <p v-if="blocksOpeningOrder" class="m-0 text-xs text-error">
        Hyperliquid account setup or server trading mode does not permit new opens.
      </p>
      <p v-else-if="limitPriceReferenceError" class="m-0 text-xs text-error">
        {{ limitPriceReferenceError }}
      </p>
      <p v-else-if="exitLevelError" class="m-0 text-xs text-error">{{ exitLevelError }}</p>
      <p v-else-if="!supportsLimitOrders" class="m-0 text-[11px] text-[var(--color-text-dim)]">
        Limit orders are unavailable for this market.
      </p>
      <HyperliquidPositionEffectPreview
        v-if="isHyperliquid"
        :preview="positionEffect.preview.value"
        :error="positionEffect.error.value"
        :pending="positionEffect.pending.value"
        :confirmed="positionEffect.confirmed.value"
        @update:confirmed="positionEffect.setConfirmed"
      />
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button
          form="limit-order"
          type="submit"
          class="btn btn-primary"
          :disabled="!validate() || !positionEffect.canSubmit.value"
        >
          Submit
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>
