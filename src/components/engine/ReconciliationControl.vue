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
  const projection = projections.selected
  if (projection?.status !== 'ready') {
    if (projection?.failure === 'authorization') return 'authorization_failed'
    if (projection?.failure === 'resync') return 'resync_failed'
    return 'unavailable'
  }
  if (request.value?.error !== null && request.value?.error !== undefined) return 'failed'
  if (request.value !== null && request.value.cycleId === null) return 'submitting'
  if (
    request.value?.cycleId !== null &&
    request.value?.cycleId !== undefined &&
    summary.value?.reconciliation_cycle_id !== request.value.cycleId
  ) {
    return 'queued'
  }
  const status = summary.value?.reconciliation_status ?? 'unknown'
  if (status === 'ready' && summary.value?.reconciliation_ready === false) return 'blocked'
  return status
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
    case 'blocked':
      return 'sync blocked'
    case 'failed':
      return 'reconcile failed'
    case 'authorization_failed':
      return 'access denied'
    case 'resync_failed':
      return 'resync failed'
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
  if (projections.selected?.status !== 'ready' && projections.selected?.error !== null) {
    return projections.selected?.error ?? 'Account projection is unavailable'
  }
  if (request.value?.error !== null && request.value?.error !== undefined) {
    return request.value.error
  }
  if (phase.value === 'blocked') {
    const current = summary.value
    if (current === null) return 'Account reconciliation is not ready for new exposure'
    const reasons = [
      !current.position_inventory_ready ? 'position inventory is not ready' : null,
      current.unresolved_external_orders > 0
        ? `${current.unresolved_external_orders} external orders are unresolved`
        : null,
      current.unscoped_external_orders > 0
        ? `${current.unscoped_external_orders} external orders have unknown scope`
        : null,
      current.unresolved_protection_inventory > 0
        ? `${current.unresolved_protection_inventory} protection orders are unresolved`
        : null,
      current.reconciliation_required ? 'authoritative reconciliation is required' : null,
    ].filter((reason): reason is string => reason !== null)
    return reasons.length === 0
      ? 'Account reconciliation is not ready for new exposure'
      : `Account reconciliation is blocked: ${reasons.join('; ')}`
  }
  const cycle = summary.value?.reconciliation_cycle_id
  if ((summary.value?.system_external_orders ?? 0) > 0) {
    return `${summary.value?.system_external_orders} external open orders are tracked`
  }
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
  <div
    class="reconciliation-control"
    :title="title"
    :data-failure="projections.selected?.failure ?? undefined"
    data-testid="reconciliation-control"
  >
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

.reconciliation-state[data-phase='failed'],
.reconciliation-state[data-phase='authorization_failed'],
.reconciliation-state[data-phase='resync_failed'] {
  color: var(--status-danger, #ff6b76);
}

.reconciliation-state[data-phase='blocked'],
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
