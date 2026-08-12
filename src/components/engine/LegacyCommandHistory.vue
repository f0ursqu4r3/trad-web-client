<script setup lang="ts">
import { computed, ref } from 'vue'
import { Archive, RefreshCw } from 'lucide-vue-next'

import type {
  LegacyCommandEvidence,
  LegacyDeviceEvidence,
  LegacyRelationshipEvidence,
  Uuid,
} from '@/lib/gateway'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{ query: string }>()
const projections = useAccountProjectionStore()
const gateway = useGatewayStore()
const loading = ref(false)
const error = ref<string | null>(null)

const migration = computed(
  () => projections.selected?.view?.live.checkpoint.legacy_migration ?? null,
)
const archive = computed(() => projections.selected?.view?.legacyHistory ?? null)
const unresolved = computed(() => new Set(archive.value?.unresolved_active_entities ?? []))
const commands = computed(() => {
  const rows = [...(archive.value?.commands ?? [])]
  rows.sort(
    (left, right) =>
      (right.created_at ?? 0) - (left.created_at ?? 0) ||
      right.command_id.localeCompare(left.command_id),
  )
  const query = props.query.trim().toLowerCase()
  if (query.length === 0) return rows
  return rows.filter((command) =>
    [
      command.kind,
      command.lifecycle,
      command.command_id,
      ...commandDevices(command).flatMap(search),
    ]
      .filter((value): value is string => value !== null)
      .some((value) => value.toLowerCase().includes(query)),
  )
})
const canLoad = computed(() => archive.value === null || archive.value.next_cursor !== null)

async function load(): Promise<void> {
  error.value = null
  loading.value = true
  try {
    await gateway.requestLegacyHistory()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    loading.value = false
  }
}

function commandDevices(command: LegacyCommandEvidence): LegacyDeviceEvidence[] {
  const page = archive.value
  if (page === null) return []
  const selected = new Set<Uuid>()
  let changed = true
  while (changed) {
    changed = false
    for (const edge of page.relationships) {
      if (edge.parent_id !== command.command_id && !selected.has(edge.parent_id)) continue
      if (!selected.has(edge.child_id)) {
        selected.add(edge.child_id)
        changed = true
      }
    }
  }
  return page.devices.filter((device) => selected.has(device.device_id))
}

function relationshipFor(device: LegacyDeviceEvidence): LegacyRelationshipEvidence | undefined {
  return archive.value?.relationships.find((edge) => edge.child_id === device.device_id)
}

function search(device: LegacyDeviceEvidence): Array<string | null> {
  return [device.kind, device.lifecycle, device.symbol, device.position_side, device.device_id]
}

function formatTime(value: number | null): string {
  return value === null ? 'Unknown time' : new Date(value).toLocaleString()
}

function label(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}
</script>

<template>
  <section v-if="migration !== null" class="legacy-history" data-testid="legacy-migration-state">
    <header class="legacy-header">
      <span class="legacy-title"><Archive :size="13" /> Imported account state</span>
      <button
        v-if="canLoad"
        class="btn btn-sm btn-ghost load-button"
        :disabled="loading"
        @click="load"
      >
        <RefreshCw :size="12" :class="{ spinning: loading }" />
        {{ archive === null ? 'Load history' : 'Older imported' }}
      </button>
    </header>
    <span>
      {{ migration.devices }} devices preserved · {{ migration.active_unresolved }} active awaiting
      reconciliation
    </span>
    <span v-if="migration.blocks_new_risk" class="risk-warning">
      New exposure is blocked until exchange ownership and protection are proven.
    </span>
    <span v-if="archive !== null" class="archive-count">
      {{ archive.commands.length }} of {{ migration.commands }} imported commands loaded
    </span>
    <span v-if="error" class="error-text">{{ error }}</span>

    <div v-if="archive !== null" class="legacy-rows">
      <details v-for="command in commands" :key="command.command_id" class="legacy-command">
        <summary>
          <span>
            <strong>{{ label(command.kind) }}</strong>
            <small>#{{ command.command_id.slice(0, 8) }}</small>
          </span>
          <span class="legacy-tail">
            <small>{{ formatTime(command.created_at) }}</small>
            <span :class="`legacy-${command.lifecycle}`">{{ command.lifecycle }}</span>
          </span>
        </summary>
        <div class="legacy-details">
          <span v-if="command.redacted">Sensitive payload redacted</span>
          <div
            v-for="device in commandDevices(command)"
            :key="device.device_id"
            class="legacy-device"
          >
            <div class="device-heading">
              <strong>{{ label(device.kind) }}</strong>
              <span>{{ device.symbol }} {{ device.position_side }}</span>
              <span>{{ device.lifecycle }}</span>
              <span v-if="unresolved.has(device.device_id)" class="risk-warning">unresolved</span>
            </div>
            <span>
              #{{ device.device_id.slice(0, 8) }} ·
              {{ label(relationshipFor(device)?.relationship_kind ?? 'unlinked') }} ·
              {{ relationshipFor(device)?.confidence ?? 'unknown' }}
            </span>
            <span v-if="device.failure_reason" class="error-text">{{ device.failure_reason }}</span>
            <span v-if="device.client_order_ids.length > 0">
              Client IDs: {{ device.client_order_ids.join(', ') }}
            </span>
            <span v-if="device.remote_order_ids.length > 0">
              Exchange IDs: {{ device.remote_order_ids.join(', ') }}
            </span>
            <span v-for="(value, name) in device.financial_values" :key="name">
              {{ label(String(name)) }}: {{ value.value }}
              <small>({{ value.origin }})</small>
            </span>
          </div>
        </div>
      </details>
      <div v-if="commands.length === 0" class="legacy-empty">No imported commands match.</div>
    </div>
  </section>
</template>

<style scoped>
.legacy-history {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  color: var(--color-text-dim);
  border-bottom: 1px solid var(--border-color);
}

.legacy-header,
.legacy-title,
.load-button,
.device-heading {
  display: flex;
  align-items: center;
}

.legacy-header {
  justify-content: space-between;
  gap: 8px;
}

.legacy-title,
.load-button,
.device-heading {
  gap: 5px;
}

.legacy-title,
.risk-warning {
  color: var(--color-warning);
}

.archive-count {
  color: var(--color-info);
}

.legacy-rows {
  max-height: 280px;
  overflow: auto;
  border-top: 1px solid var(--border-color);
}

.legacy-command {
  padding: 5px 0;
  border-bottom: 1px solid var(--border-color);
}

.legacy-command summary {
  display: flex;
  cursor: pointer;
  justify-content: space-between;
  gap: 8px;
}

.legacy-command summary > span,
.legacy-tail,
.legacy-details,
.legacy-device {
  display: flex;
  flex-direction: column;
}

.legacy-tail {
  align-items: flex-end;
  text-transform: uppercase;
}

.legacy-details,
.legacy-device {
  gap: 3px;
}

.legacy-details {
  padding: 6px 2px 2px 14px;
}

.legacy-device {
  padding: 5px 0;
  border-top: 1px dotted var(--border-color);
}

.legacy-failed,
.error-text {
  color: var(--color-error);
}

.legacy-succeeded {
  color: var(--color-success);
}

.legacy-active {
  color: var(--color-warning);
}

.legacy-empty {
  padding: 8px 0;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
