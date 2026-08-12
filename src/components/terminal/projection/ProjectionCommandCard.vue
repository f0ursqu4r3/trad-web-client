<script setup lang="ts">
import { computed, ref } from 'vue'

import CommandBase from '@/components/terminal/commands/CommandBase.vue'
import type { CommandMenuAction } from '@/components/terminal/commands/presentation'
import ProjectionCommandSummary from './ProjectionCommandSummary.vue'
import { lifecycleActions, type LifecycleAction } from '@/lib/engineCommands/lifecycle'
import type { CommandProjection, ProjectionGraph } from '@/lib/gateway'
import { nodeKey } from '@/lib/projection'
import { commandLabel, projectionEntities } from '@/lib/projection/presentation'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import type { ProjectionCommandMeta } from '@/stores/projectionUi'

const props = defineProps<{
  command: CommandProjection
  graph: ProjectionGraph
  meta: ProjectionCommandMeta
  selected: boolean
  canDuplicate: boolean
}>()

const emit = defineEmits<{
  select: [commandId: string]
  duplicate: [command: CommandProjection]
  pin: [commandId: string]
  rename: [command: CommandProjection]
  action: [action: LifecycleAction]
}>()

const projections = useAccountProjectionStore()
const menuPrepared = ref(false)
const root = computed(
  () => projectionEntities(props.graph).get(nodeKey(props.command.root)) ?? null,
)
const actions = computed(() => {
  if (!menuPrepared.value) return []
  return lifecycleActions(root.value, props.graph, projections.selectedLive?.positions ?? [])
})
const menuActions = computed<CommandMenuAction[]>(() =>
  actions.value.map((action) => ({
    id: action.kind,
    label: action.label,
    danger: action.danger,
    title: action.danger ? 'Risk-reducing action; review the confirmation carefully.' : undefined,
  })),
)
const commandStatus = computed(() => {
  const labels: Record<string, string> = {
    running: 'Running',
    succeeded: 'Succeeded',
    partially_succeeded: 'Partially Succeeded',
    failed: 'Failed',
    canceled: 'Canceled',
    reconciliation_required: 'Reconciliation Required',
  }
  return labels[props.command.lifecycle] ?? props.command.lifecycle
})

function runAction(actionId: string): void {
  const action = actions.value.find((candidate) => candidate.kind === actionId)
  if (action !== undefined) emit('action', action)
}
</script>

<template>
  <div
    class="projection-command-card border border-[var(--border-color)]"
    :class="selected ? 'selected ring-2 ring-[var(--color-text)]' : ''"
    :data-command-id="command.command_id"
  >
    <CommandBase
      :command-id="command.command_id"
      :command-status="commandStatus"
      :command-kind="command.accepted.kind"
      :label="commandLabel(command)"
      :created-at="new Date(command.accepted_at).toISOString()"
      :nickname="meta.nickname"
      :nickname-color="meta.nicknameColor"
      :pinned="meta.pinned"
      :can-duplicate="canDuplicate"
      :result="command.failure_reason"
      :menu-actions="menuActions"
      @inspect="emit('select', command.command_id)"
      @duplicate="emit('duplicate', command)"
      @pin="emit('pin', command.command_id)"
      @rename="emit('rename', command)"
      @request-action-context="menuPrepared = true"
      @menu-action="runAction"
    >
      <ProjectionCommandSummary :command="command" :graph="graph" />
    </CommandBase>
  </div>
</template>
