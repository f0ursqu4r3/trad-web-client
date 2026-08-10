<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { EllipsisVertical, Filter, Pin, RefreshCw } from 'lucide-vue-next'

import DropMenu, { type DropMenuItem } from '@/components/general/DropMenu.vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProjectionCommandFilters from '@/components/engine/ProjectionCommandFilters.vue'
import { lifecycleActions, type LifecycleAction } from '@/lib/engineCommands/lifecycle'
import type { CommandProjection } from '@/lib/gateway'
import { nodeKey } from '@/lib/projection'
import { commandLabel, commandSymbolIndex } from '@/lib/projection/presentation'
import { projectionEntities } from '@/lib/projection/presentation'
import LegacyCommandHistory from '@/components/engine/LegacyCommandHistory.vue'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useProjectionUiStore } from '@/stores/projectionUi'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const gateway = useGatewayStore()
const ui = useProjectionUiStore()
const query = ref('')
const historyError = ref<string | null>(null)
const loadingHistory = ref(false)
const contextMenu = ref<InstanceType<typeof DropMenu> | null>(null)
const contextCommand = ref<CommandProjection | null>(null)
const selectedAction = ref<LifecycleAction | null>(null)
const renameOpen = ref(false)
const renameValue = ref('')
const renameColor = ref<string | null>(null)
const symbols = computed(() => (ui.graph === null ? new Map() : commandSymbolIndex(ui.graph)))
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

const visibleCommands = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (normalized.length === 0) return ui.filteredCommands
  return ui.filteredCommands.filter((command) => {
    const label = commandLabel(command)
    const symbol = symbols.value.get(command.command_id) ?? null
    return [label, symbol, command.command_id, command.lifecycle]
      .filter((value): value is string => value !== null)
      .some((value) => value.toLowerCase().includes(normalized))
  })
})
const hiddenCommandCount = computed(() => ui.commands.length - visibleCommands.value.length)
const contextActions = computed(() => {
  const command = contextCommand.value
  if (command === null || ui.graph === null) return []
  const root = projectionEntities(ui.graph).get(nodeKey(command.root)) ?? null
  return lifecycleActions(root, ui.graph, projections.selectedLive?.positions ?? [])
})
const contextItems = computed<DropMenuItem[]>(() => {
  const command = contextCommand.value
  if (command === null) return []
  const meta = ui.meta(command.command_id)
  return [
    { label: 'Inspect', action: () => ui.selectCommand(command.command_id) },
    {
      label: meta.pinned ? 'Unpin' : 'Pin',
      action: () => ui.togglePinned(command.command_id),
    },
    { label: 'Nickname / Color...', action: openRename },
    ...contextActions.value.map((action) => ({
      label: action.label,
      title: action.danger ? 'Risk-reducing action; review the confirmation carefully.' : undefined,
      className: action.danger ? 'context-danger' : undefined,
      action: () => {
        selectedAction.value = action
      },
    })),
  ]
})

const olderAvailable = computed(() => {
  const view = projections.selected?.view
  if (view === null || view === undefined) return false
  if (view.history !== null) return view.history.next_cursor !== null
  return view.live.window.older_terminal_commands_available
})

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

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openContext(event: MouseEvent, command: CommandProjection): void {
  event.preventDefault()
  event.stopPropagation()
  contextCommand.value = command
  void nextTick(() => contextMenu.value?.openAt(event.clientX, event.clientY))
}

function openRowMenu(event: MouseEvent, command: CommandProjection): void {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  contextCommand.value = command
  void nextTick(() => contextMenu.value?.openAt(rect.right, rect.bottom + 4))
}

function openRename(): void {
  const command = contextCommand.value
  if (command === null) return
  const meta = ui.meta(command.command_id)
  renameValue.value = meta.nickname ?? ''
  renameColor.value = meta.nicknameColor
  renameOpen.value = true
}

function closeRename(): void {
  renameOpen.value = false
}

function saveRename(): void {
  const command = contextCommand.value
  if (command === null) return
  ui.setNickname(command.command_id, renameValue.value, renameColor.value)
  closeRename()
}

function clearRename(): void {
  renameValue.value = ''
  renameColor.value = null
  saveRename()
}
</script>

