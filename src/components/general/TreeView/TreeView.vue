<template>
  <ul class="list-none p-0 m-0" role="tree">
    <TreeNode
      v-for="(item, idx) in items"
      :key="getId(item)"
      :item="item"
      :level="0"
      :index="idx"
      :path="[idx]"
      :indent="indentPx"
      :isExpanded="isExpandedId"
      :toggle="toggleId"
      :getId="getId"
      :getChildren="props.getChildren"
      :inlineToggle="props.inlineToggle"
    >
      <template #default="slotProps">
        <slot v-bind="slotProps">
          <span class="select-none">{{ getId(slotProps.item) }}</span>
        </slot>
      </template>
    </TreeNode>
  </ul>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { type Id, type TreeItem } from './types'
import TreeNode from './TreeNode.vue'

const props = withDefaults(
  defineProps<{
    items: TreeItem[]
    /**
     * Collapsed ids model — preferred. When provided, enables v-model style control over collapse state.
     * Default behavior without this prop is: everything expanded (collapsedIds = []).
     */
    collapsedIds?: Id[]
    /** Indentation in pixels for each level */
    indent?: number
    /** Expand all nodes on mount (only applies when component mounts) */
    defaultExpandAll?: boolean
    /** If true, TreeView will not render a leading toggle button; consumers can place a chevron inline within the default slot using { expanded, toggle, isLeaf } */
    inlineToggle?: boolean
    /** Optional accessor in case your items don't use the default `id`/`children` field names */
    getId?: (item: TreeItem) => Id
    getChildren?: (item: TreeItem) => TreeItem[] | undefined
  }>(),
  {
    indent: 16,
    defaultExpandAll: false,
    inlineToggle: false,
    getId: (item: TreeItem) => item.id,
    getChildren: (item: TreeItem) => item.children,
  },
)

const emit = defineEmits<{
  (e: 'update:collapsedIds', value: Id[]): void
  /** Deprecated: emitted for backward compatibility when model is manipulated via UI */
  (e: 'update:expandedIds', value: Id[]): void
}>()

const indentPx = computed(() => props.indent ?? 16)

// Internal collapsed set mirrors prop when provided, emits updates on change
const internalCollapsed = ref<Set<Id>>(new Set(props.collapsedIds ?? []))

watch(
  () => props.collapsedIds,
  (v) => {
    if (v) internalCollapsed.value = new Set(v)
    else internalCollapsed.value = new Set()
  },
  { immediate: true },
)

function isExpandedId(id: Id) {
  return !internalCollapsed.value.has(id)
}

function setExpanded(id: Id, expanded: boolean) {
  const next = new Set(internalCollapsed.value)
  if (expanded) next.delete(id)
  else next.add(id)
  internalCollapsed.value = next
  emit('update:collapsedIds', Array.from(next))
  // Back-compat emit for expandedIds
  const all = collectAllIds(props.items)
  const expandedNow = Array.from(all).filter((x) => !next.has(x))
  emit('update:expandedIds', expandedNow)
}

function toggleId(id: Id) {
  setExpanded(id, !isExpandedId(id))
}

function collectAllIds(items: TreeItem[], acc: Set<Id> = new Set()): Set<Id> {
  for (const it of items) {
    acc.add(props.getId(it))
    const children = props.getChildren(it)
    if (Array.isArray(children) && children.length) collectAllIds(children, acc)
  }
  return acc
}

onMounted(() => {
  if (props.defaultExpandAll) {
    // defaultExpandAll => collapsed = [] (already the default), but normalize state and emit
    internalCollapsed.value = new Set()
    emit('update:collapsedIds', [])
    const all = collectAllIds(props.items)
    emit('update:expandedIds', Array.from(all))
  }
})

// Expose getters so template and slots can use them
const getId = (item: TreeItem) => props.getId(item)
</script>
<style scoped></style>
