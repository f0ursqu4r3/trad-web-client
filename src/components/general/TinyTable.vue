<template>
  <div
    class="tiny-table-wrapper"
    :class="{ dense: props.dense, striped: props.striped, hover: props.hover }"
    :style="{ '--tt-header-offset': props.stickyHeaderOffset + 'px' }"
  >
    <div
      class="tiny-table-scroll scroll-area"
      :style="{ height: bodyHeight, maxHeight: bodyMaxHeight }"
    >
      <table class="tiny-table table-tiny" :class="{ 'table-compact': props.hover }">
        <thead>
          <tr>
            <th
              v-for="col in props.columns"
              :key="col.key"
              :title="col.headerTitle || col.label"
              :style="{
                width: col.width
                  ? typeof col.width === 'number'
                    ? col.width + 'px'
                    : col.width
                  : undefined,
                textAlign: col.align || 'left',
                left: col.stickyLeft != null ? col.stickyLeft + 'px' : undefined,
                position: col.stickyLeft != null ? 'sticky' : undefined,
                zIndex: col.stickyLeft != null ? 3 : undefined,
              }"
              :class="{ 'is-sticky-left': col.stickyLeft != null }"
            >
              <slot :name="`header-${col.key}`">{{ col.label }}</slot>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!props.rows.length" class="empty">
            <td :colspan="props.columns.length">
              <slot name="empty"
                ><span class="muted">{{ props.emptyText }}</span></slot
              >
            </td>
          </tr>
          <tr
            v-for="(row, rIdx) in props.rows"
            :key="getRowKey(row, rIdx)"
            :aria-selected="isRowSelected(row, rIdx) ? 'true' : 'false'"
            :tabindex="props.selectable ? 0 : undefined"
            :class="{
              selected: isRowSelected(row, rIdx),
              selectable: props.selectable,
            }"
            @click="handleRowClick(row, rIdx)"
            @keydown="handleRowKeydown($event, row, rIdx)"
          >
            <td
              v-for="col in props.columns"
              :key="col.key"
              :style="{
                textAlign: col.align || 'left',
                left: col.stickyLeft != null ? col.stickyLeft + 'px' : undefined,
                position: col.stickyLeft != null ? 'sticky' : undefined,
                zIndex: col.stickyLeft != null ? 2 : undefined,
              }"
              :class="{ 'is-sticky-left': col.stickyLeft != null }"
            >
              <slot
                :name="`cell-${col.key}`"
                :row="row"
                :value="col.accessor ? col.accessor(row, rIdx) : (row as any)[col.key]"
                :rowIndex="rIdx"
              >
                {{ col.accessor ? col.accessor(row, rIdx) : (row as any)[col.key] }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TinyTable - lightweight, flexible table with a sticky header & scrollable body.
 * Props are intentionally minimal; heavy cell formatting should be done through slots.
 *
 * Slots:
 *  - header-{column.key}: custom header cell
 *  - cell-{column.key}: custom body cell (props: { row, value, rowIndex })
 *  - empty: custom empty state
 *
 * Example Usage:
 * <TinyTable
 *   :columns="[
 *     { key: 'symbol', label: 'Symbol', stickyLeft: 0 },
 *     { key: 'price', label: 'Price', align: 'right' },
 *     { key: 'qty', label: 'Qty', align: 'right' },
 *     { key: 'side', label: 'Side' }
 *   ]"
 *   :rows="orders"
 *   row-key="id"
 *   :max-height="180"
 *   striped
 * />
 *
 * <template #cell-price="{ value }">{{ Number(value).toFixed(2) }}</template>
 * <template #cell-side="{ value }">
 *   <span :class="value === 'BUY' ? 'buy' : 'sell'">{{ value }}</span>
 * </template>
 *
 * Theming:
 *  Uses (with fallbacks) these CSS variables from global theme:
 *   --panel-bg, --panel-header-bg, --panel-border-inner, --border-color,
 *   --color-text, --color-text-dim, --accent-color
 *  Component-scoped override variables (apply on parent or :root):
 *   --tt-bg
 *   --tt-header-bg
 *   --tt-border-color
 *   --tt-text-color
 *   --tt-text-dim
 *   --tt-row-hover
 *   --tt-row-alt
 *   --tt-scrollbar-track
 *   --tt-scrollbar-thumb
 *   --tt-sticky-shadow-color
 *  Example override:
 *  .some-panel .tiny-table-wrapper { --tt-row-hover: rgba(80,160,255,.12); }
 *
 * Selection API:
 *  Props:
 *    selectable (boolean) - enable row selection interactions
 *    selectionMode ('single' | 'multiple') - selection strategy (default 'single')
 *    selectedKey - controlled single selection key
 *    selectedKeys - controlled multi selection (array or Set)
 *    isSelected(row, index) - custom predicate override
 *    selectedRowKey - legacy single-select prop (supported for back-compat)
 *  Emits:
 *    row-click: { row, key, index }
 *    update:selectedKey(newKey | null)
 *    update:selectedKeys(newKeysArray)
 *  Theming additions:
 *    --tt-selection-bg
 *    --tt-selection-bg-hover
 *  Keyboard: Space / Enter toggles selection on focused row when selectable.
 */
