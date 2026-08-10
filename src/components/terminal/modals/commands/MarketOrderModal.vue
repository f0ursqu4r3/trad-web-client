<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  MarketAction,
  ExchangeType,
  NetworkType,
  PositionSide,
  type MarketContext,
  type MarketOrderCommand,
  type HyperliquidExecutionGuardOverrides,
  type HyperliquidPositionEffectPreviewRequest,
  type OrderQuantityMode,
  type TakeProfitLadder,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import {
  accountMetadataChips,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
  useAccountsStore,
} from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'
import { useWsStore } from '@/stores/ws'
import {
  marketOrderExitLevelError,
  isValidHyperliquidPerpSymbol,
  isValidBybitUsdtSymbol,
  normalizeHyperliquidPerpSymbol,
  normalizeBybitUsdtSymbol,
} from '@/lib/bybitOrderValidation'

import type { MarketOrderPrefill } from './types'
import HyperliquidPositionEffectPreview from './HyperliquidPositionEffectPreview.vue'
import TakeProfitLadderEditor from './TakeProfitLadderEditor.vue'
import { useHyperliquidPositionEffectPreview } from '@/composables/useHyperliquidPositionEffectPreview'
import { createLogger } from '@/lib/utils'
import {
  executionGuardOverridesFromPercent,
  formatExecutionGuardPercent,
  isValidExecutionGuardPercent,
  resolveHyperliquidExecutionGuards,
  tenthsBpsToPercent,
} from '@/lib/hyperliquidExecutionGuards'
import { useHyperliquidMidPrice } from '@/composables/useHyperliquidMidPrice'
import { useUiStore } from '@/stores/ui'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import HyperliquidTargetTotalField from './HyperliquidTargetTotalField.vue'

const logger = createLogger('commands')

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{
  (e: 'submit', payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }>): void
  (e: 'close'): void
}>()

const accounts = useAccountsStore()
const modals = useModalStore()
const ws = useWsStore()
const ui = useUiStore()

