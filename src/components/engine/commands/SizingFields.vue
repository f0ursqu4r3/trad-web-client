<script setup lang="ts">
import type { SizingMode } from '@/lib/engineCommands/form'
import { labelWithUnit } from '@/lib/engineCommands/marketUnits'
import FormField from '@/components/forms/FormField.vue'
import { decimalError } from '@/lib/formValidation'
import { computed } from 'vue'

const mode = defineModel<SizingMode>('mode', { required: true })
const amount = defineModel<string>('amount', { required: true })
const props = defineProps<{ baseAsset?: string | null; quoteAsset?: string | null }>()
const amountError = computed(() => decimalError(amount.value, inputLabel(mode.value).toLowerCase()))

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

function inputLabel(kind: SizingMode): string {
  if (kind === 'base') return 'Base Quantity'
  if (kind === 'risk_at_stop') return 'Risk Amount'
  return 'Quote Amount'
}
</script>

<template>
  <FormField
    label="Amount Type"
    help="Choose whether the order size is entered as quote value, base quantity, or risk at the attached stop."
    required
  >
    <select v-model="mode" class="input">
      <option value="quote_notional">{{ sizingLabel('quote_notional') }}</option>
      <option value="base">{{ sizingLabel('base') }}</option>
      <option value="risk_at_stop">{{ sizingLabel('risk_at_stop') }}</option>
    </select>
  </FormField>
  <FormField
    :label="sizingLabel(mode)"
    :help="
      mode === 'risk_at_stop'
        ? 'Maximum quote-currency loss at the attached stop. A stop loss is required.'
        : mode === 'base'
          ? 'Exact quantity of the base asset to trade.'
          : 'Total quote-currency value to trade.'
    "
    :error="amountError"
    required
  >
    <input
      v-model="amount"
      class="input"
      :aria-label="inputLabel(mode)"
      :aria-description="
        mode === 'base'
          ? baseAsset
            ? 'Denominated in ' + baseAsset
            : undefined
          : quoteAsset
            ? 'Denominated in ' + quoteAsset
            : undefined
      "
      type="text"
      inputmode="decimal"
      autocomplete="off"
      placeholder="0.00"
    />
  </FormField>
</template>
