<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

import { entityLabel, entityStatus, type ProjectionTreeNode } from '@/lib/projection/presentation'
import { useProjectionUiStore } from '@/stores/projectionUi'

defineOptions({ name: 'ProjectionTreeNode' })

const props = defineProps<{
  tree: ProjectionTreeNode
  depth?: number
}>()

const ui = useProjectionUiStore()
const expanded = ref(true)
const hasChildren = computed(() => props.tree.children.length > 0)
const selected = computed(
  () =>
    ui.selectedNode?.kind === props.tree.entity.kind &&
    ui.selectedNode?.id === props.tree.entity.id,
)
</script>

<template>
  <div class="tree-branch">
    <button
      class="tree-row"
      :data-node-kind="tree.entity.kind"
      :data-node-id="tree.entity.id"
      :class="[{ selected }, `lifecycle-${entityStatus(tree.entity)}`]"
      :style="{ paddingLeft: `${(depth ?? 0) * 16 + 5}px` }"
      @click="ui.selectEntity({ kind: tree.entity.kind, id: tree.entity.id })"
    >
      <span
        class="expand-control"
        :class="{ hidden: !hasChildren }"
        @click.stop="expanded = !expanded"
      >
        <ChevronDown v-if="expanded" :size="12" />
        <ChevronRight v-else :size="12" />
      </span>
      <span class="tree-label">{{ entityLabel(tree.entity) }}</span>
      <span class="tree-id">#{{ tree.entity.id.slice(0, 8) }}</span>
      <span class="tree-status">{{ entityStatus(tree.entity) }}</span>
    </button>
    <ProjectionTreeNode
      v-for="child in expanded ? tree.children : []"
      :key="`${child.entity.kind}:${child.entity.id}`"
      :tree="child"
      :depth="(depth ?? 0) + 1"
    />
  </div>
</template>

<style scoped>
.tree-row {
  display: grid;
  width: 100%;
  min-height: 30px;
  grid-template-columns: 16px minmax(0, 1fr) auto auto;
  gap: 7px;
  align-items: center;
  padding-top: 4px;
  padding-right: 7px;
  padding-bottom: 4px;
  color: var(--color-text);
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 65%, transparent);
}

.tree-row:hover,
.tree-row.selected {
  background: var(--color-bg-hover);
}

.tree-row.selected {
  box-shadow: inset 2px 0 var(--color-accent);
}

.expand-control {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  color: var(--color-text-dim);
}

.expand-control.hidden {
  visibility: hidden;
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-id,
.tree-status {
  color: var(--color-text-dim);
  font-size: 11px;
}

.tree-status {
  text-transform: uppercase;
}

.lifecycle-failed .tree-status,
.lifecycle-reconciliation_required .tree-status {
  color: var(--color-error);
}

.lifecycle-running .tree-status,
.lifecycle-working .tree-status,
.lifecycle-tracking .tree-status {
  color: var(--color-info);
}
</style>
