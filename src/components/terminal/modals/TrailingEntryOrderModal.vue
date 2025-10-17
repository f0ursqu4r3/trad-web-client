<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import type { TrailingEntryOrderCommand, UserCommandPayload, PositionSide } from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import { useAccountsStore } from '@/stores/accounts'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()
const ws = useWsStore()
const accounts = useAccountsStore()

const selectedAccountId = ref<string>(accounts.selectedAccount?.id || '')
const symbol = ref('BTCUSDT')
const activation_price = ref(58000)
const jump_frac_threshold = ref(0.002)
const stop_loss = ref(57000)
const risk_amount = ref(50)
const position_side = ref<PositionSide>('Long')

function reset() {
  selectedAccountId.value = accounts.selectedAccount?.id || ''
  activation_price.value = 58000
  jump_frac_threshold.value = 0.002
  stop_loss.value = 57000
  risk_amount.value = 50
  position_side.value = 'Long'
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
  },
)

function submit() {
  console.log('Submitting trailing entry order')
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) {
    console.error('No market context found for account', selectedAccountId.value)
    return
  }
  const data: TrailingEntryOrderCommand = {
    position_side: position_side.value,
    symbol: symbol.value,
    activation_price: activation_price.value,
    jump_frac_threshold: jump_frac_threshold.value,
    stop_loss: stop_loss.value,
    risk_amount: risk_amount.value,
    market_context: marketContext,
  }
  const payload: Extract<UserCommandPayload, { kind: 'TrailingEntryOrder' }> = {
    kind: 'TrailingEntryOrder',
    data,
  }
  ws.sendUserCommand(payload, `/trailing ${data.symbol}`)
  emit('close')
}
</script>
<template>
  <BaseCommandModal title="Trailing Entry" :open="open" @close="emit('close')">
    <form name="trailing-entry" class="space-y-4" @submit.prevent="submit">
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
