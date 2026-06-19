import {
  CommandStatus,
  type CommandDevicesListData,
  type CommandHistoryItem,
  type Uuid,
  type LimitOrderCommand,
  type MarketOrderCommand,
  type SetHedgeModeCommand,
  type SetLeverageCommand,
  type SplitMarketOrderCommand,
  type TrailingEntryOrderCommand,
} from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'
import { useDeviceStore } from '@/stores/devices'
import { createLogger } from '@/lib/utils'
import {
  marketContextAccountId,
  marketContextProductKey,
  normalizeMarketContext,
} from '@/lib/marketContext'

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
  SetHedgeMode,
  SetLeverage,
  SplitMarketOrder,
  TrailingEntryOrder,
}

export type InterestingCommand =
  | LimitOrderCommand
  | MarketOrderCommand
  | SetHedgeModeCommand
  | SetLeverageCommand
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

    const commandMeta = ref<
      Record<
        Uuid,
        {
          nickname?: string | null
          nicknameColor?: string | null
          pinned?: boolean
        }
      >
    >({})

    function ensureMeta(commandId: Uuid) {
      if (!commandMeta.value[commandId]) {
        commandMeta.value[commandId] = { nickname: null, nicknameColor: null, pinned: false }
      }
      return commandMeta.value[commandId]
    }

    type StatusFilter = 'Running' | 'Completed' | 'Failed' | 'Canceled'
    type PositionFilter = 'Open' | 'Closed' | 'Dusted'
    type TimeRangeFilter = 'Any' | '12h' | 'Day' | 'Week' | 'Month'

    const commandFilters = ref<{
      kind: string[]
      status: StatusFilter[]
      position: PositionFilter[]
      exchange: string[]
      product: string[]
      account: string[]
      symbol: string[]
      timeRange: TimeRangeFilter
      solo: {
        kind: boolean
        status: boolean
        position: boolean
        exchange: boolean
        product: boolean
        account: boolean
        symbol: boolean
      }
    }>({
      kind: [],
      status: [],
      position: [],
      exchange: [],
      product: [],
      account: [],
      symbol: [],
      timeRange: 'Any',
      solo: {
        kind: false,
        status: false,
        position: false,
        exchange: false,
        product: false,
        account: false,
        symbol: false,
      },
    })

    const canceledCommandIds = ref<Set<string>>(new Set())

    const dustedCommandIds = computed(() => {
      const ids = new Set<string>()
      deviceStore.devices.forEach((device) => {
        if (device.kind !== 'TrailingEntry') return
        const stats = (device.state as any)?.stats as {
          net_base?: number
          close_filled_qty?: number
        }
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
      return Object.values(commandMap.value).sort((a, b) => {
        const aPinned = commandMeta.value[a.command_id]?.pinned ? 1 : 0
        const bPinned = commandMeta.value[b.command_id]?.pinned ? 1 : 0
        if (aPinned !== bPinned) return bPinned - aPinned
        return a.orderIndex - b.orderIndex
      })
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

    function commandMarketContext(cmd: OrderedCommandHistoryItem) {
      const data = (cmd.command as { data?: { market_context?: unknown } } | undefined)?.data
      const raw = data?.market_context
      if (!raw || typeof raw !== 'object') return null
      return normalizeMarketContext(raw as Record<string, unknown>)
    }

    function commandSymbol(cmd: OrderedCommandHistoryItem): string | null {
      const refSymbol = cmd.market_ref?.symbol?.trim()
      if (refSymbol) return refSymbol.toUpperCase()
      const data = (cmd.command as { data?: { symbol?: unknown } } | undefined)?.data
      const payloadSymbol = typeof data?.symbol === 'string' ? data.symbol.trim() : ''
      return payloadSymbol ? payloadSymbol.toUpperCase() : null
    }

    const activeCommandExchanges = computed<string[]>(() => {
      const exchanges = new Set<string>()
      commands.value.forEach((cmd) => {
        const context = commandMarketContext(cmd)
        if (context?.type && context.type !== 'none') {
          exchanges.add(context.type)
        }
      })
      return Array.from(exchanges).sort()
    })

    const activeCommandAccounts = computed<string[]>(() => {
      const accountIds = new Set<string>()
      commands.value.forEach((cmd) => {
        const context = commandMarketContext(cmd)
        const accountId = context ? marketContextAccountId(context) : null
        if (accountId) {
          accountIds.add(accountId)
        }
      })
      return Array.from(accountIds).sort()
    })

    const activeCommandProducts = computed<string[]>(() => {
      const products = new Set<string>()
      commands.value.forEach((cmd) => {
        const context = commandMarketContext(cmd)
        if (context) {
          products.add(marketContextProductKey(context))
        }
      })
      return Array.from(products).sort()
    })

    const activeCommandSymbols = computed<string[]>(() => {
      const symbols = new Set<string>()
      commands.value.forEach((cmd) => {
        const symbol = commandSymbol(cmd)
        if (symbol) {
          symbols.add(symbol)
        }
      })
      return Array.from(symbols).sort()
    })

    const filteredCommands = computed<OrderedCommandHistoryItem[]>(() => {
      const kindFilter = commandFilters.value.kind ?? []
      const statusFilter = commandFilters.value.status ?? []
      const positionFilter = commandFilters.value.position ?? []
      const exchangeFilter = commandFilters.value.exchange ?? []
      const productFilter = commandFilters.value.product ?? []
      const accountFilter = commandFilters.value.account ?? []
      const symbolFilter = commandFilters.value.symbol ?? []
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

        const marketContext = commandMarketContext(cmd)
        const exchange = marketContext?.type ?? 'none'
        if (exchangeFilter.length > 0 && !exchangeFilter.includes(exchange)) {
          return false
        }

        const product = marketContext ? marketContextProductKey(marketContext) : 'none'
        if (productFilter.length > 0 && !productFilter.includes(product)) {
          return false
        }

        const accountId = marketContext ? (marketContextAccountId(marketContext) ?? '') : ''
        if (accountFilter.length > 0 && !accountFilter.includes(accountId)) {
          return false
        }

        const symbol = commandSymbol(cmd) ?? ''
        if (symbolFilter.length > 0 && !symbolFilter.includes(symbol)) {
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

    function setCommandNickname(commandId: string, nickname: string | null, color?: string | null) {
      const meta = ensureMeta(commandId)
      meta.nickname = nickname && nickname.trim().length ? nickname.trim() : null
      if (color !== undefined) {
        meta.nicknameColor = color || null
      }
      commandMeta.value = { ...commandMeta.value, [commandId]: meta }
    }

    function setCommandNicknameColor(commandId: string, color: string | null) {
      const meta = ensureMeta(commandId)
      meta.nicknameColor = color || null
      commandMeta.value = { ...commandMeta.value, [commandId]: meta }
    }

    function toggleCommandPin(commandId: string) {
      const meta = ensureMeta(commandId)
      meta.pinned = !meta.pinned
      commandMeta.value = { ...commandMeta.value, [commandId]: meta }
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
      commandMeta,
      activeCommandKinds,
      activeCommandStatuses,
      activeCommandExchanges,
      activeCommandProducts,
      activeCommandAccounts,
      activeCommandSymbols,
      dustedCommandIds,
      /* actions */
      inspectCommand,
      cancelCommand,
      closePosition,
      addPendingCommand,
      verifyPendingCommand,
      setCommandNickname,
      setCommandNicknameColor,
      toggleCommandPin,
    }
  },
  {
    persist: { key: 'trad-command-store', pick: ['commandFilters', 'commandMeta'] },
  },
)
