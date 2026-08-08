<script setup lang="ts">
import { computed, ref } from 'vue'

import { lifecycleActions, type LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { useAccountsStore } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useProjectionUiStore } from '@/stores/projectionUi'
import LifecycleActionModal from './LifecycleActionModal.vue'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const ui = useProjectionUiStore()
const selectedAction = ref<LifecycleAction | null>(null)
const actions = computed(() =>
  lifecycleActions(ui.selectedEntity, ui.graph, projections.selectedLive?.positions ?? []),
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
  <LifecycleActionModal
    :open="selectedAction !== null"
    :account-id="accounts.selectedAccountId ?? ''"
    :action="selectedAction"
    @close="close"
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
</style>
