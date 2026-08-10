import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import type { CommandProjection, ProjectionNodeId, Uuid } from '@/lib/gateway'
import {
  commandTree,
  projectionEntities,
  type ProjectionEntity,
  type ProjectionTreeNode,
} from '@/lib/projection/presentation'
import { nodeKey } from '@/lib/projection'
import {
  defaultProjectionCommandFilters,
  filterProjectionCommands,
  type ProjectionCommandFilters,
} from '@/lib/projection/commandFilters'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'

export interface ProjectionCommandMeta {
  nickname: string | null
  nicknameColor: string | null
  pinned: boolean
}

export const useProjectionUiStore = defineStore(
  'projectionUi',
  () => {
    const accounts = useAccountsStore()
    const projections = useAccountProjectionStore()
    const ui = useUiStore()
    const selectedCommandId = ref<Uuid | null>(null)
    const selectedNode = ref<ProjectionNodeId | null>(null)
    const autoSelectNewCommands = ref(true)
    const commandMeta = ref<Record<Uuid, ProjectionCommandMeta>>({})
    const commandFilters = ref<ProjectionCommandFilters>(defaultProjectionCommandFilters())
    const showCommandFilters = ref(false)
    const newestSeen = new Map<Uuid, [number, Uuid]>()

    const graph = computed(() => projections.selectedGraph)
    const commands = computed(() => projections.selectedCommands)
    const orderedCommands = computed(() => {
      const rows = [...commands.value]
      rows.sort(compareCommands)
      if (ui.newestCommandsFirst) rows.reverse()
      rows.sort(
        (left, right) =>
          Number(meta(right.command_id).pinned) - Number(meta(left.command_id).pinned),
      )
      return rows
    })
    const filteredCommands = computed(() =>
      filterProjectionCommands(
        orderedCommands.value,
        graph.value,
        projections.selectedLive?.positions ?? [],
        commandFilters.value,
      ),
    )
    const selectedCommand = computed(
      () => commands.value.find((row) => row.command_id === selectedCommandId.value) ?? null,
    )
    const selectedTree = computed<ProjectionTreeNode | null>(() => {
      if (graph.value === null || selectedCommandId.value === null) return null
      return commandTree(graph.value, selectedCommandId.value)
    })
    const selectedEntity = computed<ProjectionEntity | null>(() => {
      if (graph.value === null || selectedNode.value === null) return null
      return projectionEntities(graph.value).get(nodeKey(selectedNode.value)) ?? null
    })

    watch(
      () => accounts.selectedAccountId,
      () => {
        selectedCommandId.value = null
        selectedNode.value = null
      },
    )

    watch(
      commands,
      (rows) => {
        const accountId = accounts.selectedAccountId
        if (accountId === null || rows.length === 0) {
          selectedCommandId.value = null
          selectedNode.value = null
          return
        }
        const sorted = [...rows].sort(compareCommands)
        const newest = sorted[sorted.length - 1] ?? null
        if (newest === null) return
        const prior = newestSeen.get(accountId)
        const next: [number, Uuid] = [newest.accepted_at, newest.command_id]
        newestSeen.set(accountId, next)

        const selectionExists = rows.some((row) => row.command_id === selectedCommandId.value)
        const isNewer = prior === undefined || compareKeys(next, prior) > 0
        if (!selectionExists || (autoSelectNewCommands.value && isNewer)) {
          selectCommand(newest.command_id)
        }
      },
      { immediate: true },
    )

    function selectCommand(commandId: Uuid): void {
      selectedCommandId.value = commandId
      selectedNode.value = { kind: 'command', id: commandId }
    }

    function selectEntity(node: ProjectionNodeId): void {
      selectedNode.value = node
    }

    function togglePinned(commandId: Uuid): void {
      const current = meta(commandId)
      commandMeta.value[commandId] = { ...current, pinned: !current.pinned }
    }

    function setNickname(commandId: Uuid, nickname: string | null, color: string | null): void {
      commandMeta.value[commandId] = {
        ...meta(commandId),
        nickname: nickname?.trim() || null,
        nicknameColor: color,
      }
    }

    function resetCommandFilters(): void {
      commandFilters.value = defaultProjectionCommandFilters()
    }

    function meta(commandId: Uuid): ProjectionCommandMeta {
      return (
        commandMeta.value[commandId] ?? {
          nickname: null,
          nicknameColor: null,
          pinned: false,
        }
      )
    }

    return {
      selectedCommandId,
      selectedNode,
      autoSelectNewCommands,
      commandMeta,
      commandFilters,
      showCommandFilters,
      graph,
      commands,
      orderedCommands,
      filteredCommands,
      selectedCommand,
      selectedTree,
      selectedEntity,
      selectCommand,
      selectEntity,
      togglePinned,
      setNickname,
      resetCommandFilters,
      meta,
    }
  },
  {
    persist: {
      key: 'trad-engine-projection-ui',
      pick: ['autoSelectNewCommands', 'commandMeta', 'commandFilters'],
    },
  },
)

function compareCommands(left: CommandProjection, right: CommandProjection): number {
  return left.accepted_at - right.accepted_at || left.command_id.localeCompare(right.command_id)
}

function compareKeys(left: [number, Uuid], right: [number, Uuid]): number {
  return left[0] - right[0] || left[1].localeCompare(right[1])
}
