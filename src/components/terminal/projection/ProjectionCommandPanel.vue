<script setup lang="ts">
import { computed, ref } from 'vue'

import SplitView from '@/components/general/SplitView.vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import LegacyCommandHistory from '@/components/engine/LegacyCommandHistory.vue'
import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProjectionCommandFilters from '@/components/engine/ProjectionCommandFilters.vue'
import ProjectionCommandCard from './ProjectionCommandCard.vue'
import type { CommandProjection } from '@/lib/gateway'
import { duplicateCommandPrefill } from '@/lib/engineCommands/prefill'
import { lifecycleActions, type LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { nodeKey } from '@/lib/projection'
import { commandLabel, commandSymbolIndex, projectionEntities } from '@/lib/projection/presentation'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useModalStore } from '@/stores/modals'
import { useProjectionUiStore } from '@/stores/projectionUi'
import { useUiStore } from '@/stores/ui'

defineOptions({ inheritAttrs: false })

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const modals = useModalStore()
const projections = useAccountProjectionStore()
const projectionUi = useProjectionUiStore()
const ui = useUiStore()

const showFilters = ref(false)
const query = ref('')
const selectedAction = ref<LifecycleAction | null>(null)
const historyError = ref<string | null>(null)
const loadingHistory = ref(false)
const renameCommand = ref<CommandProjection | null>(null)
const renameValue = ref('')
const renameColor = ref<string | null>(null)

const symbols = computed(() =>
  projectionUi.graph === null ? new Map<string, string | null>() : commandSymbolIndex(projectionUi.graph),
)
const visibleCommands = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (normalized === '') return projectionUi.filteredCommands
  return projectionUi.filteredCommands.filter((command) =>
    [
      commandLabel(command),
      symbols.value.get(command.command_id),
      command.command_id,
      command.lifecycle,
    ]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(normalized)),
  )
})
const pinnedCommands = computed(() =>
  visibleCommands.value.filter((command) => projectionUi.meta(command.command_id).pinned),
)
const unpinnedCommands = computed(() =>
  visibleCommands.value.filter((command) => !projectionUi.meta(command.command_id).pinned),
)
const hiddenCommandCount = computed(
  () => projectionUi.commands.length - visibleCommands.value.length,
)
const olderAvailable = computed(() => {
  const view = projections.selected?.view
  if (view === null || view === undefined) return false
  return view.history?.next_cursor !== null || view.live.window.older_terminal_commands_available
})

defineExpose({
  showFilters,
  toggleFilters,
  hiddenCommandCount,
  shownCommandCount: computed(() => visibleCommands.value.length),
})

function toggleFilters(): void {
  showFilters.value = !showFilters.value
  projectionUi.showCommandFilters = showFilters.value
}

function actionsFor(command: CommandProjection): LifecycleAction[] {
  if (projectionUi.graph === null) return []
  const root = projectionEntities(projectionUi.graph).get(nodeKey(command.root)) ?? null
  return lifecycleActions(root, projectionUi.graph, projections.selectedLive?.positions ?? [])
}

function canDuplicate(command: CommandProjection): boolean {
  return accounts.selectedAccountId !== null && duplicateCommandPrefill(command, accounts.selectedAccountId) !== null
}

function duplicate(command: CommandProjection): void {
  const accountId = accounts.selectedAccountId
  if (accountId === null) return
  const prefill = duplicateCommandPrefill(command, accountId)
  if (prefill !== null) {
    modals.openModalWithValues(prefill.modal, prefill.values as unknown as Record<string, unknown>)
  }
}

function openRename(command: CommandProjection): void {
  const meta = projectionUi.meta(command.command_id)
  renameCommand.value = command
  renameValue.value = meta.nickname ?? ''
  renameColor.value = meta.nicknameColor
}

function saveRename(): void {
  if (renameCommand.value === null) return
  projectionUi.setNickname(renameCommand.value.command_id, renameValue.value, renameColor.value)
  renameCommand.value = null
}

async function loadOlder(): Promise<void> {
  historyError.value = null
  loadingHistory.value = true
  try {
    await gateway.requestOlderHistory()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingHistory.value = false
  }
}
</script>

