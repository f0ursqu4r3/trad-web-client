<script setup lang="ts">
import { computed } from 'vue'
import {
  HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS,
  hyperliquidTargetTotalTenthsBps,
} from '@/lib/accountMetadata'
import type { AccountRecord } from '@/stores/accounts'

const props = defineProps<{
  account: AccountRecord
  modelValue: number
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>()

const canEdit = computed(() => props.account.exchange_metadata?.builder_fee_manager === true)
const targetBps = computed(() => props.modelValue / 10)
const targetPercent = computed(() => props.modelValue / 1000)

function update(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  emit(
    'update:modelValue',
    Math.max(0, Math.min(HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS, Math.round(value * 10))),
  )
}
</script>

<template>
  <div class="field col-span-2 border-t border-[var(--panel-border-inner)] pt-3">
    <span>Target total cost / side</span>
    <input
      v-if="canEdit"
      class="input"
      type="number"
      min="0"
      :max="HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS / 10"
      step="0.1"
      :value="targetBps"
      aria-label="Target total cost per side in basis points"
      @input="update"
    />
    <div v-else class="input flex items-center" aria-label="Target total cost per side">
      {{ targetBps.toFixed(1) }} bps
    </div>
    <small>
      Exchange fee + Trad builder fee = {{ targetBps.toFixed(1) }} bps ({{
        targetPercent.toFixed(3)
      }}%). Trad computes the builder fee from the live account fee tier when the order is submitted.
    </small>
    <small v-if="canEdit">
      Fee-manager access is enabled. This order may override the account default of
      {{ (hyperliquidTargetTotalTenthsBps(account.exchange_metadata) / 10).toFixed(1) }} bps.
    </small>
  </div>
</template>
