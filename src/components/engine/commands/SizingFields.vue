<script setup lang="ts">
import type { SizingMode } from '@/lib/engineCommands/form'
import { labelWithUnit } from '@/lib/engineCommands/marketUnits'

const mode = defineModel<SizingMode>('mode', { required: true })
const amount = defineModel<string>('amount', { required: true })
const props = defineProps<{ baseAsset?: string | null; quoteAsset?: string | null }>()

function sizingLabel(kind: SizingMode): string {
  switch (kind) {
    case 'base':
      return labelWithUnit('Base Quantity', props.baseAsset)
    case 'risk_at_stop':
      return labelWithUnit('Risk at Stop', props.quoteAsset)
    case 'quote_notional':
      return labelWithUnit('Quote Notional', props.quoteAsset)
  }
}
</script>

<template>
  <label class="field">
    <span>Amount Type</span>
    <select v-model="mode" class="input">
      <option value="quote_notional">{{ sizingLabel('quote_notional') }}</option>
      <option value="base">{{ sizingLabel('base') }}</option>
      <option value="risk_at_stop">{{ sizingLabel('risk_at_stop') }}</option>
    </select>
  </label>
  <label class="field">
    <span>{{ sizingLabel(mode) }}</span>
    <input
      v-model="amount"
      class="input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      placeholder="0.00"
    />
  </label>
</template>