<template>
  <div class="projection-command-panel">
    <div v-if="showFilters" class="command-filter-panel">
      <div class="filter-search-row">
        <input v-model="query" class="input" type="search" placeholder="Filter commands" />
        <button
          v-if="olderAvailable"
          class="btn btn-sm btn-ghost"
          :disabled="loadingHistory"
          @click="loadOlder"
        >
          {{ loadingHistory ? 'Loading...' : 'Older' }}
        </button>
      </div>
      <ProjectionCommandFilters />
      <p v-if="historyError" class="error-text">{{ historyError }}</p>
    </div>

    <div v-if="projections.selected?.status !== 'ready'" class="projection-state">
      <span>{{ projections.selected?.status ?? 'idle' }}</span>
      <span v-if="projections.selected?.error" class="error-text">
        {{ projections.selected.error }}
      </span>
    </div>

    <LegacyCommandHistory :query="query" />

    <div v-if="pinnedCommands.length" class="command-list-body">
      <SplitView
        orientation="vertical"
        storage-key="terminal-projection-commands-pinned"
        :initial-sizes="[35, 65]"
      >
        <template #pinned>
          <section class="command-section">
            <header>Pinned</header>
            <StickyScroller
              :trigger="pinnedCommands.length"
              :smooth="true"
              :show-button="false"
              :stick-on-mount="!ui.newestCommandsFirst"
            >
              <div class="command-card-list">
                <ProjectionCommandCard
                  v-for="command in pinnedCommands"
                  :key="command.command_id"
                  :command="command"
                  :graph="projectionUi.graph!"
                  :meta="projectionUi.meta(command.command_id)"
                  :selected="projectionUi.selectedCommandId === command.command_id"
                  :actions="actionsFor(command)"
                  :can-duplicate="canDuplicate(command)"
                  @select="projectionUi.selectCommand"
                  @duplicate="duplicate"
                  @rename="openRename"
                  @pin="projectionUi.togglePinned"
                  @action="selectedAction = $event"
                />
              </div>
            </StickyScroller>
          </section>
        </template>
        <template #all>
          <StickyScroller
            :trigger="unpinnedCommands.length"
            :smooth="true"
            :show-button="!ui.newestCommandsFirst"
            :stick-on-mount="!ui.newestCommandsFirst"
          >
            <div class="command-card-list">
              <ProjectionCommandCard
                v-for="command in unpinnedCommands"
                :key="command.command_id"
                :command="command"
                :graph="projectionUi.graph!"
                :meta="projectionUi.meta(command.command_id)"
                :selected="projectionUi.selectedCommandId === command.command_id"
                :actions="actionsFor(command)"
                :can-duplicate="canDuplicate(command)"
                @select="projectionUi.selectCommand"
                @duplicate="duplicate"
                @rename="openRename"
                @pin="projectionUi.togglePinned"
                @action="selectedAction = $event"
              />
            </div>
          </StickyScroller>
        </template>
      </SplitView>
    </div>

    <StickyScroller
      v-else
      class="command-list-body"
      :trigger="unpinnedCommands.length"
      :smooth="true"
      :show-button="!ui.newestCommandsFirst"
      :stick-on-mount="!ui.newestCommandsFirst"
    >
      <div class="command-card-list">
        <ProjectionCommandCard
          v-for="command in unpinnedCommands"
          :key="command.command_id"
          :command="command"
          :graph="projectionUi.graph!"
          :meta="projectionUi.meta(command.command_id)"
          :selected="projectionUi.selectedCommandId === command.command_id"
          :actions="actionsFor(command)"
          :can-duplicate="canDuplicate(command)"
          @select="projectionUi.selectCommand"
          @duplicate="duplicate"
          @rename="openRename"
          @pin="projectionUi.togglePinned"
          @action="selectedAction = $event"
        />
        <div v-if="visibleCommands.length === 0" class="empty-state">No commands</div>
      </div>
    </StickyScroller>

    <LifecycleActionModal
      :open="selectedAction !== null"
      :account-id="accounts.selectedAccountId ?? ''"
      :action="selectedAction"
      @close="selectedAction = null"
    />

    <BaseCommandModal
      title="Command Nickname"
      :open="renameCommand !== null"
      @close="renameCommand = null"
    >
      <form id="projection-command-rename" class="rename-form" @submit.prevent="saveRename">
        <label>
          <span>Nickname</span>
          <input v-model="renameValue" class="input" maxlength="80" autocomplete="off" />
        </label>
        <label>
          <span>Color</span>
          <input v-model="renameColor" class="input" type="color" />
        </label>
      </form>
      <template #footer>
        <button class="btn btn-ghost" @click="renameCommand = null">Cancel</button>
        <button class="btn" type="submit" form="projection-command-rename">Save</button>
      </template>
    </BaseCommandModal>
  </div>
</template>

<style scoped>
.projection-command-panel,
.command-list-body,
.command-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.command-filter-panel {
  border-bottom: 1px solid var(--border-color);
  padding: 8px;
}

.filter-search-row {
  display: grid;
  gap: 6px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-bottom: 8px;
}

.command-section > header {
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border-bottom: 1px solid var(--border-color);
  color: var(--color-text-dim);
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 6px 10px;
  text-transform: uppercase;
}

.command-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.projection-state,
.error-text,
.empty-state {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 8px 10px;
}

.error-text { color: var(--color-error); }

.rename-form {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.rename-form label {
  display: grid;
  gap: 5px;
}

.rename-form label > span {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}
</style>
