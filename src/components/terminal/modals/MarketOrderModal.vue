<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import type {
  MarketAction,
  MarketOrderCommand,
  UserCommandPayload,
  PositionSide,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()

const symbol = ref('BTCUSDT')
const action = ref<MarketAction>('Buy')
const qtyUsd = ref(50)
const posSide = ref<PositionSide>('Long')

function reset() {
  symbol.value = 'BTCUSDT'
  action.value = 'Buy'
  qtyUsd.value = 50
  posSide.value = 'Long'
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
  },
)

function submit() {
  const data: MarketOrderCommand = {
    action: action.value,
    symbol: symbol.value,
    quantity_usd: qtyUsd.value,
    position_side: posSide.value,
  }
  const payload: Extract<UserCommandPayload, { kind: 'MarketOrder' }> = {
    kind: 'MarketOrder',
    data,
  }
  ws.sendUserCommand(
    payload,
    `/market ${data.action} ${data.symbol} ${data.quantity_usd} ${data.position_side}`,
  )
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Market Order" :open="open" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <label class="field"><span>Symbol</span><input v-model="symbol" class="input" /></label>
        <label class="field"
          ><span>Action</span>
          <select v-model="action" class="input">
            <option>Buy</option>
            <option>Sell</option>
            <option>Close</option>
            <option>CloseAll</option>
          </select>
        </label>
        <label class="field"
          ><span>USD Qty</span><input type="number" v-model.number="qtyUsd" class="input"
        /></label>
        <label class="field"
          ><span>Position Side</span>
          <select v-model="posSide" class="input">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2">
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary btn-sm">Submit</button>
      </div>
    </form>
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
