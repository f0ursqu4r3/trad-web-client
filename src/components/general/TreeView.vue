<template>
  <ul class="tv-root" role="tree">
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
    >
      <template #toggle-icon="slotProps">
        <slot name="toggle-icon" v-bind="slotProps" />
      </template>
      <template #default="slotProps">
        <slot v-bind="slotProps">
          <span class="tv-label">{{ getId(slotProps.item) }}</span>
        </slot>
      </template>
    </TreeNode>
  </ul>
</template>

<script lang="ts">
export interface TreeItem {
  id: Id
  children?: TreeItem[]
  // Additional user data is allowed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

type Id = string | number
</script>

<script lang="ts" setup>
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import type { PropType, VNode, Component } from 'vue'

const props = withDefaults(
  defineProps<{
    items: TreeItem[]
    /** When provided, enables v-model style control over expansion state */
    expandedIds?: Id[]
    /** Indentation in pixels for each level */
    indent?: number
    /** Expand all nodes on mount (only applies when component mounts) */
    defaultExpandAll?: boolean
    /** Optional accessor in case your items don't use the default `id`/`children` field names */
    getId?: (item: TreeItem) => Id
    getChildren?: (item: TreeItem) => TreeItem[] | undefined
  }>(),
  {
    indent: 16,
    defaultExpandAll: false,
    getId: (item: TreeItem) => item.id,
    getChildren: (item: TreeItem) => item.children,
  },
)

const emit = defineEmits<{
  (e: 'update:expandedIds', value: Id[]): void
}>()

const indentPx = computed(() => props.indent ?? 16)

// internal expanded set mirrors prop when provided, emits updates on change
const internalExpanded = ref<Set<Id>>(new Set(props.expandedIds ?? []))

watch(
  () => props.expandedIds,
  (v) => {
    if (v) internalExpanded.value = new Set(v)
    else internalExpanded.value = new Set()
  },
  { immediate: true },
)

function isExpandedId(id: Id) {
  return internalExpanded.value.has(id)
}

function setExpanded(id: Id, expanded: boolean) {
  const next = new Set(internalExpanded.value)
  if (expanded) next.add(id)
  else next.delete(id)
  internalExpanded.value = next
  emit('update:expandedIds', Array.from(next))
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
    const all = collectAllIds(props.items)
    internalExpanded.value = all
    emit('update:expandedIds', Array.from(all))
  }
})

// Expose getters so template and slots can use them
const getId = (item: TreeItem) => props.getId(item)

// Internal recursive node component
const TreeNode: Component = defineComponent({
  name: 'TreeNode',
  props: {
    item: { type: Object as PropType<TreeItem>, required: true },
    level: { type: Number, required: true },
    index: { type: Number, required: true },
    path: { type: Array as PropType<number[]>, required: true },
    indent: { type: Number, required: true },
    isExpanded: { type: Function as PropType<(id: Id) => boolean>, required: true },
    toggle: { type: Function as PropType<(id: Id) => void>, required: true },
  },
  setup(nodeProps, { slots }) {
    return (): VNode => {
      const id = getId(nodeProps.item)
      const children = props.getChildren(nodeProps.item) ?? []
      const expanded = nodeProps.isExpanded(id)
      const hasKids = Array.isArray(children) && children.length > 0

      return h(
        'li',
        {
          class: 'tv-node',
          role: 'treeitem',
          'aria-expanded': hasKids ? String(expanded) : undefined,
          style: { paddingLeft: `${nodeProps.level * nodeProps.indent}px` },
        },
        [
          h('div', { class: 'tv-row' }, [
            hasKids
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'tv-toggle',
                    'aria-label': expanded ? 'Collapse' : 'Expand',
                    onClick: () => nodeProps.toggle(id),
                  },
                  slots['toggle-icon']
                    ? slots['toggle-icon']({
                        expanded,
                        level: nodeProps.level,
                        item: nodeProps.item,
                      })
                    : [h('span', { class: 'tv-toggle-icon' }, expanded ? '▼' : '▶')],
                )
              : h('span', { class: 'tv-toggle-placeholder' }),

            slots.default
              ? slots.default({
                  item: nodeProps.item,
                  level: nodeProps.level,
                  expanded,
                  isLeaf: !hasKids,
                  toggle: () => nodeProps.toggle(id),
                  index: nodeProps.index,
                  path: nodeProps.path,
                })
              : h('span', { class: 'tv-label' }, String(id)),
          ]),

          hasKids && expanded
            ? h(
                'ul',
                { role: 'group', class: 'tv-children' },
                children.map((child, idx) =>
                  h(
                    TreeNode,
                    {
                      item: child,
                      level: nodeProps.level + 1,
                      index: idx,
                      path: [...nodeProps.path, idx],
                      indent: nodeProps.indent,
                      isExpanded: nodeProps.isExpanded,
                      toggle: nodeProps.toggle,
                      key: getId(child),
                    },
                    slots,
                  ),
                ),
              )
            : null,
        ],
      )
    }
  },
}) as unknown as Component
</script>

<style scoped>
.tv-root,
.tv-children {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.tv-node {
  line-height: 1.8;
}

.tv-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tv-toggle {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
}

.tv-toggle:focus-visible {
  outline: 2px solid var(--tv-focus, #5b9dd9);
  outline-offset: 2px;
  border-radius: 3px;
}

.tv-toggle-placeholder {
  width: 18px;
  height: 18px;
  display: inline-block;
}

.tv-label {
  user-select: none;
}
</style>
