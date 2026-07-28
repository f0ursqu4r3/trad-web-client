<script setup lang="ts">
import { computed } from 'vue'
import type { HyperliquidPositionEffectPreviewData } from '@/lib/ws/protocol'

const props = defineProps<{
  preview: HyperliquidPositionEffectPreviewData | null
  error?: string | null
  pending?: boolean
  confirmed?: boolean
}>()
const emit = defineEmits<{ (event: 'update:confirmed', value: boolean): void }>()

const effectLabel = computed(() => {
  const effect = props.preview?.effect
  if (!effect) return ''
  return effect.charAt(0).toUpperCase() + effect.slice(1)
})

function signedQuantity(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString(undefined, { maximumFractionDigits: 8 })}`
}

function observedAt(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString()
}
</script>

<template>
  <section
    class="border border-[var(--border-color)] p-2 text-[11px]"
    aria-label="Hyperliquid position effect"
  >
    <div class="flex items-center justify-between gap-3">
      <span class="uppercase text-[var(--color-text-dim)]">Position effect</span>
      <span v-if="pending" class="text-[var(--color-text-dim)]">Checking...</span>
      <strong v-else-if="preview" :class="preview.blocked_reason ? 'text-error' : ''">
        {{ effectLabel }}
      </strong>
      <span v-else class="text-[var(--color-text-dim)]">Enter valid order details</span>
    </div>
    <template v-if="preview">
      <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <span class="text-[var(--color-text-dim)]">Current signed position</span>
        <span class="text-right font-mono">{{ signedQuantity(preview.current_signed_quantity) }}</span>
        <span class="text-[var(--color-text-dim)]">Expected after fill</span>
        <span class="text-right font-mono">{{ signedQuantity(preview.expected_signed_quantity) }}</span>
        <span class="text-[var(--color-text-dim)]">Requested base quantity</span>
        <span class="text-right font-mono">{{ preview.requested_base_quantity }}</span>
        <span class="text-[var(--color-text-dim)]">Trad-owned, current side</span>
        <span class="text-right font-mono">{{ preview.owned_same_side_quantity }}</span>
        <span class="text-[var(--color-text-dim)]">External / unattributed</span>
        <span class="text-right font-mono">{{ preview.external_same_side_quantity }}</span>
        <span class="text-[var(--color-text-dim)]">Observed</span>
        <span class="text-right font-mono">{{ observedAt(preview.observed_at) }}</span>
        <span v-if="preview.affected_owner_count" class="text-[var(--color-text-dim)]">
          Affected Trad owners
        </span>
        <span v-if="preview.affected_owner_count" class="text-right font-mono">
          {{ preview.affected_owner_count }}
        </span>
      </div>
      <p v-if="preview.blocked_reason" class="mb-0 mt-2 text-error">
        {{ preview.blocked_reason }}
      </p>
      <label
        v-else-if="preview.requires_new_confirmation"
        class="mt-2 flex items-start gap-2 border-t border-[var(--border-color)] pt-2"
      >
        <input
          type="checkbox"
          :checked="confirmed"
          @change="emit('update:confirmed', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          Confirm {{ effectLabel.toLowerCase() }} from
          {{ signedQuantity(preview.current_signed_quantity) }} to
          {{ signedQuantity(preview.expected_signed_quantity) }}.
        </span>
      </label>
    </template>
    <p v-if="error" class="mb-0 mt-2 text-error">{{ error }}</p>
  </section>
</template>
