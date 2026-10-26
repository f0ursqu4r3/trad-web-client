<script setup lang="ts">
import { computed } from 'vue'
import MethodTag from './MethodTag.vue'
import {
  formatFactor,
  formatValue,
  improvementFactor,
  type ReportRow,
  type ReportTable,
} from './reportFormat'

const props = defineProps<{ table: ReportTable }>()

// Rows with several figures say which one the factor compares (p50, p99).
const hasBasis = computed(() => props.table.rows.some((row) => row.factorAt !== undefined))
const hasConditions = computed(() => props.table.rows.some((row) => Boolean(row.conditions)))

function factorText(row: ReportRow): string {
  return formatFactor(improvementFactor(row.before, row.after, row.factorAt?.index ?? null))
}

// A group prints on its first row only.
function startsGroup(index: number): boolean {
  const row = props.table.rows[index]!
  return index === 0 || props.table.rows[index - 1]!.group !== row.group
}
</script>

<template>
  <div class="report-table-scroll">
    <table class="table-tiny report-table">
      <thead>
        <tr>
          <th v-if="table.groupLabel">{{ table.groupLabel }}</th>
          <th>{{ table.measureLabel }}</th>
          <th class="num">Before</th>
          <th class="num">After</th>
          <th class="num">Factor</th>
          <th v-if="hasConditions">Conditions</th>
          <th>Method</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in table.rows"
          :key="`${row.group ?? ''}${row.measure}`"
          :class="{ 'group-start': table.groupLabel && startsGroup(index) && index > 0 }"
        >
          <td v-if="table.groupLabel" class="group">
            {{ startsGroup(index) ? row.group : '' }}
          </td>
          <td class="measure">
            {{ row.measure }}
            <span v-if="row.notShipped" class="not-shipped">not shipped</span>
          </td>
          <td class="num before">{{ row.before ? formatValue(row.before) : '—' }}</td>
          <td class="num after">{{ formatValue(row.after) }}</td>
          <td class="num factor">
            {{ factorText(row)
            }}<span v-if="hasBasis" class="factor-basis">{{
              factorText(row) ? (row.factorAt?.label ?? '') : ''
            }}</span>
          </td>
          <td v-if="hasConditions" class="conditions">{{ row.conditions }}</td>
          <td class="method"><MethodTag :method="row.method" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.report-table-scroll {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  background: var(--surface-base);
}
.report-table-scroll + .report-table-scroll {
  margin-top: 1rem;
}
.report-table {
  min-width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.report-table th,
.report-table td {
  white-space: nowrap;
}
.report-table th.num,
.report-table td.num {
  text-align: right;
}
.report-table tbody tr:last-child td {
  border-bottom: 0;
}
.report-table tbody tr:hover {
  background: var(--row-hover-bg);
}
.report-table tr.group-start td {
  border-top: 1px solid var(--border-normal);
}
.group {
  color: var(--fg-strong);
}
.measure {
  color: var(--fg);
  white-space: normal !important;
  min-width: 15rem;
}
.before {
  color: var(--fg-muted);
}
.after {
  color: var(--fg-strong);
}
.factor {
  color: var(--fg);
}
.factor-basis {
  display: inline-block;
  width: 2.6em;
  color: var(--fg-muted);
  font-size: 11px;
  text-align: right;
}
/* The first column stays in view while a narrow screen scrolls the rest. */
.report-table th:first-child,
.report-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  box-shadow: 1px 0 0 var(--border-subtle);
}
.report-table td:first-child {
  background: var(--surface-base);
}
.conditions {
  color: var(--fg-muted);
  font-size: 12px;
  white-space: normal !important;
  min-width: 14rem;
}
.not-shipped {
  margin-left: 0.4rem;
  padding: 0.05rem 0.3rem;
  border: 1px solid color-mix(in srgb, var(--state-warning) 42%, var(--border-normal));
  color: var(--state-warning);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .measure {
    min-width: 8.5rem;
    font-size: 12px;
  }
  .conditions {
    min-width: 10rem;
  }
}
</style>
