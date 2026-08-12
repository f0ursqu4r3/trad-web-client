<script setup lang="ts">
import { computed } from 'vue'

import type { CommandLifecycle } from '@/lib/gateway'
import { commandKindLabel, commandSymbolIndex } from '@/lib/projection/presentation'
import { useProjectionUiStore } from '@/stores/projectionUi'

const ui = useProjectionUiStore()
const lifecycleOptions: CommandLifecycle[] = [
  'running',
  'succeeded',
  'partially_succeeded',
  'failed',
  'canceled',
  'reconciliation_required',
]
const kindOptions = computed(() =>
  [...new Set(ui.commands.map((command) => command.accepted.kind))].sort((left, right) =>
    commandKindLabel(left).localeCompare(commandKindLabel(right)),
  ),
)
const symbolOptions = computed(() => {
  if (ui.graph === null) return []
  return [...new Set(commandSymbolIndex(ui.graph).values())]
    .filter((value): value is string => value !== null)
    .sort()
})

function toggle<T>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}
</script>

<template>
  <div class="command-filters" data-testid="projection-command-filters">
    <div class="filter-group">
      <span class="filter-label">Status</span>
      <button
        v-for="lifecycle in lifecycleOptions"
        :key="lifecycle"
        class="btn btn-sm btn-ghost filter-option"
        :aria-pressed="ui.commandFilters.lifecycles.includes(lifecycle)"
        :data-pressed="ui.commandFilters.lifecycles.includes(lifecycle)"
        @click="ui.commandFilters.lifecycles = toggle(ui.commandFilters.lifecycles, lifecycle)"
      >
        {{ lifecycle.replace(/_/g, ' ') }}
      </button>
    </div>
    <div class="filter-group">
      <span class="filter-label">Position</span>
      <button
        v-for="position in ['open', 'closed', 'not_applicable'] as const"
        :key="position"
        class="btn btn-sm btn-ghost filter-option"
        :aria-pressed="ui.commandFilters.positions.includes(position)"
        :data-pressed="ui.commandFilters.positions.includes(position)"
        @click="ui.commandFilters.positions = toggle(ui.commandFilters.positions, position)"
      >
        {{ position.replace('_', ' ') }}
      </button>
    </div>
    <div v-if="kindOptions.length" class="filter-group">
      <span class="filter-label">Type</span>
      <button
        v-for="kind in kindOptions"
        :key="kind"
        class="btn btn-sm btn-ghost filter-option"
        :aria-pressed="ui.commandFilters.kinds.includes(kind)"
        :data-pressed="ui.commandFilters.kinds.includes(kind)"
        @click="ui.commandFilters.kinds = toggle(ui.commandFilters.kinds, kind)"
      >
        {{ commandKindLabel(kind) }}
      </button>
    </div>
    <div v-if="symbolOptions.length" class="filter-group">
      <span class="filter-label">Symbol</span>
      <button
        v-for="symbol in symbolOptions"
        :key="symbol"
        class="btn btn-sm btn-ghost filter-option"
        :aria-pressed="ui.commandFilters.symbols.includes(symbol)"
        :data-pressed="ui.commandFilters.symbols.includes(symbol)"
        @click="ui.commandFilters.symbols = toggle(ui.commandFilters.symbols, symbol)"
      >
        {{ symbol }}
      </button>
    </div>
    <div class="filter-group">
      <span class="filter-label">Recent</span>
      <button
        v-for="option in [
          ['any', 'Any'],
          ['12h', '12h'],
          ['day', 'Day'],
          ['week', 'Week'],
          ['month', 'Month'],
        ] as const"
        :key="option[0]"
        class="btn btn-sm btn-ghost filter-option"
        :aria-pressed="ui.commandFilters.recent === option[0]"
        :data-pressed="ui.commandFilters.recent === option[0]"
        @click="ui.commandFilters.recent = option[0]"
      >
        {{ option[1] }}
      </button>
      <button class="btn btn-sm btn-ghost reset-button" @click="ui.resetCommandFilters">
        Reset
      </button>
    </div>
  </div>
</template>

<style scoped>
.command-filters {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.filter-label {
  width: 62px;
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}
.filter-option {
  text-transform: capitalize;
}
.filter-option[data-pressed='true'] {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.reset-button {
  margin-left: auto;
}
</style>
