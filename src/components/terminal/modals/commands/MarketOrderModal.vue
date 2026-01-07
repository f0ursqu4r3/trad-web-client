<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  MarketAction,
  PositionSide,
  type MarketOrderCommand,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'

import type { MarketOrderPrefill } from './types'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{
  (e: 'submit', payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }>): void
  (e: 'close'): void
}>()

const accounts = useAccountsStore()
const modals = useModalStore()

const selectedAccountId = ref<string>('')
const symbol = ref<string>('BTCUSDT')
const lastAccountId = ref<string>('')
const quantity_usd = ref<number | null>(null)
const position_side = ref<PositionSide>(PositionSide.Long)
const action = ref<MarketAction>(MarketAction.Open)

function applyInitialValues() {
  const preset = (modals.modalValues['MarketOrder'] as MarketOrderPrefill) ?? {}
  selectedAccountId.value = accounts.selectedAccount?.id ?? ''
  symbol.value = preset.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  quantity_usd.value = preset.quantity_usd ?? 50
  position_side.value = preset.position_side ?? PositionSide.Long
  action.value = preset.action ?? MarketAction.Open
}

watch(
  () => props.open,
  (o) => {
    if (o) applyInitialValues()
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
})

function validate(): boolean {
  if (!selectedAccountId.value) return false
  if (!symbol.value) return false
  if (quantity_usd.value === null || quantity_usd.value <= 0) return false
  return true
}

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) {
    console.error('No market context found for account', selectedAccountId.value)
    return
  }

  if (!validate()) {
    console.error('Validation failed')
    return
  }

  const data: MarketOrderCommand = {
    market_context: marketContext,
    symbol: symbol.value,
    quantity_usd: quantity_usd.value!,
    position_side: position_side.value,
    action: action.value,
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
              {{ account.label }} ({{ account.exchange }} - {{ account.network }})
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
