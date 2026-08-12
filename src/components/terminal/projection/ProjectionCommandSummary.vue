<script setup lang="ts">
import { computed } from 'vue'

import type { CommandProjection, ProjectionGraph } from '@/lib/gateway'
import { commandSymbol } from '@/lib/projection/presentation'
import { formatExactDecimal } from '@/lib/exactDecimalMath'

const props = defineProps<{
  command: CommandProjection
  graph: ProjectionGraph
}>()

const symbol = computed(() => commandSymbol(props.command, props.graph))
const fields = computed(() => commandFields(props.command))

interface SummaryField {
  label: string
  value: string
}

function commandFields(command: CommandProjection): SummaryField[] {
  const parameters = command.accepted.parameters
  switch (command.accepted.kind) {
    case 'place_order':
      return orderFields(objectValue(parameters.request))
    case 'place_execution_group':
      return groupFields(parameters)
    case 'place_chase':
      return chaseFields(objectValue(parameters.plan))
    case 'place_trailing_entry':
      return trailingEntryFields(objectValue(parameters.plan))
    case 'close_exposure':
      return compact([
        field('Quantity', describeTagged(parameters.quantity)),
        field('Execution', describeTagged(parameters.execution)),
      ])
    case 'flatten':
    case 'cancel_entry_work':
      return compact([field('Target', describeTagged(parameters.target))])
    case 'configure_account':
      return compact([field('Configuration', describeTagged(parameters.request))])
    default:
      return compact(
        Object.entries(parameters)
          .slice(0, 4)
          .map(([label, value]) => field(title(label), describeValue(value))),
      )
  }
}

function orderFields(request: Record<string, unknown> | null): SummaryField[] {
  if (request === null) return []
  return compact([
    field('Side', stringValue(request.side)),
    field('Position', stringValue(request.position_side)),
    field('Quantity', exactValue(request.quantity)),
    field('Execution', describeTagged(request.execution)),
    request.reduce_only === true ? field('Intent', 'Reduce only') : null,
  ])
}

function groupFields(parameters: Record<string, unknown>): SummaryField[] {
  const children = Array.isArray(parameters.children) ? parameters.children : []
  const first = objectValue(children[0])
  return compact([
    field('Children', String(children.length)),
    field('Side', stringValue(first?.side)),
    field('Position', stringValue(first?.position_side)),
    field('Quantity', exactValue(parameters.target_quantity)),
  ])
}

function chaseFields(plan: Record<string, unknown> | null): SummaryField[] {
  if (plan === null) return []
  return compact([
    field('Side', stringValue(plan.side)),
    field('Position', stringValue(plan.position_side)),
    field('Quantity', exactValue(plan.quantity)),
    field('Boundary', describeTagged(plan.adverse_boundary)),
  ])
}

function trailingEntryFields(plan: Record<string, unknown> | null): SummaryField[] {
  if (plan === null) return []
  return compact([
    field('Position', stringValue(plan.position_side)),
    field('Activation', exactValue(plan.activation_price)),
    field('Jump', exactValue(plan.jump_basis_points, ' bps')),
    field('Risk', exactValue(plan.risk_amount, ' USDC')),
    field('Stop Loss', exactValue(plan.stop_loss_price)),
    field('Take Profit', describeTagged(plan.take_profit)),
  ])
}

function compact(fields: Array<SummaryField | null>): SummaryField[] {
  return fields.filter((value): value is SummaryField => value !== null && value.value !== '')
}

function field(label: string, value: string | null): SummaryField | null {
  return value === null || value === '' ? null : { label, value }
}

function exactValue(value: unknown, suffix = ''): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    return `${formatExactDecimal(value)}${suffix}`
  } catch {
    return `${value}${suffix}`
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? title(value) : null
}

function describeTagged(value: unknown): string | null {
  const object = objectValue(value)
  if (object === null) return describeValue(value)
  const kind = stringValue(object.kind)
  const amount = exactValue(object.quantity ?? object.value ?? object.price)
  return [kind, amount].filter(Boolean).join(' · ') || null
}

function describeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  const object = objectValue(value)
  return object === null ? null : stringValue(object.kind) ?? 'Configured'
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function title(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}
</script>

<template>
  <dl class="command-summary">
    <div v-if="symbol">
      <dt>Symbol</dt>
      <dd>{{ symbol }}</dd>
    </div>
    <div v-for="field in fields" :key="field.label">
      <dt>{{ field.label }}</dt>
      <dd>{{ field.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.command-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin: 0;
}

dt {
  color: var(--color-text-dim);
  font-size: 10px;
  margin-bottom: 2px;
  text-transform: uppercase;
}

dd {
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 12px;
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
