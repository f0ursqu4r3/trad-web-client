<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pin, RefreshCw } from 'lucide-vue-next'

import { commandLabel, commandSymbolIndex } from '@/lib/projection/presentation'
import LegacyCommandHistory from '@/components/engine/LegacyCommandHistory.vue'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useGatewayStore } from '@/stores/gateway'
import { useProjectionUiStore } from '@/stores/projectionUi'

const projections = useAccountProjectionStore()
const gateway = useGatewayStore()
const ui = useProjectionUiStore()
const query = ref('')
const historyError = ref<string | null>(null)
const loadingHistory = ref(false)
const symbols = computed(() => (ui.graph === null ? new Map() : commandSymbolIndex(ui.graph)))

const visibleCommands = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (normalized.length === 0) return ui.orderedCommands
  return ui.orderedCommands.filter((command) => {
    const label = commandLabel(command)
    const symbol = symbols.value.get(command.command_id) ?? null
    return [label, symbol, command.command_id, command.lifecycle]
      .filter((value): value is string => value !== null)
      .some((value) => value.toLowerCase().includes(normalized))
  })
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
      <button
        v-for="command in visibleCommands"
        :key="command.command_id"
        class="command-row"
        :data-command-id="command.command_id"
        :class="[
          { selected: ui.selectedCommandId === command.command_id },
          `lifecycle-${command.lifecycle}`,
        ]"
        @click="ui.selectCommand(command.command_id)"
      >
        <span class="status-line" />
        <span class="command-main">
          <span class="command-title">
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
      </button>
      <div v-if="visibleCommands.length === 0" class="empty-state">No commands</div>
    </div>
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
  grid-template-columns: 3px minmax(0, 1fr) auto 24px;
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
