import {
  CommandStatus,
  type CommandDevicesListData,
  type CommandHistoryItem,
  type Uuid,
  type LimitOrderCommand,
  type MarketOrderCommand,
  type SplitMarketOrderCommand,
  type TrailingEntryOrderCommand,
} from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'
import { useDeviceStore } from '@/stores/devices'
import { createLogger } from '@/lib/utils'

const logger = createLogger('command')

export interface PendingCommand {
  commandId: string
  sentAt: number
  command: unknown
}

export interface OrderedCommandHistoryItem extends CommandHistoryItem {
  orderIndex: number
}

export enum interestingCommandKinds {
  LimitOrder,
  MarketOrder,
  SplitMarketOrder,
  TrailingEntryOrder,
}

export type InterestingCommand =
  | LimitOrderCommand
  | MarketOrderCommand
  | SplitMarketOrderCommand
  | TrailingEntryOrderCommand

export const useCommandStore = defineStore(
  'command',
  () => {
    const ws = useWsStore()
    const deviceStore = useDeviceStore()

    const history = ref<CommandHistoryItem[]>([])
    const devices = ref<Record<Uuid, CommandDevicesListData>>(
      {} as Record<Uuid, CommandDevicesListData>,
    )
    const pendingCommands = ref<Record<Uuid, PendingCommand>>({})
    const selectedCommandId = ref<string | null>(null)

    type StatusFilter = 'Running' | 'Completed' | 'Failed' | 'Canceled'
    type PositionFilter = 'Open' | 'Closed' | 'Dusted'
    type TimeRangeFilter = 'Any' | '12h' | 'Day' | 'Week' | 'Month'

    const commandFilters = ref<{
      kind: string[]
      status: StatusFilter[]
      position: PositionFilter[]
      timeRange: TimeRangeFilter
    }>({
      kind: [],
      status: [],
      position: [],
      timeRange: 'Any',
    })

    const canceledCommandIds = ref<Set<string>>(new Set())

    const dustedCommandIds = computed(() => {
      const ids = new Set<string>()
      deviceStore.devices.forEach((device) => {
        if (device.kind !== 'TrailingEntry') return
        const stats = (device.state as any)?.stats as { net_base?: number; close_filled_qty?: number }
        if (!stats) return
        const netBase = stats.net_base ?? 0
        const closeFilled = stats.close_filled_qty ?? 0
        if (closeFilled > 0 && netBase > 0) {
          ids.add(device.associated_command_id)
        }
      })
      return ids
    })

    const commandMap = computed<Record<string, OrderedCommandHistoryItem>>(() => {
      return history.value
        .filter(
          (cmd) =>
            cmd.command?.kind !== undefined &&
            Object.values(interestingCommandKinds).includes(cmd.command.kind),
        )
        .reduce<Record<string, OrderedCommandHistoryItem>>((map, cmd, index) => {
          map[cmd.command_id] = {
            ...cmd,
            orderIndex: index,
          }
          return map
        }, {})
    })

    const commands = computed<OrderedCommandHistoryItem[]>(() => {
      return Object.values(commandMap.value).sort((a, b) => a.orderIndex - b.orderIndex)
    })

    const activeCommandKinds = computed<string[]>(() => {
      const kinds = new Set<string>()
      commands.value.forEach((cmd) => {
        if (cmd.command?.kind) {
          kinds.add(cmd.command.kind)
        }
      })
      return Array.from(kinds).sort()
    })

    const activeCommandStatuses = computed<CommandStatus[]>(() => {
      const statuses = new Set<CommandStatus>()
      commands.value.forEach((cmd) => {
        if (cmd.status) {
          statuses.add(cmd.status)
        }
      })
      return Array.from(statuses).sort()
    })

    const filteredCommands = computed<OrderedCommandHistoryItem[]>(() => {
      const kindFilter = commandFilters.value.kind
      const statusFilter = commandFilters.value.status
      const positionFilter = commandFilters.value.position
      const timeRange = commandFilters.value.timeRange
      const now = Date.now()

      const minTimestamp = (() => {
        switch (timeRange) {
          case '12h':
            return now - 12 * 60 * 60 * 1000
          case 'Day':
            return now - 24 * 60 * 60 * 1000
          case 'Week':
            return now - 7 * 24 * 60 * 60 * 1000
          case 'Month':
            return now - 30 * 24 * 60 * 60 * 1000
          default:
            return null
        }
      })()

      return commands.value.filter((cmd) => {
        if (minTimestamp !== null) {
          const created = new Date(cmd.created_at).getTime()
          if (!Number.isFinite(created) || created < minTimestamp) return false
        }

        if (kindFilter.length > 0 && !kindFilter.includes(cmd.command.kind)) {
          return false
        }

        const statusBucket: StatusFilter = (() => {
          if (canceledCommandIds.value.has(cmd.command_id)) return 'Canceled'
          switch (cmd.status) {
            case CommandStatus.Succeeded:
              return 'Completed'
            case CommandStatus.Failed:
            case CommandStatus.Malformed:
              return 'Failed'
            default:
              return 'Running'
          }
        })()

        if (statusFilter.length > 0 && !statusFilter.includes(statusBucket)) {
          return false
        }

        const positionBucket: PositionFilter = (() => {
          if (statusBucket === 'Completed' && dustedCommandIds.value.has(cmd.command_id)) {
            return 'Dusted'
          }
          if (statusBucket === 'Completed') return 'Closed'
          return 'Open'
        })()

        if (positionFilter.length > 0 && !positionFilter.includes(positionBucket)) {
          return false
        }

        return true
      })
    })

    const selectedCommand = computed<OrderedCommandHistoryItem | null>(() => {
      if (!selectedCommandId.value) return null
      return commandMap.value[selectedCommandId.value] || null
    })

    function addPendingCommand(commandId: string, command: unknown) {
      pendingCommands.value[commandId] = {
        commandId,
        sentAt: performance.now(),
        command,
      }
    }

    function verifyPendingCommand(commandId: string): number | undefined {
      if (!pendingCommands.value[commandId]) return
      const now = performance.now()
      const pending = pendingCommands.value[commandId]
      const latency = now - pending.sentAt
      logger.debug(`Command ${commandId} acknowledged, latency=${Math.round(latency)}ms`)
      // Move to history
      history.value.push({
        command_id: commandId,
        command: pending.command,
        status: CommandStatus.Running,
        created_at: new Date().toISOString(),
      } as CommandHistoryItem)
      // Remove from pending
      delete pendingCommands.value[commandId]
      return latency
    }

    function inspectCommand(commandId: string | null) {
      selectedCommandId.value = commandId
      deviceStore.clearDevices()
      if (!commandId) return
      ws.inspectCommand(commandId)
    }

    function cancelCommand(commandId: string) {
      ws.sendCancelCommand(commandId)
      canceledCommandIds.value = new Set([...canceledCommandIds.value, commandId])
    }

    function closePosition(commandId: string) {
      ws.sendCloseTrailingEntryPosition(commandId)
    }

    return {
      /* state */
      history,
      devices,
      commandMap,
      commands,
      filteredCommands,
      selectedCommandId,
      selectedCommand,
      pendingCommands,
      commandFilters,
      activeCommandKinds,
      activeCommandStatuses,
      dustedCommandIds,
      /* actions */
      inspectCommand,
      cancelCommand,
      closePosition,
      addPendingCommand,
      verifyPendingCommand,
    }
  },
  {
    persist: { key: 'trad-command-store', pick: ['commandFilters'] },
  },
)
