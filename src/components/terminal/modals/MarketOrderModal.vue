<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import {
  MarketAction,
  PositionSide,
  type MarketOrderCommand,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import { useAccountsStore } from '@/stores/accounts'

const accounts = useAccountsStore()

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()

const selectedAccountId = ref<string>(accounts.selectedAccount?.id || '')
const symbol = ref('BTCUSDT')
const action = ref<MarketAction>(MarketAction.Buy)
const qtyUsd = ref(50)
const posSide = ref<PositionSide>(PositionSide.Long)

function reset() {
  symbol.value = 'BTCUSDT'
  action.value = MarketAction.Buy
  qtyUsd.value = 50
  posSide.value = PositionSide.Long
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
  },
)

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) {
    console.error('No market context found for account', selectedAccountId.value)
    return
  }
  const data: MarketOrderCommand = {
    action: action.value,
    symbol: symbol.value,
    quantity_usd: qtyUsd.value,
    position_side: posSide.value,
    market_context: marketContext,
  }
  const payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }> = {
    kind: 'MarketOrder',
    data,
  }
  ws.sendUserCommand(payload)
  emit('close')
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
              {{ account.label }} ({{ account.exchange }} - {{ account.network }})
            </option>
          </select>
        </label>
        <label class="field"><span>Symbol</span><input v-model="symbol" class="input" /></label>
        <label class="field">
          <span>Action</span>
          <select v-model="action" class="input">
            <option>Buy</option>
            <option>Sell</option>
            <option>Close</option>
            <option>CloseAll</option>
          </select>
        </label>
        <label class="field">
          <span>USD Qty</span>
          <input type="number" v-model.number="qtyUsd" class="input" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="posSide" class="input">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
      </div>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button form="market-order" type="submit" class="btn btn-primary">Submit</button>
      </div>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 12px;
}
.field > span {
  color: var(--color-text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.input {
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-size: 12px;
  color: var(--color-text);
}
.input:focus {
  outline: 1px solid var(--accent-color);
  outline-offset: 1px;
}
</style>
