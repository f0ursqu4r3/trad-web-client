import {
  CommandStatus,
  type CommandDevicesListData,
  type CommandHistoryItem,
  type Uuid,
  type LimitOrderCommand,
  type MarketOrderCommand,
  type SplitMarketOrderCommand,
} from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'
import { useDeviceStore } from '@/stores/devices'
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

    const commandFilters = ref<{ kind: string[]; status: CommandStatus[] }>({
      kind: [],
      status: [],
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
      return commands.value.filter((cmd) => {
        const kindFilter = commandFilters.value.kind
        const statusFilter = commandFilters.value.status
        if (!kindFilter.includes(cmd.command.kind) && !statusFilter.includes(cmd.status)) {
          return true
        }
        return false
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
      console.debug(`[command] Command ${commandId} acknowledged, latency=${Math.round(latency)}ms`)
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
