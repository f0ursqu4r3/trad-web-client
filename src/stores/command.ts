import {
  CommandStatus,
  type CommandEffectRecord,
  type CommandActionContextData,
  MarketAction,
  OrderStatus,
  TrailingEntryLifecycle,
  type CommandDevicesListData,
  type CommandHistoryItem,
  type DeviceSnapshotLiteData,
  type Uuid,
  type LimitOrderCommand,
  type ChaseOrderCommand,
  type CloseCommandPositionCommand,
  type PartialCloseCommandPositionCommand,
  type MarketOrderCommand,
  type SetHedgeModeCommand,
  type SetLeverageCommand,
  type SplitMarketOrderCommand,
  type TrailingEntryOrderCommand,
} from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'
import {
  useDeviceStore,
  type ChaseState,
  type NativeProtectionState,
  type OrderState,
  type TrailingEntryState,
} from '@/stores/devices'
import { useUiStore } from '@/stores/ui'
import { createLogger } from '@/lib/utils'
import { normalizeMarketContext } from '@/lib/marketContext'
import {
  commandMarketFacets,
  marketFacetMatchesFilters,
  uniqueFacetValues,
} from '@/lib/marketFilterFacets'

const logger = createLogger('command')

export interface PendingCommand {
  commandId: string
  sentAt: number
  command: unknown
}

export interface OrderedCommandHistoryItem extends CommandHistoryItem {
  orderIndex: number
}

export type CommandActionContextStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CommandActionContextEntry {
  status: CommandActionContextStatus
  requestId: Uuid | null
  generatedAt: string | null
  devices: DeviceSnapshotLiteData[]
  error: string | null
}

export enum interestingCommandKinds {
  ChaseOrder,
  CloseCommandPosition,
  FlattenHyperliquidAccount,
  FlattenHyperliquidSymbol,
  LimitOrder,
  MarketOrder,
  PartialCloseCommandPosition,
  SetHedgeMode,
  SetLeverage,
  SplitMarketOrder,
  TrailingEntryOrder,
}

export type InterestingCommand =
  | ChaseOrderCommand
  | CloseCommandPositionCommand
  | LimitOrderCommand
  | MarketOrderCommand
  | PartialCloseCommandPositionCommand
  | SetHedgeModeCommand
  | SetLeverageCommand
  | SplitMarketOrderCommand
  | TrailingEntryOrderCommand

