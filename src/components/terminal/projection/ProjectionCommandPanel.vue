<script setup lang="ts">
import { computed, ref } from 'vue'
import { SquareTerminal } from 'lucide-vue-next'

import SplitView from '@/components/general/SplitView.vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import LegacyCommandHistory from '@/components/engine/LegacyCommandHistory.vue'
import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProjectionCommandFilters from '@/components/engine/ProjectionCommandFilters.vue'
import ProjectionCommandCard from './ProjectionCommandCard.vue'
import type { CommandProjection } from '@/lib/gateway'
import { duplicateCommandPrefill } from '@/lib/engineCommands/prefill'
import type { LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { commandLabel, commandSymbolIndex } from '@/lib/projection/presentation'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useModalStore } from '@/stores/modals'
import { useProjectionUiStore } from '@/stores/projectionUi'
import { useUiStore } from '@/stores/ui'
import { commandPaletteShortcut, openCommandPalette } from '@/lib/engineCommands/palette'

defineOptions({ inheritAttrs: false })

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const modals = useModalStore()
const projections = useAccountProjectionStore()
const projectionUi = useProjectionUiStore()
const ui = useUiStore()
const paletteShortcut = commandPaletteShortcut()

const showFilters = ref(false)
const query = ref('')
const selectedAction = ref<LifecycleAction | null>(null)
const historyError = ref<string | null>(null)
const loadingHistory = ref(false)
const renameCommand = ref<CommandProjection | null>(null)
const renameValue = ref('')
const renameColor = ref<string | null>(null)
const nicknameColors = [
  { label: 'Default', value: null },
  { label: 'Blue', value: '#5cc8ff' },
  { label: 'Green', value: '#6ee7b7' },
  { label: 'Yellow', value: '#fbbf24' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Red', value: '#f87171' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Pink', value: '#f472b6' },
]

const symbols = computed(() =>
  projectionUi.graph === null
    ? new Map<string, string | null>()
    : commandSymbolIndex(projectionUi.graph),
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

function duplicate(command: CommandProjection): void {
  const accountId = accounts.selectedAccountId
  if (accountId === null) return
  const prefill = duplicateCommandPrefill(command, accountId)
  if (prefill !== null) {
    modals.openModalWithValues(prefill.modal, prefill.values as unknown as Record<string, unknown>)
  }
}

function canDuplicate(command: CommandProjection): boolean {
  const accountId = accounts.selectedAccountId
  return accountId !== null && duplicateCommandPrefill(command, accountId) !== null
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
  <div class="projection-command-panel" data-testid="projection-command-list">
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
              <div class="command-card-list command-rows">
                <ProjectionCommandCard
                  v-for="command in pinnedCommands"
                  :key="command.command_id"
                  :command="command"
                  :graph="projectionUi.graph!"
                  :meta="projectionUi.meta(command.command_id)"
                  :selected="projectionUi.selectedCommandId === command.command_id"
                  :can-duplicate="canDuplicate(command)"
                  @select="projectionUi.selectCommand"
                  @duplicate="duplicate"
                  @pin="projectionUi.togglePinned"
                  @rename="openRename"
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
            <div class="command-card-list command-rows">
              <ProjectionCommandCard
                v-for="command in unpinnedCommands"
                :key="command.command_id"
                :command="command"
                :graph="projectionUi.graph!"
                :meta="projectionUi.meta(command.command_id)"
                :selected="projectionUi.selectedCommandId === command.command_id"
                :can-duplicate="canDuplicate(command)"
                @select="projectionUi.selectCommand"
                @duplicate="duplicate"
                @pin="projectionUi.togglePinned"
                @rename="openRename"
                @action="selectedAction = $event"
              />
            </div>
          </StickyScroller>
        </template>
      </SplitView>
    </div>

    <PanelEmptyState
      v-else-if="visibleCommands.length === 0"
      title="No commands yet"
      description="Open the command menu to place your first order or start an execution workflow."
    >
      <template #icon><SquareTerminal :size="20" /></template>
      <template #action>
        <button class="btn btn-primary" type="button" @click="openCommandPalette">
          Open commands <span class="kbd">{{ paletteShortcut }}</span>
        </button>
      </template>
    </PanelEmptyState>

    <StickyScroller
      v-else
      class="command-list-body"
      :trigger="unpinnedCommands.length"
      :smooth="true"
      :show-button="!ui.newestCommandsFirst"
      :stick-on-mount="!ui.newestCommandsFirst"
    >
      <div class="command-card-list command-rows">
        <ProjectionCommandCard
          v-for="command in unpinnedCommands"
          :key="command.command_id"
          :command="command"
          :graph="projectionUi.graph!"
          :meta="projectionUi.meta(command.command_id)"
          :selected="projectionUi.selectedCommandId === command.command_id"
          :can-duplicate="canDuplicate(command)"
          @select="projectionUi.selectCommand"
          @duplicate="duplicate"
          @pin="projectionUi.togglePinned"
          @rename="openRename"
          @action="selectedAction = $event"
        />
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
        <fieldset class="color-field">
          <legend>Color</legend>
          <button
            v-for="color in nicknameColors"
            :key="color.label"
            class="color-option"
            :class="{ selected: renameColor === color.value }"
            type="button"
            :title="color.label"
            :aria-label="color.label"
            @click="renameColor = color.value"
          >
            <span :style="{ background: color.value ?? 'var(--color-text-dim)' }" />
          </button>
        </fieldset>
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

.error-text {
  color: var(--color-error);
}

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

.color-field {
  border: 0;
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
}

.color-field legend {
  color: var(--color-text-dim);
  font-size: 10px;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.color-option {
  background: transparent;
  border: 1px solid var(--border-color);
  display: grid;
  height: 26px;
  place-items: center;
  width: 26px;
}

.color-option span {
  height: 14px;
  width: 14px;
}
.color-option.selected {
  border-color: var(--accent-color);
  outline: 1px solid var(--accent-color);
}
:global(.context-danger) {
  color: var(--color-error) !important;
}
</style>
