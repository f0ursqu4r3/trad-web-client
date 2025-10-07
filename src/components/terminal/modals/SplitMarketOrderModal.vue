<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import type {
  SplitMarketOrderCommand,
  UserCommandPayload,
  MarketAction,
  PositionSide,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()
const ws = useWsStore()

const symbol = ref('BTCUSDT')
const action = ref<MarketAction>('Buy')
const quantity_usd = ref(100)
const position_side = ref<PositionSide>('Long')
const num_splits = ref(4)

function reset() {
  action.value = 'Buy'
  quantity_usd.value = 100
  position_side.value = 'Long'
  num_splits.value = 4
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
  },
)

function submit() {
  const data: SplitMarketOrderCommand = {
    num_splits: num_splits.value,
    action: action.value,
    symbol: symbol.value,
    quantity_usd: quantity_usd.value,
    position_side: position_side.value,
  }
  const payload: Extract<UserCommandPayload, { kind: 'SplitMarketOrder' }> = {
    kind: 'SplitMarketOrder',
    data,
  }
  ws.sendUserCommand(
    payload,
    `/split_market ${data.action} ${data.symbol} ${data.quantity_usd} x${data.num_splits}`,
  )
  emit('close')
}
</script>
<template>
  <BaseCommandModal title="Split Market Order" :open="open" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <div class="grid gap-3 md:grid-cols-2">
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
          ><span>USD Qty (total)</span
          ><input type="number" v-model.number="quantity_usd" class="input"
        /></label>
        <label class="field"
          ><span>Splits</span
          ><input type="number" min="2" max="50" v-model.number="num_splits" class="input"
        /></label>
        <label class="field"
          ><span>Position Side</span>
          <select v-model="position_side" class="input">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
      </div>
      <div class="flex gap-2 justify-end pt-2">
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
