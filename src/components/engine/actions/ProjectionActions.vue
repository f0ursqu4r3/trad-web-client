<script setup lang="ts">
import { computed, ref } from 'vue'

import { lifecycleActions, type LifecycleAction } from '@/lib/engineCommands/lifecycle'
import type { CommandProjection } from '@/lib/gateway'
import {
  activeProtectionAmendment,
  commandNativeProtection,
} from '@/lib/engineCommands/protectionAmendment'
import { entityCommandId } from '@/lib/projection/presentation'
import { useAccountsStore } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useProjectionUiStore } from '@/stores/projectionUi'
import LifecycleActionModal from './LifecycleActionModal.vue'
import ProtectionAmendmentModal from './ProtectionAmendmentModal.vue'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const ui = useProjectionUiStore()
const selectedAction = ref<LifecycleAction | null>(null)
const editProtectionOpen = ref(false)
const actions = computed(() =>
  lifecycleActions(ui.selectedEntity, ui.graph, projections.selectedLive?.positions ?? []),
)
const selectedCommand = computed<CommandProjection | null>(() => {
  const selected = ui.selectedEntity
  if (selected === null || ui.graph === null) return null
  const commandId = entityCommandId(selected)
  return ui.graph.commands.find((command) => command.command_id === commandId) ?? null
})
const selectedProtection = computed(() => {
  const command = selectedCommand.value
  const live = projections.selectedLive
  if (command === null || live === null) return null
  return commandNativeProtection(command, live.native_protections)
})
const activeAmendment = computed(() => {
  return activeProtectionAmendment(
    selectedProtection.value,
    projections.selectedLive?.protection_amendments ?? [],
  )
})
const canEditProtection = computed(
  () =>
    projections.selectedLive?.checkpoint.shard.exchange === 'hyperliquid' &&
    selectedProtection.value?.status === 'tracking' &&
    activeAmendment.value === null,
)

function choose(action: LifecycleAction): void {
  selectedAction.value = action
}

function close(): void {
  selectedAction.value = null
}
</script>

<template>
  <div v-if="actions.length" class="projection-actions" data-testid="projection-actions">
    <button
      v-for="action in actions"
      :key="action.kind"
      class="btn btn-sm"
      :class="action.danger ? 'btn-danger' : 'btn-ghost'"
      type="button"
      @click="choose(action)"
    >
      {{ action.label }}
    </button>
  </div>
  <div
    v-if="selectedProtection"
    class="projection-actions protection-actions"
    data-testid="projection-protection-actions"
  >
    <button
      class="btn btn-sm btn-ghost"
      type="button"
      :disabled="!canEditProtection"
      :title="
        activeAmendment
          ? 'A protection edit is already being reconciled'
          : selectedProtection.status !== 'tracking'
            ? 'Protection must be fully reconciled and tracking before editing'
            : 'Edit the complete live Hyperliquid TP/SL plan'
      "
      @click="editProtectionOpen = true"
    >
      Edit Protection
    </button>
    <span v-if="activeAmendment" class="amendment-progress">
      {{ activeAmendment.lifecycle }} · {{ activeAmendment.completed_steps }} /
      {{ activeAmendment.steps.length }} steps
    </span>
  </div>
  <LifecycleActionModal
    :open="selectedAction !== null"
    :account-id="accounts.selectedAccountId ?? ''"
    :action="selectedAction"
    @close="close"
  />
  <ProtectionAmendmentModal
    :open="editProtectionOpen"
    :account-id="accounts.selectedAccountId ?? ''"
    :protection="selectedProtection"
    :active-amendment="activeAmendment"
    @close="editProtectionOpen = false"
  />
</template>

<style scoped>
.projection-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}
.protection-actions {
  align-items: center;
}
.amendment-progress {
  color: var(--color-warning);
  font-size: 11px;
}
</style>
