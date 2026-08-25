<script setup lang="ts">
import { computed } from 'vue'
import type { AccountRecord } from '@/stores/accounts'

const props = defineProps<{
  account: AccountRecord
  modelValue: number
}>()

const targetBps = computed(() => props.modelValue / 10)
const targetPercent = computed(() => props.modelValue / 1000)
</script>

<template>
  <div class="field col-span-2 border-t border-[var(--panel-border-inner)] pt-3">
    <span>Current all-in target / side</span>
    <div class="input flex items-center" aria-label="Current all-in target per side">
      {{ targetBps.toFixed(1) }} bps
    </div>
    <small>
      Estimated exchange fee + Trad builder fee = {{ targetBps.toFixed(1) }} bps ({{
        targetPercent.toFixed(3)
      }}%). This trade pins the administrator-set account policy when accepted.
    </small>
  </div>
</template>