<template>
  <div class="command-list" data-testid="projection-command-list">
    <div class="command-toolbar">
      <input
        v-model="query"
        class="input command-search"
        type="search"
        placeholder="Filter commands"
      />
      <span class="command-count">
        {{ visibleCommands.length }} shown<span v-if="hiddenCommandCount">
          · {{ hiddenCommandCount }} hidden</span
        >
      </span>
      <button
        class="btn btn-sm icon-btn"
        type="button"
        title="Command filters"
        :aria-pressed="ui.showCommandFilters"
        @click="ui.showCommandFilters = !ui.showCommandFilters"
      >
        <Filter :size="12" />
      </button>
      <button
        v-if="olderAvailable"
        class="btn btn-sm btn-ghost history-button"
        :disabled="loadingHistory"
        title="Load older terminal commands"
        @click="loadOlder"
      >
        <RefreshCw :size="12" :class="{ spinning: loadingHistory }" />
        Older
      </button>
    </div>

    <ProjectionCommandFilters v-if="ui.showCommandFilters" />

    <LegacyCommandHistory :query="query" />

    <div
      v-if="projections.selected?.status !== 'ready'"
      class="projection-state"
      data-testid="projection-account-state"
    >
      <span>{{ projections.selected?.status ?? 'idle' }}</span>
      <span v-if="projections.selected?.error" class="error-text">
        {{ projections.selected.error }}
      </span>
    </div>
    <div v-if="historyError" class="projection-state error-text">{{ historyError }}</div>

    <div class="command-rows">
      <div
        v-for="command in visibleCommands"
        :key="command.command_id"
        class="command-row"
        role="button"
        tabindex="0"
        :data-command-id="command.command_id"
        :class="[
          { selected: ui.selectedCommandId === command.command_id },
          `lifecycle-${command.lifecycle}`,
        ]"
        @click="ui.selectCommand(command.command_id)"
        @keydown.enter="ui.selectCommand(command.command_id)"
        @contextmenu="openContext($event, command)"
      >
        <span
          class="status-line"
          :style="
            ui.meta(command.command_id).nicknameColor
              ? { background: ui.meta(command.command_id).nicknameColor ?? undefined }
              : undefined
          "
        />
        <span class="command-main">
          <span
            class="command-title"
            :style="{ color: ui.meta(command.command_id).nicknameColor ?? undefined }"
          >
            {{ ui.meta(command.command_id).nickname || commandLabel(command) }}
          </span>
          <span class="command-facets">
            <span v-if="symbols.has(command.command_id)">{{
              symbols.get(command.command_id)
            }}</span>
            <span>#{{ command.command_id.slice(0, 8) }}</span>
          </span>
        </span>
        <span class="command-tail">
          <span>{{ formatTime(command.accepted_at) }}</span>
          <span class="command-status">{{ command.lifecycle }}</span>
        </span>
        <span
          class="pin-button"
          :class="{ active: ui.meta(command.command_id).pinned }"
          title="Pin command"
          role="button"
          tabindex="0"
          @click.stop="ui.togglePinned(command.command_id)"
          @keydown.enter.stop="ui.togglePinned(command.command_id)"
        >
          <Pin :size="12" />
        </span>
        <button
          class="btn btn-sm icon-btn row-menu"
          type="button"
          title="Command actions"
          @click.stop="openRowMenu($event, command)"
        >
          <EllipsisVertical :size="12" />
        </button>
      </div>
      <div v-if="visibleCommands.length === 0" class="empty-state">No commands</div>
    </div>

    <DropMenu ref="contextMenu" :items="contextItems">
      <template #trigger><span /></template>
    </DropMenu>
    <LifecycleActionModal
      :open="selectedAction !== null"
      :account-id="accounts.selectedAccountId ?? ''"
      :action="selectedAction"
      @close="selectedAction = null"
    />
    <BaseCommandModal title="Command Nickname" :open="renameOpen" @close="closeRename">
      <form id="projection-command-rename" class="rename-form" @submit.prevent="saveRename">
        <label class="rename-field">
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
        <button class="btn btn-ghost" type="button" @click="clearRename">Remove</button>
        <button class="btn btn-ghost" type="button" @click="closeRename">Cancel</button>
        <button class="btn" type="submit" form="projection-command-rename">Save</button>
      </template>
    </BaseCommandModal>
  </div>
</template>

<style scoped>
.command-list {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}

.command-toolbar {
  display: flex;
  gap: 6px;
  padding: 6px;
  border-bottom: 1px solid var(--border-color);
}

.command-search {
  min-width: 0;
  flex: 1;
  height: 28px;
}
.command-count {
  align-self: center;
  color: var(--color-text-dim);
  font-size: 10px;
  white-space: nowrap;
}

.history-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.projection-state {
  display: flex;
  gap: 8px;
  padding: 5px 8px;
  color: var(--color-text-dim);
  border-bottom: 1px solid var(--border-color);
}

.error-text {
  color: var(--color-error);
}

.command-rows {
  min-height: 0;
  overflow: auto;
}

.command-row {
  position: relative;
  display: grid;
  content-visibility: auto;
  contain-intrinsic-size: 52px;
  width: 100%;
  min-height: 52px;
  grid-template-columns: 3px minmax(0, 1fr) auto 24px 24px;
  gap: 8px;
  align-items: center;
  padding: 6px 7px 6px 4px;
  color: var(--color-text);
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border-color);
}

.command-row:hover,
.command-row.selected {
  background: var(--color-bg-hover);
}

.command-row.selected {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}

.status-line {
  width: 3px;
  height: 100%;
  background: var(--color-info);
}

.lifecycle-succeeded .status-line {
  background: var(--color-success);
}

.lifecycle-failed .status-line,
.lifecycle-reconciliation_required .status-line {
  background: var(--color-error);
}

.lifecycle-canceled .status-line {
  background: var(--color-text-dim);
}

.lifecycle-partially_succeeded .status-line {
  background: var(--color-warning);
}

.command-main,
.command-tail {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.command-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-facets,
.command-tail {
  color: var(--color-text-dim);
  font-size: 11px;
}

.command-facets {
  display: flex;
  gap: 8px;
}

.command-tail {
  align-items: flex-end;
  white-space: nowrap;
}

.command-status {
  text-transform: uppercase;
}

.pin-button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: var(--color-text-dim);
}

.pin-button:hover,
.pin-button.active {
  color: var(--color-accent);
}
.row-menu {
  width: 24px;
  height: 24px;
}
.rename-form {
  display: grid;
  gap: 14px;
}
.rename-field {
  display: grid;
  gap: 6px;
}
.color-field {
  display: flex;
  gap: 6px;
  padding: 0;
  border: 0;
}
.color-field legend {
  margin-bottom: 6px;
  color: var(--color-text-dim);
}
.color-option {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  background: transparent;
  border: 1px solid var(--border-color);
}
.color-option span {
  width: 14px;
  height: 14px;
}
.color-option.selected {
  border-color: var(--color-accent);
  outline: 1px solid var(--color-accent);
}
:global(.context-danger) {
  color: var(--color-error) !important;
}

.empty-state {
  padding: 14px;
  color: var(--color-text-dim);
  text-align: center;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
