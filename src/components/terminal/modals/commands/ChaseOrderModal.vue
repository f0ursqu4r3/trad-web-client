<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  ExchangeType,
  MarketAction,
  OrderSide,
  PositionSide,
  type ChaseBoundary,
  type ChaseOrderCommand,
  type HyperliquidExecutionGuardOverrides,
  type MarketContext,
  type OrderQuantityMode,
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
import type { ChaseOrderPrefill } from './types'

const logger = createLogger('commands')
const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()
const accounts = useAccountsStore()
const modals = useModalStore()
const selectedAccountId = ref('')
const symbol = ref('BTC')
const action = ref<MarketAction>(MarketAction.Open)
const positionSide = ref<PositionSide>(PositionSide.Long)
const quantityMode = ref<OrderQuantityMode>('notional')
const quantity = ref<number | null>(50)
const boundaryMode = ref<'basis_points' | 'price'>('basis_points')
const boundaryBps = ref<number | null>(20)
const boundaryPrice = ref<number | null>(null)
const untilCanceled = ref(false)
const expiryMinutes = ref<number | null>(5)
const takeProfit = ref<number | null>(null)
const stopLoss = ref<number | null>(null)
const overrideProtectionGuards = ref(false)
const takeProfitGuardPercent = ref(1)
const stopLossGuardPercent = ref(10)

const hyperliquidAccounts = computed(() =>
  accounts.accounts.filter((account) => account.exchange === ExchangeType.Hyperliquid),
)
const selectedMarketContext = computed<MarketContext | null>(() =>
  accounts.getMarketContextForAccount(selectedAccountId.value),
)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const capabilities = computed(() => ws.capabilitiesForMarketContext(selectedMarketContext.value))
const supportsChaseOrders = computed(() => capabilities.value?.supports_chase_orders === true)
const supportsAttachedExit = computed(
  () =>
    action.value === MarketAction.Open &&
    capabilities.value?.supports_attached_take_profit_stop_loss === true,
)
const blocksOpeningOrder = computed(
  () =>
    action.value === MarketAction.Open &&
    (!isHyperliquidMetadataReady(selectedAccount.value) ||
      capabilities.value?.new_open_orders_enabled === false),
)
const derivedSide = computed(() => {
  if (action.value === MarketAction.Open) {
    return positionSide.value === PositionSide.Long ? OrderSide.Buy : OrderSide.Sell
  }
  return positionSide.value === PositionSide.Long ? OrderSide.Sell : OrderSide.Buy
})
const referenceLabel = computed(() =>
  derivedSide.value === OrderSide.Buy ? 'best bid' : 'best ask',
)
const boundaryPercent = computed(() => {
  if (boundaryBps.value === null || !Number.isFinite(boundaryBps.value)) return '-'
  return `${(boundaryBps.value / 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`
})
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
const exitLevelError = computed(() => {
  if (!supportsAttachedExit.value) return null
  if (takeProfit.value !== null && (!Number.isFinite(takeProfit.value) || takeProfit.value <= 0)) {
    return 'Take profit must be a positive price.'
  }
  if (stopLoss.value !== null && (!Number.isFinite(stopLoss.value) || stopLoss.value <= 0)) {
    return 'Stop loss must be a positive price.'
  }
  return null
})

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
  const preset = (modals.modalValues['ChaseOrder'] as ChaseOrderPrefill | undefined) ?? null
  const selected = accounts.selectedAccount
  selectedAccountId.value =
    (preset?.account_id &&
    hyperliquidAccounts.value.some((account) => account.id === preset.account_id)
      ? preset.account_id
      : null) ??
    (selected?.exchange === ExchangeType.Hyperliquid ? selected.id : null) ??
    hyperliquidAccounts.value[0]?.id ??
    ''
  symbol.value =
    preset?.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value) ?? 'BTC'
  action.value = preset?.action ?? MarketAction.Open
  positionSide.value = preset?.position_side ?? PositionSide.Long
  quantityMode.value = preset?.quantity_mode ?? 'notional'
  quantity.value = preset?.quantity ?? 50
  boundaryMode.value = preset?.boundary.kind ?? 'basis_points'
  boundaryBps.value = preset?.boundary.kind === 'basis_points' ? preset.boundary.value : 20
  boundaryPrice.value = preset?.boundary.kind === 'price' ? preset.boundary.value : null
  untilCanceled.value = preset ? preset.expires_after_secs == null : false
  expiryMinutes.value =
    preset?.expires_after_secs == null ? 5 : Math.max(preset.expires_after_secs / 60, 0.01)
  takeProfit.value = preset?.take_profit ?? null
  stopLoss.value = preset?.stop_loss ?? null
  resetProtectionGuards()
  const overrides = preset?.execution_guard_overrides
  if (overrides) {
    overrideProtectionGuards.value = true
    if (overrides.take_profit_market_tenths_bps != null) {
      takeProfitGuardPercent.value = tenthsBpsToPercent(overrides.take_profit_market_tenths_bps)
    }
    if (overrides.stop_loss_market_tenths_bps != null) {
      stopLossGuardPercent.value = tenthsBpsToPercent(overrides.stop_loss_market_tenths_bps)
    }
  }
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

