<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, EllipsisVertical, Pin } from 'lucide-vue-next'

import ProjectionCommandSummary from './ProjectionCommandSummary.vue'
import type { CommandProjection, ProjectionGraph } from '@/lib/gateway'
import { commandLabel } from '@/lib/projection/presentation'
import type { ProjectionCommandMeta } from '@/stores/projectionUi'

const props = defineProps<{
  command: CommandProjection
  graph: ProjectionGraph
  meta: ProjectionCommandMeta
  selected: boolean
}>()

const emit = defineEmits<{
  select: [commandId: string]
  pin: [commandId: string]
  menu: [command: CommandProjection, x: number, y: number]
}>()

const expanded = ref(false)
const shortId = computed(() => props.command.command_id.slice(0, 8))
const label = computed(() => props.meta.nickname || commandLabel(props.command))
const createdAt = computed(() =>
  new Date(props.command.accepted_at).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
)
const statusClass = computed(() => `command-status-${statusTone(props.command.lifecycle)}`)

function openContextMenu(event: MouseEvent): void {
  if (event.shiftKey) return
  event.preventDefault()
  event.stopPropagation()
  emit('menu', props.command, event.clientX, event.clientY)
}

function openButtonMenu(event: MouseEvent): void {
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('menu', props.command, rect.right, rect.bottom)
}

async function copyId(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.command.command_id)
  } catch {
    // Clipboard access can be denied outside a secure browser context.
  }
}

function statusTone(status: string): string {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'reconciliation_required') return 'error'
  if (status === 'partially_succeeded' || status === 'canceled') return 'warning'
  return 'info'
}
</script>

<template>
  <div
    class="projection-command-card"
    :class="{ selected, pinned: meta.pinned }"
    :data-command-id="command.command_id"
    role="button"
    tabindex="0"
    @click="emit('select', command.command_id)"
    @keydown.enter="emit('select', command.command_id)"
    @contextmenu="openContextMenu"
  >
    <div class="command-status-bar" :class="statusClass" />
    <div class="command-row-content">
      <div class="command-identity">
        <span class="command-label" :style="{ color: meta.nicknameColor ?? undefined }">
          {{ label }}
        </span>
        <button class="command-id" :title="command.command_id" @click.stop="copyId">
          #{{ shortId }}
        </button>
      </div>

      <div class="command-tail">
        <span class="created-at">{{ createdAt }}</span>
        <span class="command-lifecycle">{{ command.lifecycle.replace(/_/g, ' ') }}</span>
        <button
          class="btn btn-sm icon-btn command-action-btn"
          :title="meta.pinned ? 'Unpin' : 'Pin'"
          :aria-pressed="meta.pinned"
          @click.stop="emit('pin', command.command_id)"
        >
          <Pin :size="10" :class="{ 'pin-active': meta.pinned }" />
        </button>
        <button
          class="btn btn-sm icon-btn command-action-btn"
          title="Menu"
          aria-label="Command menu"
          @click="openButtonMenu"
        >
          <EllipsisVertical :size="10" />
        </button>
        <button
          class="btn btn-sm icon-btn command-action-btn"
          :title="expanded ? 'Collapse' : 'Expand'"
          aria-label="Toggle command details"
          @click.stop="expanded = !expanded"
        >
          <ChevronDown :size="10" :class="{ expanded }" />
        </button>
      </div>
    </div>

    <p v-if="command.failure_reason" class="command-error" :title="command.failure_reason">
      {{ command.failure_reason }}
    </p>

    <div v-if="expanded" class="command-expanded" @click.stop>
      <ProjectionCommandSummary :command="command" :graph="graph" />
    </div>
  </div>
</template>

<style scoped>
.projection-command-card {
  border: 1px solid var(--border-color);
  box-shadow: none;
  cursor: pointer;
  min-height: 42px;
  position: relative;
}

.projection-command-card.selected {
  box-shadow: 0 0 0 1px var(--color-text);
}

.projection-command-card.pinned {
  background: color-mix(in srgb, var(--panel-bg) 70%, var(--accent-color) 6%);
}

.command-status-bar {
  bottom: 0;
  left: 0;
  position: absolute;
  top: 0;
  width: 4px;
}

.command-status-success {
  background: var(--color-success);
}
.command-status-error {
  background: var(--color-error);
}
.command-status-warning {
  background: var(--color-warning);
}
.command-status-info {
  background: var(--color-info);
}

.command-row-content {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 8px 10px 8px 12px;
}

.command-identity,
.command-tail {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.command-label {
  color: var(--color-text-dim);
  font-size: 13px;
}

.command-id,
.created-at,
.command-lifecycle {
  background: transparent;
  border: 0;
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 0;
}

.command-lifecycle {
  font-size: 11px;
  text-transform: uppercase;
}

.command-tail {
  justify-content: flex-end;
}

:deep(.command-action-btn) {
  align-items: center;
  background: transparent;
  border-radius: var(--radius-btn);
  box-shadow: none;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  line-height: 0;
  min-height: 24px;
  min-width: 24px;
  padding: 0;
  width: 24px;
}

.pin-active {
  color: var(--accent-color);
  transform: rotate(-90deg);
}
.expanded {
  transform: rotate(180deg);
}

.command-error {
  border-left: 2px solid var(--color-error);
  color: var(--color-error);
  font-size: 11px;
  margin: 0 12px 8px;
  overflow: hidden;
  padding-left: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-expanded {
  border-top: 1px solid var(--border-color);
  padding: 10px 12px;
}

@media (max-width: 760px) {
  .command-row-content {
    align-items: stretch;
    flex-direction: column;
    gap: 4px;
  }
  .command-tail {
    justify-content: flex-start;
  }
}
</style>
