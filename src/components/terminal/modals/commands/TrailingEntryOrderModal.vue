<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  type TrailingEntryOrderCommand,
  type UserCommandPayload,
  PositionSide,
} from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'

import type { TrailingEntryPrefill } from './types'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })

const emit = defineEmits<{
  (e: 'submit', payload: Extract<UserCommandPayload, { kind: 'TrailingEntryOrder' }>): void
  (e: 'close'): void
}>()

const accounts = useAccountsStore()
const modals = useModalStore()

const selectedAccountId = ref<string>('')
const symbol = ref<string>('BTCUSDT')
const activation_price = ref<number | null>(null)
const jump_frac_threshold = ref<number | null>(null)
const stop_loss = ref<number | null>(null)
const risk_amount = ref<number | null>(null)
const position_side = ref<PositionSide>(PositionSide.Long)

function applyInitialValues() {
  const preset = (modals.modalValues['TrailingEntryOrder'] as TrailingEntryPrefill) ?? {}
  activation_price.value = preset.activation_price ?? null
  jump_frac_threshold.value = preset.jump_frac_threshold ?? null
  position_side.value = preset.position_side ?? PositionSide.Long
  risk_amount.value = preset.risk_amount ?? null
  stop_loss.value = preset.stop_loss ?? null
  symbol.value = preset.symbol ?? 'BTCUSDT'
}

watch(
  () => props.open,
  (o) => {
    if (o) applyInitialValues()
  },
)

applyInitialValues()

function validate(): boolean {
  if (!selectedAccountId.value) return false
  if (!symbol.value) return false
  if (activation_price.value === null) return false
  if (jump_frac_threshold.value === null) return false
  if (stop_loss.value === null) return false
  if (risk_amount.value === null) return false
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
  const data: TrailingEntryOrderCommand = {
    activation_price: activation_price.value as number,
    jump_frac_threshold: jump_frac_threshold.value as number,
    market_context: marketContext,
    position_side: position_side.value,
    risk_amount: risk_amount.value as number,
    stop_loss: stop_loss.value as number,
    symbol: symbol.value,
  }
  const payload: Extract<UserCommandPayload, { kind: 'TrailingEntryOrder' }> = {
    kind: 'TrailingEntryOrder',
    data,
  }
  emit('submit', payload)
}
</script>
<template>
  <BaseCommandModal title="Trailing Entry" :open="open" @close="emit('close')">
    <form id="trailing-entry" class="space-y-4" @submit.prevent="submit">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="field">
          <span>Account</span>
          <select v-model="selectedAccountId" class="input">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} ({{ account.exchange }} - {{ account.network }})
            </option>
          </select>
        </label>
        <label class="field">
          <span>Symbol</span>
          <input type="text" v-model="symbol" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="position_side">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
        <label class="field">
          <span>Activation Price</span>
          <input type="number" v-model.number="activation_price" />
        </label>
        <label class="field">
          <span>Jump Frac Threshold</span>
          <input type="number" step="0.0001" v-model.number="jump_frac_threshold" />
        </label>
        <label class="field">
          <span>Stop Loss</span><input type="number" v-model.number="stop_loss" />
        </label>
        <label class="field">
          <span>Risk Amount</span><input type="number" v-model.number="risk_amount" />
        </label>
      </div>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button form="trailing-entry" type="submit" class="btn btn-primary">Submit</button>
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
</style>
