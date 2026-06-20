<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  ExchangeType,
  type MarketContext,
  PositionSide,
  type LimitOrderCommand,
  type UserCommandPayload,
  OrderSide,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import { accountMetadataChips, useAccountsStore } from '@/stores/accounts'
import { createLogger } from '@/lib/utils'
import { normalizeBybitUsdtSymbol } from '@/lib/bybitOrderValidation'

const logger = createLogger('commands')

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()
const accounts = useAccountsStore()

const selectedAccountId = ref<string>(accounts.selectedAccount?.id || '')
const symbol = ref(accounts.getDefaultSymbolForAccount(selectedAccountId.value))
const lastAccountId = ref<string>('')
const side = ref<OrderSide>(OrderSide.Buy)
const quantity = ref(0.001)
const price = ref(58000)
const posSide = ref<PositionSide>(PositionSide.Long)

const selectedMarketContext = computed<MarketContext | null>(() =>
  accounts.getMarketContextForAccount(selectedAccountId.value),
)
const supportsLimitOrders = computed(() => {
  const capabilities = ws.capabilitiesForMarketContext(selectedMarketContext.value)
  return capabilities?.supports_limit_orders === true
})
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)

function requestSelectedCapabilities() {
  if (selectedMarketContext.value) {
    ws.requestMarketCapabilities(selectedMarketContext.value)
  }
}

function reset() {
  selectedAccountId.value = accounts.selectedAccount?.id || ''
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  side.value = OrderSide.Buy
  quantity.value = 0.001
  price.value = 58000
  posSide.value = PositionSide.Long
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
    if (o) requestSelectedCapabilities()
  },
)

watch(selectedAccountId, (next, prev) => {
  const prevDefault = accounts.getDefaultSymbolForAccount(prev || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === prevDefault) {
    symbol.value = nextDefault
  }
  lastAccountId.value = next
  requestSelectedCapabilities()
})

function validate(): boolean {
  if (!supportsLimitOrders.value) return false
  if (!selectedAccountId.value) return false
  if (!symbol.value.trim()) return false
  if (!Number.isFinite(quantity.value) || quantity.value <= 0) return false
  if (!Number.isFinite(price.value) || price.value <= 0) return false
  return true
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
  const data: LimitOrderCommand = {
    side: side.value,
    symbol:
      selectedAccount.value?.exchange === ExchangeType.Bybit
        ? normalizeBybitUsdtSymbol(symbol.value)
        : symbol.value,
    quantity: quantity.value,
    price: price.value,
    position_side: posSide.value,
    market_context: marketContext,
  }
  const payload: Extract<UserCommandPayload, { kind: 'LimitOrder' }> = { kind: 'LimitOrder', data }
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
          <span>Side</span>
          <select v-model="side" class="input">
            <option>Buy</option>
            <option>Sell</option>
          </select>
        </label>
        <label class="field">
          <span>Qty</span>
          <input type="number" step="0.000001" v-model.number="quantity" class="input" />
        </label>
        <label class="field">
          <span>Price</span>
          <input type="number" v-model.number="price" class="input" />
        </label>
        <label class="field col-span-2">
          <span>Position Side</span>
          <select v-model="posSide" class="input">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
      </div>
      <p v-if="!supportsLimitOrders" class="text-[11px] text-[var(--color-text-dim)]">
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