import { computed } from 'vue'

export interface TinyTableColumn<Row = unknown> {
  key: string
  label?: string
  width?: string | number
  align?: 'left' | 'center' | 'right'
  accessor?: (row: Row, rowIndex: number) => unknown
  headerTitle?: string
  stickyLeft?: number
}

interface Props<Row = unknown> {
  columns: TinyTableColumn<Row>[]
  rows: Row[]
  rowKey?: ((row: Row, index: number) => string | number) | string
  height?: string | number | undefined
  maxHeight?: string | number
  dense?: boolean
  striped?: boolean
  hover?: boolean
  stickyHeaderOffset?: number
  emptyText?: string
  /* Legacy single selection (kept for backward compatibility) */
  selectedRowKey?: string | number | null | undefined
  /* New selection API */
  selectable?: boolean
  selectionMode?: 'single' | 'multiple'
  selectedKey?: string | number | null
  selectedKeys?: (string | number)[] | Set<string | number>
  isSelected?: (row: Row, index: number) => boolean
  /* Events (emits) are defined separately */
}

const emit = defineEmits<{
  (e: 'row-click', payload: { row: unknown; key: string | number; index: number }): void
  (e: 'update:selectedKey', key: string | number | null): void
  (e: 'update:selectedKeys', keys: (string | number)[]): void
}>()

const props = withDefaults(defineProps<Props>(), {
  rows: () => [],
  columns: () => [],
  height: '100%',
  maxHeight: '100%',
  dense: false,
  striped: false,
  hover: true,
  stickyHeaderOffset: 0,
  emptyText: 'No data',
  selectable: false,
  selectionMode: 'single',
  selectedRowKey: undefined,
  selectedKey: undefined,
  selectedKeys: undefined,
})

const bodyHeight = computed(() =>
  props.height ? (typeof props.height === 'number' ? `${props.height}px` : props.height) : 'auto',
)

const bodyMaxHeight = computed(() =>
  typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight,
)

function getRowKey<Row>(row: Row, index: number) {
  if (!props.rowKey) return index
  if (typeof props.rowKey === 'string') {
    const key = props.rowKey as keyof Row
    const val = (row as Record<string | number | symbol, unknown>)[key]
    return typeof val === 'string' || typeof val === 'number' ? val : index
  }
  return props.rowKey(row, index)
}

// --- Selection Logic ---
const multipleSelectedSet = computed(() => {
  if (props.selectionMode !== 'multiple') return null
  const src = props.selectedKeys
  if (!src) return new Set<string | number>()
  return src instanceof Set ? src : new Set(src)
})

function isRowSelected(row: unknown, idx: number): boolean {
  if (props.isSelected) return props.isSelected(row, idx)
  const key = getRowKey(row, idx)
  // Back-compat: if legacy selectedRowKey provided, prefer that when no new API active
  if (!props.selectable && props.selectedRowKey != null) {
    return props.selectedRowKey === key
  }
  if (!props.selectable) return false
  if (props.selectionMode === 'multiple') {
    return multipleSelectedSet.value?.has(key) ?? false
  }
  // single
  if (props.selectedKey != null) return props.selectedKey === key
  if (props.selectedRowKey != null) return props.selectedRowKey === key
  return false
}

function toggleSelection(row: unknown, idx: number) {
  if (!props.selectable) return
  const key = getRowKey(row, idx)
  if (props.selectionMode === 'multiple') {
    const current = new Set(multipleSelectedSet.value ?? [])
    if (current.has(key)) current.delete(key)
    else current.add(key)
    emit('update:selectedKeys', Array.from(current))
  } else {
    const current = props.selectedKey ?? props.selectedRowKey ?? null
    const next = current === key ? null : key
    emit('update:selectedKey', next)
  }
}

function handleRowClick(row: unknown, idx: number) {
  const key = getRowKey(row, idx)
  emit('row-click', { row, key, index: idx })
  toggleSelection(row, idx)
}

