<script setup lang="ts">
import { computed, ref } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'

import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import type { NativeProtectionProjection, Uuid } from '@/lib/gateway'
import { useAccountsStore } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const selectedProtectionId = ref<Uuid | null>(null)

const visibleProtections = computed(() =>
  [...(projections.selectedLive?.native_protections ?? [])]
    .filter((protection) => !['flat', 'canceled', 'rejected'].includes(protection.status))
    .sort((left, right) =>
      `${left.symbol}:${left.position_side}`.localeCompare(
        `${right.symbol}:${right.position_side}`,
      ),
    ),
)

const selectedProtection = computed(
  () =>
    projections.selectedLive?.native_protections.find(
      (protection) => protection.protection_id === selectedProtectionId.value,
    ) ?? null,
)

const activeAmendment = computed(() =>
  activeProtectionAmendment(
    selectedProtection.value,
    projections.selectedLive?.protection_amendments ?? [],
  ),
)

function amendmentFor(protection: NativeProtectionProjection) {
  return activeProtectionAmendment(
    protection,
    projections.selectedLive?.protection_amendments ?? [],
  )
}

function canEdit(protection: NativeProtectionProjection): boolean {
  return (
    projections.selectedLive?.checkpoint.shard.exchange === 'hyperliquid' &&
    protection.status === 'tracking' &&
    amendmentFor(protection) === null
  )
}
</script>

<template>
  <section
    v-if="visibleProtections.length > 0"
    class="active-protections"
    data-testid="active-protection-list"
  >
    <header class="protection-header">
      <span><ShieldCheck :size="12" /> Active Protection</span>
      <span>{{ visibleProtections.length }}</span>
    </header>
    <div class="protection-rows">
      <div
        v-for="protection in visibleProtections"
        :key="protection.protection_id"
        class="protection-row"
        :data-protection-id="protection.protection_id"
      >
        <span class="protection-state" :class="`status-${protection.status}`" />
        <span class="protection-main">
          <span class="protection-title">
            {{ protection.symbol }} · {{ protection.position_side }}
          </span>
          <span class="protection-meta">
            {{ protection.covered_quantity }} / {{ protection.target_quantity }} covered · r{{
              protection.plan_revision
            }}
          </span>
          <span v-if="amendmentFor(protection)" class="amendment-progress">
            Edit {{ amendmentFor(protection)?.lifecycle }} ·
            {{ amendmentFor(protection)?.completed_steps }} /
            {{ amendmentFor(protection)?.steps.length }}
          </span>
          <span v-else-if="protection.failure_reason" class="failure-reason">
            {{ protection.failure_reason }}
          </span>
        </span>
        <span class="protection-status">{{ protection.status }}</span>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="!canEdit(protection)"
          :title="
            amendmentFor(protection)
              ? 'A protection edit is already being reconciled'
              : protection.status !== 'tracking'
                ? 'Protection must be fully reconciled and tracking before editing'
                : 'Edit the complete live Hyperliquid TP/SL plan'
          "
          @click="selectedProtectionId = protection.protection_id"
        >
          Edit
        </button>
      </div>
    </div>
  </section>

  <ProtectionAmendmentModal
    :open="selectedProtectionId !== null"
    :account-id="accounts.selectedAccountId ?? ''"
    :protection="selectedProtection"
    :active-amendment="activeAmendment"
    @close="selectedProtectionId = null"
  />
</template>

<style scoped>
.active-protections {
  flex: 0 0 auto;
  max-height: 154px;
  overflow: hidden;
  border-bottom: 1px solid var(--border-color);
}

.protection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 25px;
  padding: 3px 7px;
  color: var(--color-text-dim);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  text-transform: uppercase;
}

.protection-header > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.protection-rows {
  max-height: 128px;
  overflow: auto;
}

.protection-row {
  display: grid;
  min-height: 43px;
  grid-template-columns: 3px minmax(0, 1fr) auto auto;
  gap: 7px;
  align-items: center;
  padding: 4px 6px 4px 4px;
  border-bottom: 1px solid var(--border-color);
}

.protection-row:last-child {
  border-bottom: 0;
}

.protection-state {
  width: 3px;
  height: 100%;
  background: var(--color-info);
}

.status-tracking {
  background: var(--color-success);
}

.status-reconciliation_required,
.status-failed_unprotected {
  background: var(--color-error);
}

.status-installing,
.status-resizing,
.status-canceling,
.status-triggered {
  background: var(--color-warning);
}

.protection-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.protection-title,
.protection-meta,
.amendment-progress,
.failure-reason {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.protection-meta,
.protection-status,
.amendment-progress,
.failure-reason {
  color: var(--color-text-dim);
  font-size: 10px;
}

.protection-status {
  text-transform: uppercase;
}

.amendment-progress {
  color: var(--color-warning);
}

.failure-reason {
  color: var(--color-error);
}
</style>
