<script setup lang="ts">
import type { ShapeMode } from '@/lib/engineCommands/form'
import { computed } from 'vue'
import FormField from '@/components/forms/FormField.vue'
import { decimalError, integerError } from '@/lib/formValidation'

const mode = defineModel<ShapeMode>('mode', { required: true })
const targetChildNotional = defineModel<string>('targetChildNotional', { required: true })
const maxChildren = defineModel<string>('maxChildren', { required: true })
const targetError = computed(() =>
  mode.value === 'split'
    ? decimalError(targetChildNotional.value, 'target child notional', { optional: true })
    : null,
)
const childrenError = computed(() =>
  mode.value === 'split' ? integerError(maxChildren.value, 'Maximum children', 1, 50) : null,
)
</script>

<template>
  <FormField
    label="Execution Shape"
    help="Single submits one exchange order. Split divides the requested size into bounded child orders."
    required
  >
    <select v-model="mode" class="input">
      <option value="single">Single Order</option>
      <option value="split">Split Orders</option>
    </select>
  </FormField>
  <template v-if="mode === 'split'">
    <FormField
      label="Target Child Notional"
      help="Preferred quote value for each child. Leave blank to let Trad choose from exchange rules."
      :error="targetError"
      optional
    >
      <input
        v-model="targetChildNotional"
        class="input"
        type="text"
        inputmode="decimal"
        placeholder="Exchange default"
      />
    </FormField>
    <FormField
      label="Maximum Children"
      help="Hard safety cap on child orders created by this command, from 1 to 50."
      :error="childrenError"
      required
    >
      <input v-model="maxChildren" class="input" type="text" inputmode="numeric" />
    </FormField>
  </template>
</template>
