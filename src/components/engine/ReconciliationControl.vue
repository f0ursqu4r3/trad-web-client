<script setup lang="ts">
import { computed } from 'vue'

import { useAccountProjectionStore } from '@/stores/accountProjection'

const projections = useAccountProjectionStore()

const summary = computed(() => projections.selectedLive?.checkpoint.summary ?? null)
const phase = computed(() => {
  const projection = projections.selected
  if (projection?.status !== 'ready') {
    if (projection?.failure === 'authorization') return 'authorization_failed'
    if (projection?.failure === 'resync') return 'resync_failed'
    return 'unavailable'
  }
  const status = summary.value?.reconciliation_status ?? 'unknown'
  if (status === 'ready' && summary.value?.reconciliation_ready === false) return 'blocked'
  return status
})
const label = computed(() => {
  switch (phase.value) {
    case 'reconciling':
      return 'reconciling'
    case 'ready':
      return 'reconciled'
    case 'blocked':
      return 'sync blocked'
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
const title = computed(() => {
  if (projections.selected?.status !== 'ready' && projections.selected?.error !== null) {
    return projections.selected?.error ?? 'Account projection is unavailable'
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
    ? 'Authoritative exchange state'
    : `Reconciliation cycle ${cycle}`
})
</script>

<template>
  <div
    class="reconciliation-control"
    :title="title"
    :data-failure="projections.selected?.failure ?? undefined"
    data-testid="reconciliation-control"
  >
    <span class="reconciliation-state" :data-phase="phase">{{ label }}</span>
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
  font-size: 11px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.reconciliation-state[data-phase='ready'] {
  color: var(--status-success, #53d18b);
}

.reconciliation-state[data-phase='authorization_failed'],
.reconciliation-state[data-phase='resync_failed'] {
  color: var(--status-danger, #ff6b76);
}

.reconciliation-state[data-phase='blocked'],
.reconciliation-state[data-phase='reconciling'] {
  color: var(--status-warning, #f1b84b);
}
</style>
