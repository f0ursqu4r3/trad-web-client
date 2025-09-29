<script lang="ts" setup>
import { computed, type VNodeChild } from 'vue'
import type { TreeItem, Id } from './types'

// Declare the slots this component accepts to improve type inference for parents
defineSlots<{
  default(props: {
    item: TreeItem
    level: number
    expanded: boolean
    isLeaf: boolean
    toggle: () => void
    index: number
    path: number[]
  }): VNodeChild
  'toggle-icon'(props: { expanded: boolean; level: number; item: TreeItem }): VNodeChild
}>()

defineOptions({ name: 'TreeNode' })

const props = defineProps<{
  item: TreeItem
  level: number
  index: number
  path: number[]
  indent: number
  isExpanded: (id: Id) => boolean
  toggle: (id: Id) => void
  getId: (item: TreeItem) => Id
  getChildren: (item: TreeItem) => TreeItem[] | undefined
  inlineToggle?: boolean
}>()

const id = computed(() => props.getId(props.item))
const children = computed(() => props.getChildren(props.item) ?? [])
const expanded = computed(() => props.isExpanded(id.value))
const hasChildren = computed(() => Array.isArray(children.value) && children.value.length > 0)

function onToggle() {
  props.toggle(id.value)
}
</script>

<template>
  <li
    class="leading-7"
    role="treeitem"
    :aria-expanded="hasChildren ? !!expanded : undefined"
    :style="{ paddingLeft: `${level * indent}px` }"
  >
    <div class="flex items-center gap-1.5">
      <button
        v-if="!inlineToggle && hasChildren"
        type="button"
        class="inline-flex items-center justify-center border-0 bg-transparent p-0 cursor-pointer text-current rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
        :aria-label="expanded ? 'Collapse' : 'Expand'"
        @click="onToggle"
      >
        <slot name="toggle-icon" :expanded="expanded" :level="level" :item="item">
          <span class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim">
            {{ expanded ? '▼' : '▶' }}
          </span>
        </slot>
      </button>
      <span v-else class="inline-block w-4" aria-hidden="true"></span>

      <slot
        :item="item"
        :level="level"
        :expanded="expanded"
        :isLeaf="!hasChildren"
        :toggle="onToggle"
        :index="index"
        :path="path"
      >
        <span class="select-none">{{ id }}</span>
      </slot>
    </div>

    <ul v-if="hasChildren && expanded" role="group" class="list-none p-0 m-0">
      <TreeNode
        v-for="(child, idx) in children"
        :key="getId(child)"
        :item="child"
        :level="level + 1"
        :index="idx"
        :path="[...path, idx]"
        :indent="indent"
        :isExpanded="isExpanded"
        :toggle="toggle"
        :getId="getId"
        :getChildren="getChildren"
        :inlineToggle="inlineToggle"
      >
        <template #toggle-icon="slotProps">
          <slot name="toggle-icon" v-bind="slotProps" />
        </template>
        <template #default="slotProps">
          <slot v-bind="slotProps" />
        </template>
      </TreeNode>
    </ul>
  </li>
</template>

<style scoped></style>
