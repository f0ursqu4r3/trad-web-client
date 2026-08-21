<script setup lang="ts">
import { Filter } from 'lucide-vue-next'

import { useProjectionUiStore } from '@/stores/projectionUi'

defineProps<{ shown: number; hidden: number }>()
const query = defineModel<string>({ default: '' })
const ui = useProjectionUiStore()
</script>

<template>
  <div class="trade-discovery">
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
</template>

<style scoped>
.trade-discovery {
  display: flex;
  min-width: 180px;
  max-width: 34rem;
  flex: 1;
  align-items: center;
  gap: 0.45rem;
}
.trade-search {
  min-width: 120px;
  max-width: 28rem;
  flex: 1;
  min-height: 28px;
}
.trade-count {
  color: var(--fg-muted);
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 620px) {
  .trade-discovery {
    min-width: 100%;
    max-width: none;
    order: 3;
  }
}
</style>
