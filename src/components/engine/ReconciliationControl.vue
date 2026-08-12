<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const projections = useAccountProjectionStore()

const accountId = computed(() => accounts.selectedAccountId)
const summary = computed(() => projections.selectedLive?.checkpoint.summary ?? null)
const request = computed(() => {
  const selected = accountId.value
  return selected === null ? null : (gateway.reconciliationRefreshByAccount[selected] ?? null)
})
const phase = computed(() => {
  if (projections.selected?.status !== 'ready') return 'unavailable'
  if (request.value?.error !== null && request.value?.error !== undefined) return 'failed'
  if (request.value !== null && request.value.cycleId === null) return 'submitting'
  if (
    request.value?.cycleId !== null &&
    request.value?.cycleId !== undefined &&
    summary.value?.reconciliation_cycle_id !== request.value.cycleId
  ) {
    return 'queued'
  }
  return summary.value?.reconciliation_status ?? 'unknown'
})
const label = computed(() => {
  switch (phase.value) {
    case 'submitting':
      return 'requesting'
    case 'queued':
      return 'queued'
    case 'reconciling':
      return 'reconciling'
    case 'ready':
      return 'reconciled'
    case 'failed':
      return 'reconcile failed'
    case 'unavailable':
      return 'sync unavailable'
    case 'never_reconciled':
      return 'not reconciled'
    default:
      return phase.value
  }
})
const busy = computed(() => ['submitting', 'queued', 'reconciling'].includes(phase.value))
const disabled = computed(
  () => accountId.value === null || gateway.status !== 'ready' || busy.value,
)
const title = computed(() => {
  if (request.value?.error !== null && request.value?.error !== undefined) {
    return request.value.error
  }
  const cycle = summary.value?.reconciliation_cycle_id
  return cycle === null || cycle === undefined
    ? 'Refresh authoritative exchange state'
    : `Reconciliation cycle ${cycle}`
})

async function refresh(): Promise<void> {
  try {
    await gateway.refreshReconciliation()
  } catch {
    // The store retains the actionable failure for the account control.
  }
}
</script>

<template>
  <div class="reconciliation-control" :title="title" data-testid="reconciliation-control">
    <span class="reconciliation-state" :data-phase="phase">{{ label }}</span>
    <button
      class="btn btn-xs btn-neutral refresh-button"
      type="button"
      :disabled="disabled"
      title="Refresh authoritative exchange state"
      aria-label="Refresh authoritative exchange state"
      data-testid="refresh-reconciliation"
      @click="refresh"
    >
      <RefreshCw :size="12" :class="{ spinning: busy }" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.reconciliation-control {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.reconciliation-state {
  overflow: hidden;
  max-width: 132px;
  color: var(--fg-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.reconciliation-state[data-phase='ready'] {
  color: var(--status-success, #53d18b);
}

.reconciliation-state[data-phase='failed'] {
  color: var(--status-danger, #ff6b76);
}

.reconciliation-state[data-phase='reconciling'],
.reconciliation-state[data-phase='queued'],
.reconciliation-state[data-phase='submitting'] {
  color: var(--status-warning, #f1b84b);
}

.refresh-button {
  width: 22px;
  height: 20px;
  justify-content: center;
  padding: 0;
}

.spinning {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
