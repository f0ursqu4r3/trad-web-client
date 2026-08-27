<script setup lang="ts">
import { computed } from 'vue'

import ExecutionPreviewPanel from '@/components/engine/commands/ExecutionPreviewPanel.vue'
import type { BrowserPreviewIntent } from '@/lib/gateway'
import {
  formatExecutionGuardPercent,
  resolveHyperliquidExecutionGuards,
} from '@/lib/hyperliquidExecutionGuards'
import type { AccountRecord } from '@/stores/accounts'

const props = defineProps<{
  account: AccountRecord | null
  accountId: string
  intent: BrowserPreviewIntent | null
  quoteAsset: string | null
  actionAttemptId?: string | null
}>()
const emit = defineEmits<{
  (event: 'ready', value: boolean): void
  (event: 'status', value: 'idle' | 'planning' | 'ready' | 'rejected'): void
}>()

const target = computed(() => props.account?.exchange_metadata?.builder_target_total_tenths_bps)
const approval = computed(() => props.account?.exchange_metadata?.max_builder_fee_tenths_bps)
const entryGuard = computed(
  () => resolveHyperliquidExecutionGuards(props.account?.exchange_metadata).entry_market_tenths_bps,
)

function bps(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Server policy' : `${(value / 10).toFixed(1)} bps`
}
</script>

<template>
  <section class="ticket-policy">
    <div class="policy-grid">
      <span>Entry market guard</span>
      <strong>{{ formatExecutionGuardPercent(entryGuard) }}</strong>
      <span>Current all-in target / side</span>
      <strong>{{ bps(target) }}</strong>
      <span>Venue + builder split</span>
      <strong>Resolved from live fee tier</strong>
      <span>Wallet approval ceiling</span>
      <strong>{{ bps(approval) }}</strong>
    </div>
    <p>
      Trad targets the configured all-in cost. The exchange fee is charged first; only the remainder
      is sent to the Trad builder, never above the wallet-approved ceiling.
    </p>
  </section>

  <ExecutionPreviewPanel
    compact
    :account-id="accountId"
    :intent="intent"
    :active="true"
    :quote-asset="quoteAsset"
    :action-attempt-id="actionAttemptId"
    @update:ready="emit('ready', $event)"
    @update:status="emit('status', $event)"
  />
</template>

<style scoped>
.ticket-policy {
  padding: 0.7rem;
  border: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
}
.policy-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.28rem 0.75rem;
}
.policy-grid span {
  color: var(--fg-muted);
  font-size: 10px;
}
.policy-grid strong {
  color: var(--fg);
  font-size: 10px;
  font-weight: 500;
  text-align: right;
}
.ticket-policy p {
  margin: 0.6rem 0 0;
  color: var(--fg-muted);
  font-size: 10px;
  line-height: 1.45;
}
</style>