const selectedAccountId = ref<string>('')
const symbol = ref<string>('BTCUSDT')
const lastAccountId = ref<string>('')
const quantity = ref<number | null>(null)
const quantityMode = ref<OrderQuantityMode>('notional')
const position_side = ref<PositionSide>(PositionSide.Long)
const action = ref<MarketAction>(MarketAction.Open)
const take_profit = ref<number | null | ''>(null)
const takeProfitLadderEnabled = ref(false)
const takeProfitLadder = ref<TakeProfitLadder | null>(null)
const takeProfitLadderValid = ref(true)
const stop_loss = ref<number | null | ''>(null)
const overrideExecutionGuards = ref(false)
const entryGuardPercent = ref(0.5)
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
const selectedCapabilities = computed(() =>
  ws.capabilitiesForMarketContext(selectedMarketContext.value),
)
const isBybitAccount = computed(() => selectedAccount.value?.exchange === ExchangeType.Bybit)
const isHyperliquidAccount = computed(
  () => selectedAccount.value?.exchange === ExchangeType.Hyperliquid,
)
const hyperliquidSymbol = computed(() =>
  isValidHyperliquidPerpSymbol(symbol.value) ? normalizeHyperliquidPerpSymbol(symbol.value) : '',
)
const hyperliquidNetwork = computed(
  () => selectedAccount.value?.network ?? (null as NetworkType | null),
)
const hyperliquidMid = useHyperliquidMidPrice(
  hyperliquidNetwork,
  hyperliquidSymbol,
  computed(() => props.open && isHyperliquidAccount.value),
)
const blocksOpeningOrder = computed(() => {
  if (action.value !== MarketAction.Open) return false
  if (isBybitAccount.value) return !isBybitMetadataVerified(selectedAccount.value)
  if (isHyperliquidAccount.value) {
    return (
      !isHyperliquidMetadataReady(selectedAccount.value) ||
      selectedCapabilities.value?.new_open_orders_enabled === false
    )
  }
  return false
})
const supportsAttachedExit = computed(
  () =>
    action.value === MarketAction.Open &&
    selectedCapabilities.value?.supports_attached_take_profit_stop_loss === true,
)
const exitLevelError = computed(() => {
  if ((!isBybitAccount.value && !isHyperliquidAccount.value) || !supportsAttachedExit.value) {
    return null
  }
  const scalarError = marketOrderExitLevelError(
    isHyperliquidAccount.value ? 'Hyperliquid' : 'Bybit',
    position_side.value,
    takeProfitLadderEnabled.value ? null : take_profit.value,
    stop_loss.value,
    isHyperliquidAccount.value ? hyperliquidMid.price.value : null,
  )
  if (scalarError) return scalarError
  if (takeProfitLadderEnabled.value) {
    for (const leg of takeProfitLadder.value?.legs ?? []) {
      const error = marketOrderExitLevelError(
        'Hyperliquid',
        position_side.value,
        leg.trigger_price,
        stop_loss.value,
        hyperliquidMid.price.value,
      )
      if (error) return error
    }
  }
  return null
})
const protectionLabel = computed(() => {
  const hasTakeProfit = takeProfitLadderEnabled.value
    ? (takeProfitLadder.value?.legs.length ?? 0) > 0
    : optionalPositivePrice(take_profit.value) !== null
  const hasStopLoss = optionalPositivePrice(stop_loss.value) !== null
  if (hasTakeProfit && hasStopLoss) return 'Attached protection: TP + SL'
  if (hasTakeProfit) return 'Attached protection: TP only'
  if (hasStopLoss) return 'Attached protection: SL only'
  return 'Attached protection: none'
})
const readinessWarning = computed(() => {
  if (isHyperliquidAccount.value) {
    if (selectedCapabilities.value?.new_open_orders_enabled === false) {
      const mode = selectedCapabilities.value.runtime_mode ?? 'disabled'
      return mode === 'disabled'
        ? "Hyperliquid signed trading is disabled by the server. An operator must select 'close_only' for recovery actions or enable trading."
        : `Hyperliquid new opens are disabled by server runtime mode '${mode}'. Reduce-only closes remain available.`
    }
    return 'Hyperliquid account setup is incomplete. Complete wallet/agent setup and builder approval before opening live orders.'
  }
  return 'Bybit metadata is unvalidated. Refresh credentials before opening live Bybit orders.'
})
const accountExecutionGuards = computed(() =>
  resolveHyperliquidExecutionGuards(selectedAccount.value?.exchange_metadata),
)
const accountExecutionGuardLabel = computed(() => {
  const guards = accountExecutionGuards.value
  return [
    `entry ${formatExecutionGuardPercent(guards.entry_market_tenths_bps)}`,
    `TP ${formatExecutionGuardPercent(guards.take_profit_market_tenths_bps)}`,
    `SL ${formatExecutionGuardPercent(guards.stop_loss_market_tenths_bps)}`,
  ].join(' / ')
})
const quantityLabel = computed(() => {
  if (quantityMode.value === 'base') return 'Base Quantity'
  if (quantityMode.value === 'risk') return 'Risk at Stop (USDC)'
  if (isBybitAccount.value) return 'USDT Amount'
  return 'USDC Amount'
})
const riskEntrySlippageFraction = computed(() =>
  overrideExecutionGuards.value
    ? entryGuardPercent.value / 100
    : accountExecutionGuards.value.entry_market_tenths_bps / 100_000,
)
const positionEffectRequest = computed<HyperliquidPositionEffectPreviewRequest | null>(() => {
  const marketContext = selectedMarketContext.value
  if (
    !marketContext ||
    !isHyperliquidAccount.value ||
    !isValidHyperliquidPerpSymbol(symbol.value) ||
    quantity.value === null ||
    !Number.isFinite(quantity.value) ||
    quantity.value <= 0 ||
    (quantityMode.value === 'risk' && optionalPositivePrice(stop_loss.value) === null)
  ) {
    return null
  }
  return {
    market_context: marketContext,
    symbol: normalizeHyperliquidPerpSymbol(symbol.value),
    action: action.value,
    position_side: position_side.value,
    quantity: quantity.value,
    quantity_mode: quantityMode.value,
    reference_price: null,
    risk_stop_loss: optionalPositivePrice(stop_loss.value),
    risk_entry_is_maker: false,
    risk_entry_slippage_fraction: riskEntrySlippageFraction.value,
  }
})
const positionEffect = useHyperliquidPositionEffectPreview(
  positionEffectRequest,
  computed(() => props.open && isHyperliquidAccount.value),
)

function resetExecutionGuards() {
  const guards = accountExecutionGuards.value
  overrideExecutionGuards.value = false
  entryGuardPercent.value = tenthsBpsToPercent(guards.entry_market_tenths_bps)
  takeProfitGuardPercent.value = tenthsBpsToPercent(guards.take_profit_market_tenths_bps)
  stopLossGuardPercent.value = tenthsBpsToPercent(guards.stop_loss_market_tenths_bps)
}

function requestSelectedCapabilities() {
  if (selectedMarketContext.value) {
    ws.requestMarketCapabilities(selectedMarketContext.value)
  }
}

