<script setup lang="ts">
import type { ShapeMode } from '@/lib/engineCommands/form'

const mode = defineModel<ShapeMode>('mode', { required: true })
const targetChildNotional = defineModel<string>('targetChildNotional', { required: true })
const maxChildren = defineModel<string>('maxChildren', { required: true })
</script>

<template>
  <label class="field">
    <span>Execution Shape</span>
    <select v-model="mode" class="input">
      <option value="single">Single Order</option>
      <option value="split">Split Orders</option>
    </select>
  </label>
  <template v-if="mode === 'split'">
    <label class="field">
      <span>Target Child Notional</span>
      <input
        v-model="targetChildNotional"
        class="input"
        type="text"
        inputmode="decimal"
        placeholder="Exchange default"
      />
    </label>
    <label class="field">
      <span>Maximum Children</span>
      <input v-model="maxChildren" class="input" type="text" inputmode="numeric" />
    </label>
  </template>
</template>
