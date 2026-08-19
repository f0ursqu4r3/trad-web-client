<script setup lang="ts">
import { CircleHelp } from 'lucide-vue-next'

defineProps<{
  label?: string
  help?: string
  hint?: string
  error?: string | null
  required?: boolean
  optional?: boolean
}>()
</script>

<template>
  <label class="field form-field" :class="{ 'form-field-invalid': error }">
    <span class="form-field-heading" :title="help">
      <span
        ><slot name="label">{{ label }}</slot></span
      >
      <span v-if="required" class="form-field-required" aria-label="required">required</span>
      <span v-else-if="optional" class="form-field-optional">optional</span>
      <span v-if="help" class="form-field-help" :title="help" aria-hidden="true">
        <CircleHelp :size="12" />
      </span>
    </span>
    <slot />
    <small v-if="error" class="field-error" role="alert">{{ error }}</small>
    <small v-else-if="hint" class="field-hint">{{ hint }}</small>
  </label>
</template>