function applyInitialValues() {
  const preset = (modals.modalValues['MarketOrder'] as MarketOrderPrefill) ?? {}
  const initialAccountId =
    (preset.account_id && accounts.accounts.some((account) => account.id === preset.account_id)
      ? preset.account_id
      : accounts.selectedAccount?.id) ?? ''
  presetAccountChangePending.value = initialAccountId !== selectedAccountId.value
  selectedAccountId.value = initialAccountId
  symbol.value = preset.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  quantity.value = preset.quantity ?? preset.quantity_usd ?? 50
  quantityMode.value =
    preset.quantity_mode ??
    (selectedAccount.value?.exchange === ExchangeType.Hyperliquid
      ? ui.orderQuantityMode
      : 'notional')
  position_side.value = preset.position_side ?? PositionSide.Long
  action.value = preset.action ?? MarketAction.Open
  take_profit.value = preset.take_profit ?? null
  takeProfitLadderEnabled.value = preset.take_profit_ladder != null
  takeProfitLadder.value = preset.take_profit_ladder ?? null
  takeProfitLadderValid.value = true
  stop_loss.value = preset.stop_loss ?? null
  builderTargetTotalTenthsBps.value =
    preset.builder_target_total_tenths_bps ??
    hyperliquidTargetTotalTenthsBps(selectedAccount.value?.exchange_metadata)
  resetExecutionGuards()
}

watch(
  () => props.open,
  (o) => {
    if (o) applyInitialValues()
    if (o) requestSelectedCapabilities()
  },
)

applyInitialValues()

watch(selectedAccountId, (next, prev) => {
  if (presetAccountChangePending.value) {
    presetAccountChangePending.value = false
    return
  }
  const prevDefault = accounts.getDefaultSymbolForAccount(prev || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === prevDefault) {
    symbol.value = nextDefault
  }
  lastAccountId.value = next
  quantityMode.value = isHyperliquidAccount.value ? ui.orderQuantityMode : 'notional'
  builderTargetTotalTenthsBps.value = hyperliquidTargetTotalTenthsBps(
    selectedAccount.value?.exchange_metadata,
  )
  resetExecutionGuards()
  requestSelectedCapabilities()
})

watch(supportsAttachedExit, (supported) => {
  if (action.value !== MarketAction.Open || (selectedCapabilities.value && !supported)) {
    take_profit.value = null
    takeProfitLadderEnabled.value = false
    takeProfitLadder.value = null
    stop_loss.value = null
  }
})

watch(action, (next) => {
  if (next !== MarketAction.Open && quantityMode.value === 'risk') {
    quantityMode.value = 'notional'
  }
})

function validate(): boolean {
  if (!selectedAccountId.value) return false
  if (blocksOpeningOrder.value) return false
  if (!symbol.value.trim()) return false
  if (isBybitAccount.value && !isValidBybitUsdtSymbol(symbol.value)) return false
  if (isHyperliquidAccount.value && !isValidHyperliquidPerpSymbol(symbol.value)) return false
  if (quantity.value === null || quantity.value <= 0) return false
  if (exitLevelError.value) return false
  const tp = optionalPositivePrice(take_profit.value)
  const sl = optionalPositivePrice(stop_loss.value)
  if (
    !takeProfitLadderEnabled.value &&
    take_profit.value !== null &&
    take_profit.value !== '' &&
    tp === null
  )
    return false
  if (takeProfitLadderEnabled.value && (!takeProfitLadderValid.value || !takeProfitLadder.value)) {
    return false
  }
  if (stop_loss.value !== null && stop_loss.value !== '' && sl === null) return false
  if (quantityMode.value === 'risk' && (action.value !== MarketAction.Open || sl === null)) {
    return false
  }
  if (
    isHyperliquidAccount.value &&
    (tp !== null || sl !== null) &&
    hyperliquidMid.price.value === null
  ) {
    return false
  }
  if (
    isHyperliquidAccount.value &&
    overrideExecutionGuards.value &&
    (!isValidExecutionGuardPercent(entryGuardPercent.value) ||
      (supportsAttachedExit.value &&
        (!isValidExecutionGuardPercent(takeProfitGuardPercent.value) ||
          !isValidExecutionGuardPercent(stopLossGuardPercent.value))))
  ) {
    return false
  }
  return true
}

