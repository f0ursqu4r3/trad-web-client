<script setup lang="ts">
import type { SizingMode } from '@/lib/engineCommands/form'

const mode = defineModel<SizingMode>('mode', { required: true })
const amount = defineModel<string>('amount', { required: true })
</script>

<template>
  <label class="field">
    <span>Amount Type</span>
    <select v-model="mode" class="input">
      <option value="quote_notional">Quote Notional</option>
      <option value="base">Base Quantity</option>
      <option value="risk_at_stop">Risk At Stop</option>
    </select>
  </label>
  <label class="field">
    <span>{{
      mode === 'base' ? 'Base Quantity' : mode === 'risk_at_stop' ? 'Risk Amount' : 'Quote Amount'
    }}</span>
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
