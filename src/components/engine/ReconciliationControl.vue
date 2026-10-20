<script setup lang="ts">
import { computed } from 'vue'

import { useAccountProjectionStore } from '@/stores/accountProjection'

const projections = useAccountProjectionStore()

const checkpoint = computed(() => projections.selectedLive?.checkpoint ?? null)
const summary = computed(() => checkpoint.value?.summary ?? null)
// The engine's own reason the whole account takes no new risk. Flags on single
// trades and blocked coins never set it.
const accountBlockedReason = computed(
  () => checkpoint.value?.new_risk_blocked_reason?.trim() || null,
)
const blockedCoins = computed(() =>
  Object.entries(checkpoint.value?.new_risk_blocked_symbols ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  ),
)
// The engine's reason while a reconciliation cycle is still running; that is
// checking, not a block.
const RECONCILIATION_RUNNING_REASON = 'account setup or exchange reconciliation is still running'
const phase = computed(() => {
  const projection = projections.selected
  if (projection?.status !== 'ready') {
    if (
      projection?.status === 'idle' ||
      projection?.status === 'subscribing' ||
      projection === null
    ) {
      return 'loading'
    }
    if (projection.status === 'stale') return 'resyncing'
    if (projection?.failure === 'authorization') return 'authorization_failed'
    if (projection?.failure === 'resync') return 'resync_failed'
    return 'unavailable'
  }
  const status = summary.value?.reconciliation_status ?? 'unknown'
  if (summary.value?.reconciliation_ready === false) {
    const reason = accountBlockedReason.value
    if (reason !== null && reason !== RECONCILIATION_RUNNING_REASON) return 'blocked'
    if (status === 'ready') return 'blocked'
    return status
  }
  // A flagged trade or a blocked coin needs attention; the account still
  // takes new trades everywhere else.
  if (
    status === 'ready' &&
    (summary.value?.reconciliation_required || blockedCoins.value.length > 0)
  ) {
    return 'attention'
  }
  return status
})
const label = computed(() => {
  switch (phase.value) {
    case 'loading':
      return 'loading account'
    case 'resyncing':
      return 'resyncing account'
    case 'reconciling':
      return 'checking exchange'
    case 'ready':
      return 'reconciled'
    case 'attention':
      return 'needs attention'
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
const coinReasons = computed(() => blockedCoins.value.map(([coin, reason]) => `${coin}: ${reason}`))
const title = computed(() => {
  if (phase.value === 'loading') return 'Waiting for the authoritative account projection.'
  if (phase.value === 'resyncing') {
    return 'Reconnecting to the authoritative account projection. Previously shown values may be stale.'
  }
  if (projections.selected?.status !== 'ready' && projections.selected?.error !== null) {
    return projections.selected?.error ?? 'Account projection is unavailable'
  }
  if (phase.value === 'blocked') {
    if (accountBlockedReason.value !== null) {
      return `New trades are paused: ${accountBlockedReason.value}`
    }
    const current = summary.value
    if (current === null) return 'Account reconciliation is not ready for new exposure'
    const reasons = [
      !current.position_inventory_ready ? 'position inventory is not ready' : null,
      current.unresolved_external_orders > 0
        ? `${current.unresolved_external_orders} external orders are unresolved`
        : null,
      current.unresolved_protection_inventory > 0
        ? `${current.unresolved_protection_inventory} protection orders are unresolved`
        : null,
    ].filter((reason): reason is string => reason !== null)
    return reasons.length === 0
      ? 'Account reconciliation is not ready for new exposure'
      : `Account reconciliation is blocked: ${reasons.join('; ')}`
  }
  if (phase.value === 'attention') {
    if (coinReasons.value.length > 0) {
      return `New trades are paused on ${coinReasons.value.join('; ')}. Other coins are unaffected.`
    }
    return 'A trade needs attention; its card shows the reason. Other trades are unaffected.'
  }
  if (phase.value === 'reconciling') {
    return 'Checking authoritative exchange state. This is not itself a position reconciliation failure.'
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
.reconciliation-state[data-phase='attention'],
.reconciliation-state[data-phase='reconciling'],
.reconciliation-state[data-phase='resyncing'] {
  color: var(--status-warning, #f1b84b);
}
</style>