function optionalPositivePrice(value: number | null | ''): number | null {
  if (value === null || value === '') return null
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) {
    logger.error('No market context found for account', selectedAccountId.value)
    return
  }

  if (!validate() || !positionEffect.canSubmit.value) {
    logger.error('Validation failed')
    return
  }

  const normalizedTakeProfit = optionalPositivePrice(take_profit.value)
  const normalizedStopLoss = optionalPositivePrice(stop_loss.value)
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
    isHyperliquidAccount.value && overrideExecutionGuards.value
      ? executionGuardOverridesFromPercent({
          entry: entryGuardPercent.value,
          takeProfit: supportsAttachedExit.value ? takeProfitGuardPercent.value : undefined,
          stopLoss: supportsAttachedExit.value ? stopLossGuardPercent.value : undefined,
        })
      : null

  const data: MarketOrderCommand = {
    market_context: marketContext,
    symbol: normalizedSymbolForSubmit(),
    quantity: quantity.value!,
    quantity_mode: quantityMode.value,
    position_side: position_side.value,
    action: action.value,
    attached_exit_plan: attachedExitPlan,
    execution_guard_overrides: executionGuardOverrides,
    builder_target_total_tenths_bps: isHyperliquidAccount.value
      ? builderTargetTotalTenthsBps.value
      : null,
  }
  const payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }> = {
    kind: 'MarketOrder',
    data,
  }
  emit('submit', payload)
  if (isHyperliquidAccount.value) ui.setOrderQuantityMode(quantityMode.value)
}

function rememberQuantityMode() {
  if (isHyperliquidAccount.value) ui.setOrderQuantityMode(quantityMode.value)
}

function normalizedSymbolForSubmit(): string {
  if (isBybitAccount.value) return normalizeBybitUsdtSymbol(symbol.value)
  if (isHyperliquidAccount.value) return normalizeHyperliquidPerpSymbol(symbol.value)
  return symbol.value
}
</script>

<template>
  <BaseCommandModal title="Market Order" :open="open" @close="emit('close')">
    <form id="market-order" class="space-y-4" @submit.prevent="submit">
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
          <small v-if="isHyperliquidAccount && hyperliquidMid.price.value !== null">
            Current mid ${{ hyperliquidMid.price.value.toLocaleString() }}
          </small>
          <small v-else-if="isHyperliquidAccount && hyperliquidMid.loading.value">
            Loading current midpoint
          </small>
          <small v-else-if="isHyperliquidAccount && hyperliquidMid.error.value" class="text-error">
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
          <span>Amount Type</span>
          <select
            v-model="quantityMode"
            class="input"
            :disabled="!isHyperliquidAccount"
            @change="rememberQuantityMode"
          >
            <option value="notional">USDC Notional</option>
            <option value="base">Base Quantity</option>
            <option v-if="action === MarketAction.Open" value="risk">Risk at Stop</option>
          </select>
        </label>
        <label class="field">
          <span>{{ quantityLabel }}</span>
          <input type="number" step="any" v-model.number="quantity" class="input" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="position_side" class="input">
            <option :value="PositionSide.Long">Long</option>
            <option :value="PositionSide.Short">Short</option>
          </select>
        </label>
        <template v-if="supportsAttachedExit">
          <label v-if="isHyperliquidAccount" class="field col-span-2 flex-row items-center gap-2">
            <input v-model="takeProfitLadderEnabled" type="checkbox" />
            <span>Use multiple take-profit levels</span>
          </label>
          <TakeProfitLadderEditor
            v-if="isHyperliquidAccount && takeProfitLadderEnabled"
            v-model="takeProfitLadder"
            @validity="takeProfitLadderValid = $event"
          />
          <label v-else class="field">
            <span>Take Profit Price (optional)</span>
            <input type="number" step="any" v-model.number="take_profit" class="input" />
          </label>
          <label class="field">
            <span>Stop Loss Price (optional)</span>
            <input type="number" step="any" v-model.number="stop_loss" class="input" />
          </label>
        </template>
        <p
          v-if="supportsAttachedExit"
          class="col-span-2 m-0 text-[11px] text-[var(--color-text-dim)]"
        >
          {{ protectionLabel }}
        </p>
        <template v-if="isHyperliquidAccount">
          <label class="field col-span-2 flex-row items-center gap-2">
            <input v-model="overrideExecutionGuards" type="checkbox" />
            <span>Override account execution guards</span>
          </label>
          <label v-if="overrideExecutionGuards" class="field">
            <span>Market Entry Guard (%)</span>
            <input
              v-model.number="entryGuardPercent"
              type="number"
              min="0"
              max="50"
              step="0.001"
              class="input"
            />
          </label>
          <template v-if="overrideExecutionGuards && supportsAttachedExit">
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
              overrideExecutionGuards
                ? 'This command records the override values shown above.'
                : `Account defaults: ${accountExecutionGuardLabel}.`
            }}
          </p>
          <HyperliquidTargetTotalField
            v-if="selectedAccount"
            v-model="builderTargetTotalTenthsBps"
            :account="selectedAccount"
          />
        </template>
      </div>
      <div v-if="blocksOpeningOrder" class="text-xs text-error">
        {{ readinessWarning }}
      </div>
      <div v-else-if="exitLevelError" class="text-xs text-error">
        {{ exitLevelError }}
      </div>
      <HyperliquidPositionEffectPreview
        v-if="isHyperliquidAccount"
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
          form="market-order"
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
