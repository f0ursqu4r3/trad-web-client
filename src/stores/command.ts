import type { CommandDevicesListData, CommandHistoryItem, Uuid } from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'

export interface PendingCommand {
  commandId: string
  sentAt: number
}

export interface OrderedCommandHistoryItem extends CommandHistoryItem {
  orderIndex: number
}

const interestingCommandKinds = ['TrailingEntryOrder']

export const useCommandStore = defineStore('command', () => {
  const ws = useWsStore()

  const pendingCommands = ref<Record<Uuid, PendingCommand>>({})

  const history = ref<CommandHistoryItem[]>([])
  const devices = ref<Record<Uuid, CommandDevicesListData>>(
    {} as Record<Uuid, CommandDevicesListData>,
  )

  const commandMap = computed<Record<string, OrderedCommandHistoryItem>>(() => {
    return history.value
      .filter(
        (cmd) =>
          cmd.command?.kind !== undefined && interestingCommandKinds.includes(cmd.command.kind),
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

  const selectedCommandId = ref<string | null>(null)
  const selectedCommand = computed<OrderedCommandHistoryItem | null>(() => {
    if (!selectedCommandId.value) return null
    return commandMap.value[selectedCommandId.value] || null
  })

  function addPendingCommand(commandId: string) {
    pendingCommands.value[commandId] = {
      commandId,
      sentAt: performance.now(),
    }
  }

  function verifyPendingCommand(commandId: string): number | undefined {
    if (!pendingCommands.value[commandId]) return
    const now = performance.now()
    const pending = pendingCommands.value[commandId]
    const latency = now - pending.sentAt
    console.debug(`[command] Command ${commandId} acknowledged, latency=${Math.round(latency)}ms`)
    // Remove from pending
    delete pendingCommands.value[commandId]
    return latency
  }

  function inspectCommand(commandId: string | null) {
    selectedCommandId.value = commandId
    if (!commandId) return
    ws.inspectCommand(commandId)
  }

  function cancelCommand(commandId: string) {
    ws.sendCancelCommand(commandId)
  }

  return {
    /* state */
    history,
    devices,
    commandMap,
    commands,
    selectedCommandId,
    selectedCommand,
    pendingCommands,
    /* actions */
    inspectCommand,
    cancelCommand,
    addPendingCommand,
    verifyPendingCommand,
  }
})
