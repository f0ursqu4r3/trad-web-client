<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { PositionSide, MarketAction } from '@/lib/ws/protocol'
import { accountMetadataChips, useAccountsStore } from '@/stores/accounts'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()
const accounts = useAccountsStore()

const selectedAccountId = ref<string>(accounts.selectedAccount?.id || '')
const lastAccountId = ref<string>('')

const symbol = ref(accounts.getDefaultSymbolForAccount(selectedAccountId.value))
const action = ref<MarketAction>(MarketAction.Open)
const quantity_usd = ref(100)
const position_side = ref<PositionSide>(PositionSide.Long)
const num_splits = ref(4)
const standaloneSplitAvailable = false

function reset() {
  selectedAccountId.value = accounts.selectedAccount?.id || ''
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  lastAccountId.value = selectedAccountId.value
  action.value = MarketAction.Open
  quantity_usd.value = 100
  position_side.value = PositionSide.Long
  num_splits.value = 4
}
watch(
  () => props.open,
  (o) => {
    if (o) reset()
  },
)

watch(selectedAccountId, (next, prev) => {
  const prevDefault = accounts.getDefaultSymbolForAccount(prev || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === prevDefault) {
    symbol.value = nextDefault
  }
  lastAccountId.value = next
})

function submit() {
  if (!standaloneSplitAvailable) return
}
</script>
<template>
  <BaseCommandModal title="Split Market Order" :open="open" @close="emit('close')">
    <form id="split-market-order" class="space-y-4" @submit.prevent="submit">
      <fieldset class="grid gap-3 md:grid-cols-2" :disabled="!standaloneSplitAvailable">
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
            <option>Buy</option>
            <option>Sell</option>
            <option>Close</option>
            <option>CloseAll</option>
          </select>
        </label>
        <label class="field">
          <span>USD Qty (total)</span>
          <input type="number" v-model.number="quantity_usd" class="input" />
        </label>
        <label class="field">
          <span>Splits</span>
          <input type="number" min="2" max="50" v-model.number="num_splits" class="input" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="position_side" class="input">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
      </fieldset>
      <p class="text-[11px] text-[var(--color-text-dim)] leading-relaxed">
        Standalone split orders are not available yet. Use Trailing Entry split settings for
        split market entry.
      </p>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button
          form="split-market-order"
          type="submit"
          class="btn btn-primary"
          :disabled="!standaloneSplitAvailable"
        >
          Submit
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>
