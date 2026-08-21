<script setup lang="ts">
import { Filter } from 'lucide-vue-next'

import ProjectionCommandFilters from '@/components/engine/ProjectionCommandFilters.vue'
import { useProjectionUiStore } from '@/stores/projectionUi'

defineProps<{ shown: number; hidden: number }>()
const query = defineModel<string>({ default: '' })
const ui = useProjectionUiStore()
</script>

<template>
  <div class="trade-discovery">
    <div class="trade-discovery-bar">
      <input v-model="query" class="input trade-search" type="search" placeholder="Filter trades" />
      <span class="trade-count">
        {{ shown }} shown<span v-if="hidden"> · {{ hidden }} hidden</span>
      </span>
      <button
        class="btn btn-sm icon-btn"
        type="button"
        title="Trade filters"
        :aria-pressed="ui.showCommandFilters"
        @click="ui.showCommandFilters = !ui.showCommandFilters"
      >
        <Filter :size="13" />
      </button>
    </div>
    <ProjectionCommandFilters v-if="ui.showCommandFilters" />
  </div>
</template>

<style scoped>
.trade-discovery {
  background: var(--surface-sunken);
}
.trade-discovery-bar {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border-normal);
}
.trade-search {
  min-width: 160px;
  max-width: 28rem;
  flex: 1;
}
.trade-count {
  color: var(--fg-muted);
  font-size: 11px;
  white-space: nowrap;
}
</style>
