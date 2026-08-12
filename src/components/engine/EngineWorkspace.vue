<script setup lang="ts">
import { computed } from 'vue'

import ProjectionDetails from '@/components/engine/ProjectionDetails.vue'
import TrailingEntryWorkspace from '@/components/engine/TrailingEntryWorkspace.vue'
import SplitView from '@/components/general/SplitView.vue'
import type { TrailingEntryProjection } from '@/lib/gateway'
import { useProjectionUiStore } from '@/stores/projectionUi'

const ui = useProjectionUiStore()
const trailingEntry = computed<TrailingEntryProjection | null>(() => {
  const command = ui.selectedCommand
  const graph = ui.graph
  if (command?.root.kind !== 'trailing_entry' || graph === null) return null
  return graph.trailing_entries.find((entry) => entry.trailing_entry_id === command.root.id) ?? null
})
</script>

<template>
  <SplitView
    v-if="trailingEntry"
    orientation="vertical"
    storage-key="engine-trailing-entry-workspace"
    :initial-sizes="[57, 43]"
    :min-pane-percent="18"
  >
    <template #chart>
      <TrailingEntryWorkspace :trailing-entry="trailingEntry" />
    </template>
    <template #details>
      <ProjectionDetails :show-actions="false" />
    </template>
  </SplitView>
  <ProjectionDetails v-else />
</template>
