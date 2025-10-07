<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import type {
  LimitOrderCommand,
  UserCommandPayload,
  OrderSide,
  PositionSide,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()

const symbol = ref('BTCUSDT')
const side = ref<OrderSide>('Buy')
const quantity = ref(0.001)
const price = ref(58000)
const posSide = ref<PositionSide>('Long')

function reset() {
  symbol.value = 'BTCUSDT'
  side.value = 'Buy'
  quantity.value = 0.001
  price.value = 58000
  posSide.value = 'Long'
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
  },
)

function submit() {
  const data: LimitOrderCommand = {
    side: side.value,
    symbol: symbol.value,
    quantity: quantity.value,
    price: price.value,
    position_side: posSide.value,
  }
  const payload: Extract<UserCommandPayload, { kind: 'LimitOrder' }> = { kind: 'LimitOrder', data }
  ws.sendUserCommand(
    payload,
    `/limit ${data.side} ${data.symbol} ${data.quantity} @ ${data.price} ${data.position_side}`,
  )
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Limit Order" :open="open" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <label class="field"><span>Symbol</span><input v-model="symbol" class="input" /></label>
        <label class="field"
          ><span>Side</span>
          <select v-model="side" class="input">
            <option>Buy</option>
            <option>Sell</option>
          </select>
        </label>
        <label class="field"
          ><span>Qty</span
          ><input type="number" step="0.000001" v-model.number="quantity" class="input"
        /></label>
        <label class="field"
          ><span>Price</span><input type="number" v-model.number="price" class="input"
        /></label>
        <label class="field col-span-2"
          ><span>Position Side</span>
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
