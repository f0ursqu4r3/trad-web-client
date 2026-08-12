<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

import type { TerminalTreeNode } from '@/lib/projection/terminalPresentation'
import { useProjectionUiStore } from '@/stores/projectionUi'

defineOptions({ name: 'ProjectionTreeRow' })

const props = defineProps<{
  node: TerminalTreeNode
  depth?: number
}>()

const projectionUi = useProjectionUiStore()
const expanded = ref(true)
const depth = computed(() => props.depth ?? 0)
const selected = computed(() => {
  if (props.node.entity.kind === 'native_protection') {
    return projectionUi.selectedProtectionId === props.node.entity.id
  }
  const node = projectionUi.selectedNode
  return node?.kind === props.node.entity.node.kind && node.id === props.node.entity.node.id
})

function select(): void {
  if (props.node.entity.kind === 'native_protection') {
    projectionUi.selectProtection(props.node.entity.id)
  } else {
    projectionUi.selectEntity(props.node.entity.node)
  }
}
</script>

<template>
  <div class="tree-branch">
    <button
      class="tree-row"
      :class="[{ selected }, `tone-${node.tone}`]"
      :style="{ '--tree-depth': depth }"
      type="button"
      @click="select"
    >
      <span
        class="tree-expander"
        :class="{ empty: node.children.length === 0 }"
        @click.stop="node.children.length > 0 && (expanded = !expanded)"
      >
        <ChevronDown v-if="node.children.length > 0 && expanded" :size="11" />
        <ChevronRight v-else-if="node.children.length > 0" :size="11" />
      </span>
      <span class="tree-label">{{ node.label }}</span>
      <span v-if="node.relationship" class="relationship">{{ node.relationship.replace(/_/g, ' ') }}</span>
      <span class="tree-badges">
        <span
          v-for="badge in node.badges"
          :key="`${badge.label}:${badge.tone}`"
          class="tree-badge"
          :class="`tone-${badge.tone}`"
        >
          {{ badge.label }}
        </span>
      </span>
      <span class="tree-status">{{ node.status.replace(/_/g, ' ') }}</span>
    </button>

    <div v-if="expanded && node.children.length" class="tree-children">
      <ProjectionTreeRow
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-row {
  --tone-color: var(--color-text-dim);
  align-items: center;
  background: transparent;
  border: 0;
  border-left: 3px solid transparent;
  color: var(--color-text-dim);
  display: grid;
  font-family: var(--font-mono);
  font-size: 11px;
  gap: 6px;
  grid-template-columns: 14px auto auto minmax(0, 1fr) auto;
  min-height: 27px;
  padding: 4px 8px 4px calc(8px + var(--tree-depth) * 20px);
  text-align: left;
  width: 100%;
}

.tree-row:hover { background: color-mix(in srgb, var(--color-text) 4%, transparent); }
.tree-row.selected {
  background: color-mix(in srgb, var(--tone-color) 10%, transparent);
  border-left-color: var(--tone-color);
  color: var(--color-text);
}

.tone-info { --tone-color: var(--color-info); }
.tone-success { --tone-color: var(--color-success); }
.tone-warning { --tone-color: var(--color-warning); }
.tone-error { --tone-color: var(--color-error); }

.tree-expander { align-items: center; display: inline-flex; justify-content: center; }
.tree-expander.empty { visibility: hidden; }
.tree-label { color: var(--color-text); white-space: nowrap; }
.relationship { color: var(--color-text-dim); font-size: 9px; text-transform: uppercase; }

.tree-badges {
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.tree-badge {
  border: 1px solid color-mix(in srgb, var(--tone-color) 35%, var(--border-color));
  color: var(--tone-color);
  font-size: 9px;
  line-height: 1.4;
  overflow: hidden;
  padding: 0 4px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-status {
  color: var(--tone-color);
  font-size: 9px;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