watch(selectedAccountId, () => {
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value) || 'BTC'
  resetProtectionGuards()
  requestCapabilities()
})

watch(supportsAttachedExit, (supported) => {
  if (!supported) {
    takeProfit.value = null
    stopLoss.value = null
  }
})

function validate(): boolean {
  if (!supportsChaseOrders.value || !selectedAccountId.value || blocksOpeningOrder.value)
    return false
  if (!isValidHyperliquidPerpSymbol(symbol.value)) return false
  if (quantity.value === null || !Number.isFinite(quantity.value) || quantity.value <= 0)
    return false
  if (
    boundaryMode.value === 'basis_points' &&
    (boundaryBps.value === null ||
      !Number.isFinite(boundaryBps.value) ||
      boundaryBps.value <= 0 ||
      boundaryBps.value > 10_000)
  ) {
    return false
  }
  if (
    boundaryMode.value === 'price' &&
    (boundaryPrice.value === null ||
      !Number.isFinite(boundaryPrice.value) ||
      boundaryPrice.value <= 0)
  ) {
    return false
  }
  if (
    !untilCanceled.value &&
    (expiryMinutes.value === null ||
      !Number.isFinite(expiryMinutes.value) ||
      expiryMinutes.value <= 0 ||
      expiryMinutes.value * 60 > Number.MAX_SAFE_INTEGER)
  ) {
    return false
  }
  if (exitLevelError.value) return false
  if (
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
  if (!marketContext || !validate() || quantity.value === null) {
    logger.error('Chase order validation failed')
    return
  }
  const boundary: ChaseBoundary =
    boundaryMode.value === 'price'
      ? { kind: 'price', value: boundaryPrice.value! }
      : { kind: 'basis_points', value: boundaryBps.value! }
  const attachedExitPlan =
    supportsAttachedExit.value && (takeProfit.value !== null || stopLoss.value !== null)
      ? { take_profit: takeProfit.value, stop_loss: stopLoss.value }
      : null
  const executionGuardOverrides: HyperliquidExecutionGuardOverrides | null =
    supportsAttachedExit.value && overrideProtectionGuards.value
      ? executionGuardOverridesFromPercent({
          takeProfit: takeProfitGuardPercent.value,
          stopLoss: stopLossGuardPercent.value,
        })
      : null
  const data: ChaseOrderCommand = {
    action: action.value,
    side: derivedSide.value,
    symbol: normalizeHyperliquidPerpSymbol(symbol.value),
    quantity: quantity.value,
    quantity_mode: quantityMode.value,
    position_side: positionSide.value,
    market_context: marketContext,
    boundary,
    expires_after_secs: untilCanceled.value
      ? null
      : Math.max(1, Math.round(expiryMinutes.value! * 60)),
    attached_exit_plan: attachedExitPlan,
    execution_guard_overrides: executionGuardOverrides,
  }
  const payload: Extract<UserCommandPayload, { kind: 'ChaseOrder' }> = {
    kind: 'ChaseOrder',
    data,
  }
  ws.sendUserCommand(payload)
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Chase Order" :open="open" @close="emit('close')">
    <form id="chase-order" class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Hyperliquid Account</span>
          <select v-model="selectedAccountId" class="input">
            <option v-for="account in hyperliquidAccounts" :key="account.id" :value="account.id">
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
          <select v-model="quantityMode" class="input">
            <option value="notional">USDC Notional</option>
            <option value="base">Base Quantity</option>
          </select>
        </label>
        <label class="field">
          <span>{{ quantityMode === 'notional' ? 'USDC Amount' : 'Base Quantity' }}</span>
          <input v-model.number="quantity" type="number" min="0" step="any" class="input" />
        </label>
        <label class="field">
          <span>Adverse Boundary</span>
          <select v-model="boundaryMode" class="input">
            <option value="basis_points">Distance (bps)</option>
            <option value="price">Fixed Price</option>
          </select>
        </label>
        <label v-if="boundaryMode === 'basis_points'" class="field">
          <span>Maximum Distance (bps)</span>
          <input
            v-model.number="boundaryBps"
            type="number"
            min="0.1"
            max="10000"
            step="0.1"
            class="input"
          />
          <small>{{ boundaryPercent }} from the first working {{ referenceLabel }}</small>
        </label>
        <label v-else class="field">
          <span>Maximum Adverse Price</span>
          <input v-model.number="boundaryPrice" type="number" min="0" step="any" class="input" />
          <small>Chasing stops before the {{ referenceLabel }} crosses this price.</small>
        </label>
        <label class="field col-span-2 flex-row items-center gap-2">
          <input v-model="untilCanceled" type="checkbox" />
          <span>Run until canceled</span>
        </label>
        <label v-if="!untilCanceled" class="field">
          <span>Expiry (minutes)</span>
          <input v-model.number="expiryMinutes" type="number" min="0.01" step="any" class="input" />
        </label>
        <p
          v-else
          class="col-span-2 m-0 border border-[var(--color-warning)] p-2 text-[11px] text-[var(--color-warning)]"
        >
          This Chase remains active across sessions and restarts until it fills, reaches its
          boundary, or you cancel it.
        </p>
        <template v-if="supportsAttachedExit">
          <label class="field">
            <span>Take Profit</span>
            <input v-model.number="takeProfit" type="number" min="0" step="any" class="input" />
          </label>
          <label class="field">
            <span>Stop Loss</span>
            <input v-model.number="stopLoss" type="number" min="0" step="any" class="input" />
          </label>
          <p class="col-span-2 m-0 text-[11px] text-[var(--color-text-dim)]">
            TP/SL is validated against each actual working entry price. Protection follows
            cumulative fills through the child order lifecycle.
          </p>
          <label class="field col-span-2 flex-row items-center gap-2">
            <input v-model="overrideProtectionGuards" type="checkbox" />
            <span>Override account protection guards</span>
          </label>
          <template v-if="overrideProtectionGuards">
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
          <p class="col-span-2 m-0 text-[11px] text-[var(--color-text-dim)]">
            {{
              overrideProtectionGuards
                ? 'These market TP/SL guards are recorded with this command.'
                : `Account defaults: ${accountProtectionGuardLabel}.`
            }}
          </p>
        </template>
      </div>
      <p class="m-0 text-[11px] text-[var(--color-text-dim)]">
        {{ action }} {{ positionSide }} follows the {{ referenceLabel }} with post-only replacement
        orders{{ action === MarketAction.Close ? ' and remains reduce-only' : '' }}.
      </p>
      <p v-if="hyperliquidAccounts.length === 0" class="m-0 text-xs text-error">
        Add a Hyperliquid account before creating a Chase.
      </p>
      <p v-else-if="blocksOpeningOrder" class="m-0 text-xs text-error">
        Hyperliquid account setup or server trading mode does not permit new opens.
      </p>
      <p v-else-if="exitLevelError" class="m-0 text-xs text-error">{{ exitLevelError }}</p>
      <p v-else-if="!supportsChaseOrders" class="m-0 text-[11px] text-[var(--color-text-dim)]">
        Chase orders are unavailable for this account or disabled by server policy.
      </p>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button form="chase-order" type="submit" class="btn btn-primary" :disabled="!validate()">
          Start Chase
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>
