<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  MarketAction,
  PositionSide,
  type MarketContext,
  type MarketOrderCommand,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { accountMetadataChips, isBybitMetadataVerified, useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'
import { useWsStore } from '@/stores/ws'

import type { MarketOrderPrefill } from './types'
import { createLogger } from '@/lib/utils'

const logger = createLogger('commands')

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{
  (e: 'submit', payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }>): void
  (e: 'close'): void
}>()

const accounts = useAccountsStore()
const modals = useModalStore()
const ws = useWsStore()

const selectedAccountId = ref<string>('')
const symbol = ref<string>('BTCUSDT')
const lastAccountId = ref<string>('')
const quantity_usd = ref<number | null>(null)
const position_side = ref<PositionSide>(PositionSide.Long)
const action = ref<MarketAction>(MarketAction.Open)
const take_profit = ref<number | null | ''>(null)
const stop_loss = ref<number | null | ''>(null)

const selectedMarketContext = computed<MarketContext | null>(() =>
  accounts.getMarketContextForAccount(selectedAccountId.value),
)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const selectedCapabilities = computed(() =>
  ws.capabilitiesForMarketContext(selectedMarketContext.value),
)
const blocksOpeningOrder = computed(
  () => action.value === MarketAction.Open && !isBybitMetadataVerified(selectedAccount.value),
)
const supportsAttachedExit = computed(
  () =>
    action.value === MarketAction.Open &&
    selectedCapabilities.value?.supports_attached_take_profit_stop_loss === true,
)

function requestSelectedCapabilities() {
  if (selectedMarketContext.value) {
    ws.requestMarketCapabilities(selectedMarketContext.value)
  }
}

function applyInitialValues() {
  const preset = (modals.modalValues['MarketOrder'] as MarketOrderPrefill) ?? {}
  selectedAccountId.value = accounts.selectedAccount?.id ?? ''
  symbol.value = preset.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  quantity_usd.value = preset.quantity_usd ?? 50
  position_side.value = preset.position_side ?? PositionSide.Long
  action.value = preset.action ?? MarketAction.Open
  take_profit.value = preset.take_profit ?? null
  stop_loss.value = preset.stop_loss ?? null
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
  const prevDefault = accounts.getDefaultSymbolForAccount(prev || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === prevDefault) {
    symbol.value = nextDefault
  }
  lastAccountId.value = next
  requestSelectedCapabilities()
})

watch(supportsAttachedExit, (supported) => {
  if (action.value !== MarketAction.Open || (selectedCapabilities.value && !supported)) {
    take_profit.value = null
    stop_loss.value = null
  }
})

function validate(): boolean {
  if (!selectedAccountId.value) return false
  if (blocksOpeningOrder.value) return false
  if (!symbol.value) return false
  if (quantity_usd.value === null || quantity_usd.value <= 0) return false
  const tp = optionalPositivePrice(take_profit.value)
  const sl = optionalPositivePrice(stop_loss.value)
  if (take_profit.value !== null && take_profit.value !== '' && tp === null) return false
  if (stop_loss.value !== null && stop_loss.value !== '' && sl === null) return false
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

  if (!validate()) {
    logger.error('Validation failed')
    return
  }

  const normalizedTakeProfit = optionalPositivePrice(take_profit.value)
  const normalizedStopLoss = optionalPositivePrice(stop_loss.value)
  const attachedExitPlan =
    supportsAttachedExit.value && (normalizedTakeProfit !== null || normalizedStopLoss !== null)
      ? {
          take_profit: normalizedTakeProfit,
          stop_loss: normalizedStopLoss,
        }
      : null

  const data: MarketOrderCommand = {
    market_context: marketContext,
    symbol: symbol.value,
    quantity_usd: quantity_usd.value!,
    position_side: position_side.value,
    action: action.value,
    attached_exit_plan: attachedExitPlan,
  }
  const payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }> = {
    kind: 'MarketOrder',
    data,
  }
  emit('submit', payload)
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
        <label class="field"><span>Symbol</span><input v-model="symbol" class="input" /></label>
        <label class="field">
          <span>Action</span>
          <select v-model="action" class="input">
            <option :value="MarketAction.Open">Open</option>
            <option :value="MarketAction.Close">Close</option>
          </select>
        </label>
        <label class="field">
          <span>USD Amount</span>
          <input type="number" v-model.number="quantity_usd" class="input" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="position_side" class="input">
            <option :value="PositionSide.Long">Long</option>
            <option :value="PositionSide.Short">Short</option>
          </select>
        </label>
        <template v-if="supportsAttachedExit">
          <label class="field">
            <span>Take Profit</span>
            <input type="number" v-model.number="take_profit" class="input" />
          </label>
          <label class="field">
            <span>Stop Loss</span>
            <input type="number" v-model.number="stop_loss" class="input" />
          </label>
        </template>
      </div>
      <div v-if="blocksOpeningOrder" class="text-xs text-error">
        Bybit metadata is unvalidated. Refresh credentials before opening live Bybit orders.
      </div>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button form="market-order" type="submit" class="btn btn-primary" :disabled="!validate()">
          Submit
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>