export const useCommandStore = defineStore(
  'command',
  () => {
    const ws = useWsStore()
    const deviceStore = useDeviceStore()
    const uiStore = useUiStore()

    const history = ref<CommandHistoryItem[]>([])
    const commandEffects = ref<CommandEffectRecord[]>([])
    const commandIndexById = new Map<Uuid, number>()
    const pendingStatusUpdates = new Map<Uuid, CommandStatus>()
    const pendingHistoryAppends: CommandHistoryItem[] = []
    const pendingHistoryById = new Map<Uuid, CommandHistoryItem>()
    let statusFlushScheduled = false
    let historyFlushScheduled = false
    const devices = ref<Record<Uuid, CommandDevicesListData>>(
      {} as Record<Uuid, CommandDevicesListData>,
    )
    const pendingCommands = new Map<Uuid, PendingCommand>()
    const selectedCommandId = ref<string | null>(null)
    const autoInspectNewCommands = ref(true)
    const actionContexts = ref<Record<Uuid, CommandActionContextEntry>>({})

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
        const stats = (device.state as TrailingEntryState)?.stats
        if (!stats) return
        const netBase = (stats.open_filled_qty ?? 0) - (stats.close_filled_qty ?? 0)
        const closeFilled = stats.close_filled_qty ?? 0
        if (closeFilled > 0 && netBase > 0) {
          ids.add(device.associated_command_id)
        }
      })
      return ids
    })

    function commandActionContext(commandId: Uuid): CommandActionContextEntry {
      return (
        actionContexts.value[commandId] ?? {
          status: 'idle',
          requestId: null,
          generatedAt: null,
          devices: [],
          error: null,
        }
      )
    }

    function beginCommandActionContext(commandId: Uuid, requestId: Uuid) {
      actionContexts.value = {
        [commandId]: {
          status: 'loading',
          requestId,
          generatedAt: null,
          devices: [],
          error: null,
        },
      }
    }

    function resolveCommandActionContext(data: CommandActionContextData) {
      const current = actionContexts.value[data.command_id]
      if (!current || current.requestId !== data.request_uuid) return
      actionContexts.value = {
        ...actionContexts.value,
        [data.command_id]: {
          status: 'ready',
          requestId: data.request_uuid,
          generatedAt: data.generated_at,
          devices: data.devices,
          error: null,
        },
      }
    }

    function rejectCommandActionContext(requestId: Uuid, commandId: Uuid, error: string) {
      const current = actionContexts.value[commandId]
      if (!current || current.requestId !== requestId) return
      actionContexts.value = {
        ...actionContexts.value,
        [commandId]: {
          ...current,
          status: 'error',
          requestId: null,
          devices: [],
          error,
        },
      }
    }

    function commandActionContextDevices(commandId: Uuid): DeviceSnapshotLiteData[] | null {
      const context = actionContexts.value[commandId]
      return context?.status === 'ready' ? context.devices : null
    }

    function trailingEntryCanClose(commandId: string): boolean {
      const contextDevices = commandActionContextDevices(commandId)
      if (contextDevices) {
        return contextDevices.some((device) => {
          if (device.snapshot.kind !== 'TrailingEntry') return false
          const stats = device.snapshot.data.stats
          if (!stats) return false
          const netBase = (stats.open_filled_qty ?? 0) - (stats.close_filled_qty ?? 0)
          return netBase > Math.max(stats.dust_threshold ?? 0, 1e-12)
        })
      }
      return deviceStore.devices.some((device) => {
        if (device.kind !== 'TrailingEntry') return false
        if (device.associated_command_id !== commandId) return false
        const stats = (device.state as TrailingEntryState).stats
        const netBase = (stats.open_filled_qty ?? 0) - (stats.close_filled_qty ?? 0)
        const dustThreshold = stats.dust_threshold ?? 0
        return netBase > Math.max(dustThreshold, 1e-12)
      })
    }

    function isHyperliquidPositionCommand(commandId: string): boolean {
      const command = commandMap.value[commandId]?.command
      if (
        !command ||
        !command.data ||
        !['MarketOrder', 'LimitOrder', 'ChaseOrder'].includes(command.kind) ||
        !('market_context' in command.data)
      ) {
        return false
      }
      return normalizeMarketContext(command.data.market_context).type === 'hyperliquid'
    }

    function hyperliquidCommandActionState(commandId: string) {
      const contextDevices = commandActionContextDevices(commandId)
      const commandDevices = contextDevices
        ? []
        : deviceStore.devices.filter((device) => device.associated_command_id === commandId)
      const orders = contextDevices
        ? contextDevices
            .filter((device) => device.snapshot.kind === 'Order')
            .map((device) => {
              const snapshot = device.snapshot
              return snapshot.kind === 'Order' ? snapshot.data : null
            })
            .filter((order): order is NonNullable<typeof order> => order !== null)
        : commandDevices
            .filter((device) => device.kind === 'Order')
            .map((device) => device.state as OrderState)
      const protections = contextDevices
        ? contextDevices
            .filter((device) => device.snapshot.kind === 'NativeProtection')
            .map((device) => {
              const snapshot = device.snapshot
              return snapshot.kind === 'NativeProtection' ? snapshot.data : null
            })
            .filter(
              (protection): protection is NonNullable<typeof protection> => protection !== null,
            )
        : commandDevices
            .filter((device) => device.kind === 'NativeProtection')
            .map((device) => device.state as NativeProtectionState)
      const chases = contextDevices
        ? contextDevices
            .filter((device) => device.snapshot.kind === 'Chase')
            .map((device) => {
              const snapshot = device.snapshot
              return snapshot.kind === 'Chase' ? snapshot.data : null
            })
            .filter((chase): chase is NonNullable<typeof chase> => chase !== null)
        : commandDevices
            .filter((device) => device.kind === 'Chase')
            .map((device) => device.state as ChaseState)
      const orderTerminal = (status: OrderStatus) =>
        [OrderStatus.Filled, OrderStatus.Canceled, OrderStatus.Rejected].includes(status)
      const chaseTerminal = (status: string) =>
        ['filled', 'canceled', 'expired', 'boundary_reached', 'failed'].includes(status)
      const workingEntry =
        orders.some(
          (order) => order.market_action === MarketAction.Open && !orderTerminal(order.status),
        ) || chases.some((chase) => !chaseTerminal(chase.status))
      const reconciliationRequired =
        orders.some((order) => order.status === OrderStatus.ReconciliationRequired) ||
        chases.some((chase) => chase.status === 'reconciliation_required') ||
        protections.some((protection) => protection.status === 'ReconciliationRequired')
      const opened = orders
        .filter((order) => order.market_action === MarketAction.Open)
        .reduce((sum, order) => sum + Math.max(0, order.filled_qty ?? 0), 0)
      const closed = orders
        .filter((order) => order.market_action === MarketAction.Close)
        .reduce((sum, order) => sum + Math.max(0, order.filled_qty ?? 0), 0)
      const ownedQuantity = protections.length
        ? protections.reduce(
            (sum, protection) => sum + Math.max(0, protection.owned_remaining_qty ?? 0),
            0,
          )
        : Math.max(0, opened - closed)
      return {
        loaded: contextDevices ? contextDevices.length > 0 : commandDevices.length > 0,
        workingEntry,
        reconciliationRequired,
        ownedQuantity,
        protectionCount: protections.filter(
          (protection) => (protection.owned_remaining_qty ?? 0) > 0,
        ).length,
      }
    }

    function canClosePosition(commandId: string): boolean {
      const command = commandMap.value[commandId]?.command
      if (command?.kind === 'TrailingEntryOrder') return trailingEntryCanClose(commandId)
      if (!isHyperliquidPositionCommand(commandId)) return false
      const state = hyperliquidCommandActionState(commandId)
      return state.loaded && !state.reconciliationRequired && state.ownedQuantity > 1e-12
    }

    function canPartialClosePosition(commandId: string): boolean {
      if (!isHyperliquidPositionCommand(commandId)) return false
      const state = hyperliquidCommandActionState(commandId)
      return state.loaded && !state.reconciliationRequired && state.ownedQuantity > 1e-12
    }

    function closePositionLabel(commandId: string): string {
      if (!isHyperliquidPositionCommand(commandId)) return 'Close Command Exposure'
      const state = hyperliquidCommandActionState(commandId)
      return state.workingEntry
        ? 'Cancel Entry And Close Command Exposure'
        : 'Close Command Exposure'
    }

    function canCancelCommand(commandId: string): boolean {
      const item = commandMap.value[commandId]
      if (!item || !['Unsent', 'Pending', 'Running', 'Malformed'].includes(item.status))
        return false
      if (item.command.kind === 'TrailingEntryOrder') return !trailingEntryCanClose(commandId)
      if (!isHyperliquidPositionCommand(commandId)) return true
      const state = hyperliquidCommandActionState(commandId)
      if (!state.loaded) return true
      return state.workingEntry && !state.reconciliationRequired && state.ownedQuantity <= 1e-12
    }

    function canCancelRemainingEntry(commandId: string): boolean {
      const commandKind = commandMap.value[commandId]?.command.kind
      if (
        commandKind === 'CloseCommandPosition' ||
        commandKind === 'PartialCloseCommandPosition'
      ) {
        const effects = commandEffects.value.filter(
          (effect) => effect.source_command_id === commandId,
        )
        const requested = effects.some((effect) => effect.effect === 'CloseRequested')
        const settled = effects.some((effect) =>
          ['PositionClosed', 'CloseRemainderCanceled', 'AlreadyFlat'].includes(effect.effect),
        )
        return requested && !settled
      }
      if (!isHyperliquidPositionCommand(commandId)) return false
      const state = hyperliquidCommandActionState(commandId)
      return (
        state.loaded &&
        state.workingEntry &&
        !state.reconciliationRequired &&
        state.ownedQuantity > 1e-12
      )
    }

    function canContinueMissedEntry(commandId: string): boolean {
      const contextDevices = commandActionContextDevices(commandId)
      if (contextDevices) {
        return contextDevices.some(
          (device) =>
            device.snapshot.kind === 'TrailingEntry' &&
            device.snapshot.data.lifecycle === TrailingEntryLifecycle.MissedEntryPaused,
        )
      }
      const pausedTeExists = deviceStore.devices.some((device) => {
        if (device.kind !== 'TrailingEntry') return false
        if (device.associated_command_id !== commandId) return false
        const te = device.state as TrailingEntryState
        return te.lifecycle === TrailingEntryLifecycle.MissedEntryPaused
      })
      if (!pausedTeExists) return false

      return deviceStore.devices.some((device) => {
        if (device.kind !== 'Order') return false
        if (device.associated_command_id !== commandId) return false
        const order = device.state as OrderState
        if (order.market_action !== MarketAction.Open) return false
        if (order.status !== OrderStatus.Rejected) return false
        return (device.failure_reason ?? '').includes('stale before submit')
      })
    }

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
        if (uiStore.newestCommandsFirst) {
          const aTime = new Date(a.created_at).getTime()
          const bTime = new Date(b.created_at).getTime()
          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
            return bTime - aTime
          }
          if (Number.isFinite(aTime) !== Number.isFinite(bTime)) {
            return Number.isFinite(bTime) ? 1 : -1
          }
          return b.orderIndex - a.orderIndex
        }
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

    const commandMarketFacetMap = computed(() => commandMarketFacets(commands.value))

    const activeCommandExchanges = computed<string[]>(() => {
      return uniqueFacetValues(commandMarketFacetMap.value.values(), 'exchange')
    })

    const activeCommandAccounts = computed<string[]>(() => {
      return uniqueFacetValues(commandMarketFacetMap.value.values(), 'account')
    })

    const activeCommandProducts = computed<string[]>(() => {
      return uniqueFacetValues(commandMarketFacetMap.value.values(), 'product')
    })

    const activeCommandSymbols = computed<string[]>(() => {
      return uniqueFacetValues(commandMarketFacetMap.value.values(), 'symbol')
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

        const facet = commandMarketFacetMap.value.get(cmd.command_id)
        if (
          !marketFacetMatchesFilters(facet, {
            exchange: exchangeFilter,
            product: productFilter,
            account: accountFilter,
            symbol: symbolFilter,
          })
        ) {
          return false
        }

        return true
      })
    })

    const selectedCommand = computed<OrderedCommandHistoryItem | null>(() => {
      if (!selectedCommandId.value) return null
      return commandMap.value[selectedCommandId.value] || null
    })

    function rebuildCommandIndex() {
      commandIndexById.clear()
      history.value.forEach((item, index) => {
        commandIndexById.set(item.command_id, index)
      })
    }

    function setCommandHistory(items: CommandHistoryItem[], effects: CommandEffectRecord[] = []) {
      history.value = items
      commandEffects.value = effects
      rebuildCommandIndex()
    }

    function clearHistory() {
      setCommandHistory([], [])
      pendingStatusUpdates.clear()
      pendingHistoryAppends.splice(0, pendingHistoryAppends.length)
      pendingHistoryById.clear()
    }

    function recordCommandEffect(effect: CommandEffectRecord) {
      const index = commandEffects.value.findIndex(
        (candidate) => candidate.effect_id === effect.effect_id,
      )
      if (index === -1) {
        commandEffects.value.push(effect)
      } else {
        commandEffects.value[index] = effect
      }
    }

    function flattenEffectsFrom(commandId: Uuid): CommandEffectRecord[] {
      return commandEffects.value.filter((effect) => effect.source_command_id === commandId)
    }

    function flattenEffectsAffecting(commandId: Uuid): CommandEffectRecord[] {
      return commandEffects.value.filter((effect) => effect.affected_command_id === commandId)
    }

    function commandHistoryIndex(commandId: Uuid): number {
      const cached = commandIndexById.get(commandId)
      if (cached !== undefined && history.value[cached]?.command_id === commandId) {
        return cached
      }
      const index = history.value.findIndex((item) => item.command_id === commandId)
      if (index !== -1) {
        commandIndexById.set(commandId, index)
      }
      return index
    }

    function commandStatus(commandId: Uuid): CommandStatus | null {
      const index = commandHistoryIndex(commandId)
      if (index !== -1) return history.value[index].status
      return pendingHistoryById.get(commandId)?.status ?? null
    }

    function applyCommandStatus(commandId: Uuid, status: CommandStatus): boolean {
      const pending = pendingHistoryById.get(commandId)
      if (pending) {
        pending.status = status
        return true
      }
      const index = commandHistoryIndex(commandId)
      if (index === -1) return false
      if (history.value[index].status !== status) {
        history.value[index].status = status
      }
      return true
    }

    function flushCommandStatusUpdates() {
      statusFlushScheduled = false
      if (pendingStatusUpdates.size === 0) return

      const stillPending = new Map<Uuid, CommandStatus>()
      pendingStatusUpdates.forEach((status, commandId) => {
        if (!applyCommandStatus(commandId, status)) {
          stillPending.set(commandId, status)
        }
      })
      pendingStatusUpdates.clear()
      stillPending.forEach((status, commandId) => {
        pendingStatusUpdates.set(commandId, status)
      })
    }

    function setCommandStatus(commandId: Uuid, status: CommandStatus) {
      pendingStatusUpdates.set(commandId, status)
      if (statusFlushScheduled) return
      statusFlushScheduled = true
      window.requestAnimationFrame(flushCommandStatusUpdates)
    }

    function flushCommandHistoryAppends() {
      historyFlushScheduled = false
      if (pendingHistoryAppends.length === 0) return

      const startIndex = history.value.length
      const batch = pendingHistoryAppends.splice(0, pendingHistoryAppends.length)
      history.value.push(...batch)
      batch.forEach((item, offset) => {
        commandIndexById.set(item.command_id, startIndex + offset)
        pendingHistoryById.delete(item.command_id)
      })
      flushCommandStatusUpdates()
    }

    function scheduleCommandHistoryFlush() {
      if (historyFlushScheduled) return
      historyFlushScheduled = true
      window.requestAnimationFrame(flushCommandHistoryAppends)
    }

    function addPendingCommand(commandId: string, command: unknown) {
      pendingCommands.set(commandId, {
        commandId,
        sentAt: performance.now(),
        command,
      })
    }

    function shouldAutoInspectCommand(command: unknown): boolean {
      if (!command || typeof command !== 'object' || !('kind' in command)) return false
      const kind = (command as { kind?: unknown }).kind
      return (
        kind === 'MarketOrder' ||
        kind === 'LimitOrder' ||
        kind === 'ChaseOrder' ||
        kind === 'SplitMarketOrder' ||
        kind === 'TrailingEntryOrder'
      )
    }

    function verifyPendingCommand(commandId: string, result?: string | null): number | undefined {
      const pending = pendingCommands.get(commandId)
      if (!pending) return
      const now = performance.now()
      const latency = now - pending.sentAt
      logger.debug(`Command ${commandId} acknowledged, latency=${Math.round(latency)}ms`)
      const item = {
        command_id: commandId,
        command: pending.command,
        status: CommandStatus.Running,
        created_at: new Date().toISOString(),
        result: result || null,
      } as CommandHistoryItem
      pendingHistoryAppends.push(item)
      pendingHistoryById.set(commandId, item)
      const pendingStatus = pendingStatusUpdates.get(commandId)
      if (pendingStatus) {
        applyCommandStatus(commandId, pendingStatus)
        pendingStatusUpdates.delete(commandId)
      }
      // Remove from pending
      pendingCommands.delete(commandId)
      scheduleCommandHistoryFlush()
      if (autoInspectNewCommands.value && shouldAutoInspectCommand(pending.command)) {
        inspectCommand(commandId)
      }
      return latency
    }

    function inspectCommand(commandId: string | null) {
      selectedCommandId.value = commandId
      deviceStore.clearDevices()
      if (!commandId) return
      ws.inspectCommand(commandId)
    }

    function setAutoInspectNewCommands(enabled: boolean) {
      autoInspectNewCommands.value = enabled
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

    function closePosition(
      commandId: string,
      execution: import('@/lib/ws/protocol').CloseExecutionPolicy = { kind: 'market' },
    ) {
      if (!canClosePosition(commandId)) return
      const command = commandMap.value[commandId]?.command
      if (command?.kind === 'TrailingEntryOrder') {
        ws.sendCloseTrailingEntryPosition(commandId)
      } else {
        ws.sendCloseCommandPosition(commandId, execution)
      }
    }

    function partialClosePosition(
      commandId: string,
      quantity: number,
      expectedOwnedQuantity: number,
      execution: import('@/lib/ws/protocol').CloseExecutionPolicy = { kind: 'market' },
    ) {
      if (!canPartialClosePosition(commandId)) return
      ws.sendPartialCloseCommandPosition(commandId, quantity, expectedOwnedQuantity, execution)
    }

    function cancelRemainingEntry(commandId: string) {
      if (!canCancelRemainingEntry(commandId)) return
      ws.sendCancelCommandRemainingEntry(commandId)
    }

    function continueMissedEntry(commandId: string) {
      if (!canContinueMissedEntry(commandId)) return
      ws.sendContinueMissedTrailingEntry(commandId)
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
      autoInspectNewCommands,
      actionContexts,
      commandEffects,
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
      canClosePosition,
      canPartialClosePosition,
      hyperliquidCommandActionState,
      closePositionLabel,
      canCancelCommand,
      canCancelRemainingEntry,
      canContinueMissedEntry,
      commandActionContext,
      commandActionContextDevices,
      /* actions */
      inspectCommand,
      beginCommandActionContext,
      resolveCommandActionContext,
      rejectCommandActionContext,
      setAutoInspectNewCommands,
      cancelCommand,
      closePosition,
      partialClosePosition,
      cancelRemainingEntry,
      continueMissedEntry,
      addPendingCommand,
      verifyPendingCommand,
      setCommandHistory,
      recordCommandEffect,
      flattenEffectsFrom,
      flattenEffectsAffecting,
      clearHistory,
      commandStatus,
      setCommandStatus,
      setCommandNickname,
      setCommandNicknameColor,
      toggleCommandPin,
    }
  },
  {
    persist: { key: 'trad-command-store', pick: ['commandFilters', 'commandMeta'] },
  },
)