function handleRowKeydown(e: KeyboardEvent, row: unknown, idx: number) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    handleRowClick(row, idx)
  }
}
</script>

<style scoped>
.tiny-table-wrapper {
  /* Resolve to provided component override OR global theme OR fallback */
  --tt-border-color: var(--tt-border-color, var(--border-color, #2a3139));
  --tt-header-bg: var(--tt-header-bg, var(--panel-header-bg, #20252b));
  --tt-bg: var(--tt-bg, var(--panel-bg, #16191d));
  --tt-text-color: var(--tt-text-color, var(--color-text, #d0d7de));
  --tt-text-dim: var(--tt-text-dim, var(--color-text-dim, #8b949e));
  --tt-row-hover: var(--tt-row-hover, color-mix(in srgb, var(--tt-header-bg) 80%, transparent));
  --tt-row-alt: var(--tt-row-alt, color-mix(in srgb, var(--tt-bg) 92%, #000));
  --tt-scrollbar-track: var(--tt-scrollbar-track, var(--panel-bg, #16191d));
  --tt-scrollbar-thumb: var(
    --tt-scrollbar-thumb,
    color-mix(in srgb, var(--tt-border-color) 70%, #000)
  );
  --tt-sticky-shadow-color: var(--tt-sticky-shadow-color, rgba(0, 0, 0, 0.4));
  height: 100%;
  position: relative;
  font-size: 12px;
  line-height: 1.3;
  color: var(--tt-text-color);
  border: 1px solid var(--tt-border-color);
  border-radius: 4px;
  background: var(--tt-bg);
  overflow: hidden;
}

.tiny-table-wrapper.dense table :is(th, td) {
  padding: 2px 6px;
}

.tiny-table-wrapper:not(.dense) table :is(th, td) {
  padding: 4px 8px;
}

.tiny-table-scroll {
  overflow: auto;
  max-height: 240px;
}

table.tiny-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
}

thead th {
  position: sticky;
  top: var(--tt-header-offset, 0px);
  background: var(--tt-header-bg);
  font-weight: 600;
  text-align: left;
  z-index: 5;
  border-bottom: 1px solid var(--tt-border-color);
  color: var(--tt-text-color);
}

tbody tr.empty td {
  text-align: center;
  padding: 16px 8px;
  font-style: italic;
  opacity: 0.7;
}

tbody td {
  border-bottom: 1px solid color-mix(in srgb, var(--tt-border-color) 40%, transparent);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 320px;
  color: var(--tt-text-dim);
}

tbody tr:last-child td {
  border-bottom: none;
}

.striped tbody tr:nth-child(odd):not(.empty) {
  background: var(--tt-row-alt);
}

.hover tbody tr:not(.empty):hover {
  background: var(--tt-row-hover);
}

/* Selection */
tbody tr.selected {
  background: var(
    --tt-selection-bg,
    color-mix(in srgb, var(--accent-color, #2f81f7) 18%, var(--tt-bg))
  );
  outline: 1px solid var(--accent-color, #2f81f7);
  outline-offset: -1px;
}
tbody tr.selected:hover {
  background: var(
    --tt-selection-bg-hover,
    color-mix(in srgb, var(--accent-color, #2f81f7) 26%, var(--tt-bg))
  );
}
tbody tr.selectable {
  cursor: pointer;
  user-select: none;
}
tbody tr.selectable:focus-visible {
  outline: 2px solid var(--accent-color, #2f81f7);
  outline-offset: -2px;
}

/* Sticky left cells - add subtle divider */
.is-sticky-left {
  background: linear-gradient(
    to right,
    var(--tt-header-bg) 0%,
    var(--tt-header-bg) 70%,
    rgba(0 0 0 / 0) 100%
  );
  box-shadow:
    1px 0 0 0 var(--tt-border-color),
    4px 0 4px -2px var(--tt-sticky-shadow-color);
}

/* Scrollbar styling (WebKit) */
.tiny-table-scroll::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.tiny-table-scroll::-webkit-scrollbar-track {
  background: var(--tt-scrollbar-track);
}
.tiny-table-scroll::-webkit-scrollbar-thumb {
  background: var(--tt-scrollbar-thumb);
  border-radius: 6px;
}
.tiny-table-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--tt-scrollbar-thumb) 80%, #444);
}

/* Firefox scrollbar */
.tiny-table-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--tt-scrollbar-thumb) var(--tt-scrollbar-track);
}

/* Compact first/last padding adjustments */
.tiny-table-wrapper :is(th:first-child, td:first-child) {
  padding-left: 10px;
}
.tiny-table-wrapper :is(th:last-child, td:last-child) {
  padding-right: 10px;
}
</style>
