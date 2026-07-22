import {
  CommandStatus,
  type E2eBybitPublicTradeTick,
  type E2eHyperliquidPublicTradeTick,
  type MarketContext,
  type MarketCapabilitiesData,
  type OrderThrottleSnapshotData,
  type ServerToClientMessage,
  type SymbolLeverageSnapshotData,
  type SystemMessagePayload,
  type UserCommandPayload,
  type Uuid,
} from '@/lib/ws/protocol'
import { ref, computed, onUnmounted } from 'vue'
import { defineStore } from 'pinia'
import { TradWebClient } from '@/lib/ws/websocketClient'
import { useCommandStore } from '@/stores/command'
import { useSplitPreviewStore } from '@/stores/splitPreview'
import { useDeviceStore } from '@/stores/devices'
import { useAccountsStore } from '@/stores/accounts'
import { clearLegacyAuthStorage, getWebSocketToken } from '@/lib/auth'
import { useUserStore } from './user'
import { createLogger } from '@/lib/utils'
import { recordPerf, recordPerfDuration, flushPerfLog, isPerfLogEnabled } from '@/lib/perfLog'
import { normalizeMarketContext } from '@/lib/marketContext'

const logger = createLogger('ws')

// Connection phases
// 'idle' -> not yet attempted
// 'connecting' -> socket opening / handshake
// 'ready' -> handshake completed
// 'reconnecting' -> scheduled/attempting reconnect after a drop
// 'error' -> fatal error encountered
export type WsStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'error'

interface RawInboundRecord {
  ts: number
  kind: string
  payload: unknown
}

interface ServerActionNotice {
  id: number
  message: string
  action?: {
    kind: 'inspect_command'
    commandId: Uuid
    label: string
  }
}

export const useWsStore = defineStore('ws', () => {
  const commandStore = useCommandStore()
  const deviceStore = useDeviceStore()
  const accountsStore = useAccountsStore()

  const status = ref<WsStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const clientId = ref<string | null>(null)
  const username = ref<string>('anonymous')
  const protocolVersion = ref<number | null>(null)
  const inbound = ref<RawInboundRecord[]>([])
  const serverMessages = ref<string[]>([])
  const inboundDebugEnabled = ref(localStorage.getItem('fe_inbound_debug') === '1')
  const outboundCount = ref(0)
  const reconnectCount = ref(0)
  const authAccepted = ref<boolean | null>(null)
  const authError = ref<string | null>(null)
  const serverActionNotice = ref<ServerActionNotice | null>(null)
  const marketCapabilities = ref<Record<string, MarketCapabilitiesData>>({})
  const orderThrottleSnapshots = ref<Record<string, OrderThrottleSnapshotData>>({})
  const symbolLeverageSnapshots = ref<Record<string, SymbolLeverageSnapshotData>>({})
  let lastPingSend: number | null = null
  let perfLoopTimer: number | null = null
  let serverActionNoticeId = 0
  const pendingAccountRefreshes = new Set<Uuid>()
  const pendingAccountRefreshResolvers = new Map<
    Uuid,
    {
      resolve: () => void
      reject: (error: Error) => void
      timer: number
    }
  >()

  // Build from env (fallback to same host /ws)
  const url = import.meta.env.VITE_WS_URL || location.origin.replace(/^http/, 'ws') + '/ws'

  const isConnected = computed(() => status.value === 'ready')

  // Basic reconnect heuristic: watch transitions indirectly via inbound messages
  const interval = setInterval(() => {
    if (status.value === 'connecting' || status.value === 'ready') return
    if (status.value === 'error') return
    if (status.value === 'idle') return
    // If we are here, treat as reconnecting
    reconnectCount.value++
    status.value = 'reconnecting'
  }, 5000)

  const client = new TradWebClient({
    url,
    clientName: 'trad-web-ui',
    build: import.meta.env.VITE_APP_BUILD || 'dev',
    logger,
    reconnectDelayMs: 1000,
    exponentialBackoff: true,
    maxReconnectDelayMs: 30_000,
    pingIntervalMs: 30_000,
  })

  function connect() {
    if (status.value === 'ready' || status.value === 'connecting') return
    lastError.value = null
    logger.info('connect() invoked, status -> connecting, url=', url)
    status.value = 'connecting'
    client.setServerMessageHandler(onServerMessage)
    client.setFatalErrorHandler((err) => {
      lastError.value = err
      status.value = 'error'
      logger.error('fatal error', err)
    })
    client.connect()
    // wait for the client to open the connection
    client.onOpen(() => {
      logger.info('WebSocket connection opened')
    })
    // wait for the client to close the connection
    client.onClose((event) => {
      logger.warn('WebSocket connection closed', event)
      if (status.value !== 'error') {
        status.value = 'idle'
      }
    })
    // handle ping sent
    client.onPing(() => {
      lastPingSend = performance.now()
    })
    startPerfLoopLagMonitor()
  }

  function disconnect() {
    stopPerfLoopLagMonitor()
    client.disconnect()
    logger.info('disconnect() invoked, status -> idle')
    status.value = 'idle'
  }

  function setInboundDebugEnabled(enabled: boolean) {
    inboundDebugEnabled.value = enabled
    try {
      localStorage.setItem('fe_inbound_debug', enabled ? '1' : '0')
    } catch {
      // ignore
    }
    if (!enabled) {
      inbound.value = []
    }
  }

  function startPerfLoopLagMonitor() {
    if (perfLoopTimer !== null) return
    if (!isPerfLogEnabled()) return
    let expected = performance.now() + 100
    perfLoopTimer = window.setInterval(() => {
      const now = performance.now()
      const drift = now - expected
      expected = now + 100
      if (drift >= 100) {
        recordPerfDuration('FE:EventLoopLag', drift, { interval_ms: 100 })
      }
    }, 100)
  }

  function stopPerfLoopLagMonitor() {
    if (perfLoopTimer === null) return
    window.clearInterval(perfLoopTimer)
    perfLoopTimer = null
  }

  function dismissServerActionNotice(id?: number) {
    if (id !== undefined && serverActionNotice.value?.id !== id) return
    serverActionNotice.value = null
  }

  function maybeSetActionableServerError(message: string) {
    const match = message.match(
      /^Active same-side TE already exists for\s+(\S+)\s+(Long|Short)\s+on this account:\s+device\s+([0-9a-f-]{36})\s+command\s+([0-9a-f-]{36}|unknown)\./i,
    )
    if (!match) return
    const [, symbol, side, , commandId] = match
    serverActionNotice.value = {
      id: ++serverActionNoticeId,
      message: `Hyperliquid already has an active ${side.toLowerCase()} TE for ${symbol} on this account.`,
      action:
        commandId === 'unknown'
          ? undefined
          : {
              kind: 'inspect_command',
              commandId,
              label: 'Show existing',
            },
    }
  }

  /* System Commands */
  function sendSystemCommand(command: SystemMessagePayload): Uuid {
    return client.send({
      kind: 'System',
      data: command,
    })
  }

  function sendSystemPing() {
    lastPingSend = performance.now()
    sendSystemCommand({
      kind: 'Ping',
      data: { client_send_time: Date.now() },
    })
  }

  function sendCancelCommand(commandId: Uuid) {
    sendSystemCommand({
      kind: 'CancelCommand',
      data: { command_id: commandId },
    })
  }

  function sendCloseTrailingEntryPosition(commandId: Uuid) {
    sendUserCommand({
      kind: 'CloseTrailingEntryPosition',
      data: { command_id: commandId },
    })
  }

  function sendContinueMissedTrailingEntry(commandId: Uuid) {
    sendUserCommand({
      kind: 'ContinueMissedTrailingEntry',
      data: { command_id: commandId },
    })
  }

  function inspectCommand(commandId: Uuid) {
    sendSystemCommand({
      kind: 'InspectStart',
      data: { command_id: commandId },
    })
  }

  /* User Commands */
  function sendUserCommand(command: UserCommandPayload) {
    const commandId = client.send({ kind: 'UserCommand', data: command })
    outboundCount.value++
    commandStore.addPendingCommand(commandId, command)
    return commandId
  }

  function sendUserCommandPreview(command: UserCommandPayload) {
    const commandId = client.send({ kind: 'UserCommand', data: command })
    outboundCount.value++
    return commandId
  }

  function sendTokenLogin(token: string) {
    sendUserCommand({
      kind: 'TokenLogin',
      data: { token },
    })
  }

  function sendLogout(allSessions: boolean = false) {
    sendUserCommand({
      kind: 'Logout',
      data: { all_sessions: allSessions },
    })
  }

  function sendRefreshAccountKeys(
    accountId: Uuid,
    label: string,
    userToken: string,
  ): Promise<void> {
    const command = {
      kind: 'RefreshAccountKeys',
      data: {
        account_id: accountId,
        label,
        user_token: userToken,
      },
    } satisfies SystemMessagePayload
    const commandId = sendSystemCommand(command)
    pendingAccountRefreshes.add(commandId)
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingAccountRefreshes.delete(commandId)
        pendingAccountRefreshResolvers.delete(commandId)
        reject(new Error('Account refresh timed out. Refresh accounts manually to check status.'))
      }, 10000)
      pendingAccountRefreshResolvers.set(commandId, { resolve, reject, timer })
    })
  }

  function sendDeleteHyperliquidAccount(accountId: Uuid): Promise<void> {
    const commandId = sendSystemCommand({
      kind: 'DeleteHyperliquidAccount',
      data: { account_id: accountId },
    })
    pendingAccountRefreshes.add(commandId)
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingAccountRefreshes.delete(commandId)
        pendingAccountRefreshResolvers.delete(commandId)
        reject(new Error('Account deletion timed out. Refresh accounts before trying again.'))
      }, 30000)
      pendingAccountRefreshResolvers.set(commandId, { resolve, reject, timer })
    })
  }

  function marketContextKey(marketContext: MarketContext): string {
    const normalized = normalizeMarketContext(marketContext)
    switch (normalized.type) {
      case 'binance':
      case 'bifake':
      case 'bybit':
      case 'hyperliquid':
        return `${normalized.type}:${normalized.account_id}`
      case 'sim':
        return `${normalized.type}:${normalized.sim_market_id}`
      case 'none':
      default:
        return 'none'
    }
  }

  function requestMarketCapabilities(marketContext: MarketContext) {
    sendSystemCommand({
      kind: 'GetMarketCapabilities',
      data: { market_context: marketContext },
    })
  }

  function requestOrderThrottleSnapshot(marketContext: MarketContext) {
    sendSystemCommand({
      kind: 'GetOrderThrottleSnapshot',
      data: { market_context: marketContext },
    })
  }

  function requestSymbolLeverage(marketContext: MarketContext, symbols: string[]) {
    sendSystemCommand({
      kind: 'GetSymbolLeverage',
      data: { market_context: marketContext, symbols },
    })
  }

  function e2ePublishBybitPublicTrades(
    marketContext: MarketContext,
    ticks: E2eBybitPublicTradeTick[],
  ) {
    return sendSystemCommand({
      kind: 'E2ePublishBybitPublicTrades',
      data: { market_context: marketContext, ticks },
    })
  }

  function e2ePublishHyperliquidPublicTrades(
    marketContext: MarketContext,
    ticks: E2eHyperliquidPublicTradeTick[],
  ) {
    return sendSystemCommand({
      kind: 'E2ePublishHyperliquidPublicTrades',
      data: { market_context: marketContext, ticks },
    })
  }

  function capabilitiesForMarketContext(
    marketContext: MarketContext | null | undefined,
  ): MarketCapabilitiesData | null {
    if (!marketContext) return null
    return marketCapabilities.value[marketContextKey(marketContext)] ?? null
  }

  function orderThrottleForMarketContext(
    marketContext: MarketContext | null | undefined,
  ): OrderThrottleSnapshotData | null {
    if (!marketContext) return null
    return orderThrottleSnapshots.value[marketContextKey(marketContext)] ?? null
  }

  function applyOrderThrottleSnapshot(data: OrderThrottleSnapshotData): void {
    orderThrottleSnapshots.value[marketContextKey(data.market_context)] = data
  }

  function symbolLeverageForMarketContext(
    marketContext: MarketContext | null | undefined,
  ): SymbolLeverageSnapshotData | null {
    if (!marketContext) return null
    return symbolLeverageSnapshots.value[marketContextKey(marketContext)] ?? null
  }

  function applySymbolLeverageSnapshot(data: SymbolLeverageSnapshotData): void {
    symbolLeverageSnapshots.value[marketContextKey(data.market_context)] = data
  }

  function onServerMessage(msg: ServerToClientMessage) {
    const payload = msg.payload
    if (inboundDebugEnabled.value) {
      inbound.value.push({ ts: Date.now(), kind: payload.kind, payload: payload.data })
      if (inbound.value.length > 3000) inbound.value.shift()
    }

    // Handle different message kinds
    const handlers = {
      ClientIdAssignment: handleClientIdAssignment,
      ServerHello: handleServerHello,
      SetUser: handleSetUser,
      UnsetUser: handleUnsetUser,
      CommandResponse: handleCommandResponse,
      Message: handleMessage,
      Pong: handlePong,
      FatalServerError: handleFatalServerError,
      ServerError: handleServerError,
      CommandHistory: handleCommandHistory,
      SetCommandStatus: handleSetCommandStatus,
      CommandDevicesList: handleCommandDevicesList,
      InspectReady: handleInspectReady,
      DeviceLifecycle: handleDeviceLifecycle,
      DeviceSnapshotLite: handleDeviceSnapshotLite,
      DeviceTeDelta: handleDeviceTeDelta,
      DeviceSgDelta: handleDeviceSgDelta,
      DeviceNpDelta: handleDeviceNpDelta,
      DeviceSplitDelta: handleDeviceSplitDelta,
      DeviceOrderDelta: handleDeviceOrderDelta,
      SplitPreview: handleSplitPreview,
      MarketCapabilities: handleMarketCapabilities,
      OrderThrottleSnapshot: handleOrderThrottleSnapshot,
      SymbolLeverageSnapshot: handleSymbolLeverageSnapshot,
    } as Record<string, (p: ServerToClientMessage['payload']) => void>
    const handler = handlers[payload.kind] || handleUnknowServerMessage
    handler(payload)
  }

  /* Handlers for inbound message kinds */
  function handleUnknowServerMessage(payload: ServerToClientMessage['payload']): void {
    logger.warn('Unknown server message kind received:', payload.kind, payload.data)
  }

  function handleClientIdAssignment(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'ClientIdAssignment' }>
    ).data
    clientId.value = data.new_client_id
  }

  function handleServerHello(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'ServerHello' }>)
      .data
    protocolVersion.value = data.protocol_version
    status.value = 'ready'
    logger.info('ServerHello received. status -> ready, protocol=', data.protocol_version)
    void (async () => {
      const token = await getWebSocketToken()
      if (token) {
        logger.info('sending TokenLogin with WebSocket auth token')
        sendTokenLogin(token)
        return
      }
      logger.info('no WebSocket auth token available')
    })()
    // reset reconnect count on successful connection
    reconnectCount.value = 0
  }

  function handleSetUser(payload: ServerToClientMessage['payload']): void {
    authAccepted.value = true
    authError.value = null
    username.value = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'SetUser' }>
    ).data.username
    logger.info('SetUser received. authAccepted -> true, username=', username.value)
    // Update user store as well
    const userStore = useUserStore()
    userStore.isServerAuthenticated = true
  }

  function handleUnsetUser(): void {
    authAccepted.value = false
    username.value = 'anonymous'
    logger.info('UnsetUser received. authAccepted -> false, username -> anonymous')
    // Keep existing authError if any; UnsetUser is not necessarily an error.
  }

  function handleCommandResponse(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandResponse' }>)
      .data
    const wasAccountRefresh = pendingAccountRefreshes.delete(data.request_uuid)
    const accountRefreshResolver = pendingAccountRefreshResolvers.get(data.request_uuid)
    if (accountRefreshResolver) {
      window.clearTimeout(accountRefreshResolver.timer)
      pendingAccountRefreshResolvers.delete(data.request_uuid)
    }
    commandStore.verifyPendingCommand(data.request_uuid)
    if (wasAccountRefresh) {
      accountsStore
        .fetchAccounts()
        .then(() => accountRefreshResolver?.resolve())
        .catch((err) => {
          logger.error('failed to refresh accounts after account-key refresh', err)
          accountRefreshResolver?.reject(err instanceof Error ? err : new Error(String(err)))
        })
    }
  }

  function handleMessage(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'Message' }>).data
    serverMessages.value.push(data.message)
    if (serverMessages.value.length > 200) serverMessages.value.shift()
    logger.info('Server message received:', data.message)
  }

  function handlePong(): void {
    if (lastPingSend) {
      const now = performance.now()
      latencyMs.value = now - lastPingSend
      lastPingSend = null
    }
  }

  function handleFatalServerError(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'FatalServerError' }>
    ).data
    lastError.value = data.error
    status.value = 'error'
    logger.error('FatalServerError received. status -> error', data.error)
  }

  function isAuthError(message: string | undefined | null): boolean {
    if (!message) return false
    const msg = message.toLowerCase()
    return (
      msg.includes('unauthorized') ||
      msg.includes('token') ||
      msg.includes('auth') ||
      msg.includes('does not belong to user')
    )
  }

  function handleServerError(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'ServerError' }>)
      .data
    if (data.request_uuid) {
      if (commandStore.verifyPendingCommand(data.request_uuid) !== undefined) {
        commandStore.setCommandStatus(data.request_uuid, CommandStatus.Failed)
      }
      const previewStore = useSplitPreviewStore()
      previewStore.setError(data.request_uuid, data.error)
      const accountRefreshResolver = pendingAccountRefreshResolvers.get(data.request_uuid)
      if (accountRefreshResolver) {
        window.clearTimeout(accountRefreshResolver.timer)
        pendingAccountRefreshes.delete(data.request_uuid)
        pendingAccountRefreshResolvers.delete(data.request_uuid)
        accountRefreshResolver.reject(new Error(data.error))
      }
    }
    maybeSetActionableServerError(data.error)
    if (isAuthError(data.error)) {
      authAccepted.value = false
      authError.value = data.error
      clearLegacyAuthStorage()
      logger.warn('server rejected auth token')
    }
  }

  function handleMarketCapabilities(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'MarketCapabilities' }>
    ).data
    marketCapabilities.value[marketContextKey(data.market_context)] = data
  }

  function handleOrderThrottleSnapshot(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'OrderThrottleSnapshot' }>
    ).data
    applyOrderThrottleSnapshot(data)
  }

  function handleSymbolLeverageSnapshot(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'SymbolLeverageSnapshot' }>
    ).data
    applySymbolLeverageSnapshot(data)
  }

  function handleCommandHistory(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandHistory' }>)
      .data
    commandStore.setCommandHistory(data.items)
  }

  function handleSetCommandStatus(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'SetCommandStatus' }>
    ).data
    commandStore.setCommandStatus(data.command_id, data.status)
  }

  function handleCommandDevicesList(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandDevicesList' }>
    ).data
    commandStore.devices[data.command_id] = data
  }

  function handleInspectReady(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'InspectReady' }>)
      .data
    sendSystemCommand({
      kind: 'InspectReadyAck',
      data: { command_id: data.command_id },
    })
  }

  function handleSplitPreview(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'SplitPreview' }>)
      .data
    const previewStore = useSplitPreviewStore()
    previewStore.setPreview(data)
  }

  function handleDeviceSnapshotLite(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<
      ServerToClientMessage['payload'],
      { kind: 'DeviceSnapshotLite' }
    >
    deviceStore.handleDeviceSnapshotLite(data.data)
    recordPerf('DeviceSnapshotLite', start, { device_id: data.data.device_id })
  }

  function handleDeviceLifecycle(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceLifecycle' }>)
      .data
    deviceStore.handleDeviceLifecycle(data)
    recordPerf('DeviceLifecycle', start, { device_id: data.device_id })
  }

  function handleDeviceTeDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceTeDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceTeDelta', start, {
      device_id: data.data.device_id,
      delta: data.data.delta.kind,
    })
  }

  function handleDeviceOrderDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceOrderDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceOrderDelta', start, {
      device_id: data.data.device_id,
      delta: data.data.delta.kind,
    })
  }

  function handleDeviceSgDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceSgDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceSgDelta', start, {
      device_id: data.data.device_id,
      delta: data.data.delta.kind,
    })
  }

  function handleDeviceNpDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceNpDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceNpDelta', start, {
      device_id: data.data.device_id,
      delta: data.data.delta.kind,
    })
  }

  function handleDeviceSplitDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceSplitDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceSplitDelta', start, {
      device_id: data.data.device_id,
      delta: data.data.delta.kind,
    })
  }

  function getDeviceTree(deviceId: Uuid) {
    sendSystemCommand({ kind: 'GetDeviceTree', data: { device_id: deviceId } })
  }

  onUnmounted(() => {
    flushPerfLog()
    stopPerfLoopLagMonitor()
    clearInterval(interval)
    disconnect()
  })

  return {
    // state
    status,
    lastError,
    latencyMs,
    clientId,
    username,
    protocolVersion,
    inbound,
    serverMessages,
    inboundDebugEnabled,
    outboundCount,
    reconnectCount,
    authAccepted,
    authError,
    serverActionNotice,
    marketCapabilities,
    // getters
    isConnected,
    // actions
    connect,
    disconnect,
    dismissServerActionNotice,
    setInboundDebugEnabled,
    inspectCommand,
    sendSystemPing,
    sendTokenLogin,
    sendLogout,
    sendUserCommand,
    sendUserCommandPreview,
    sendCancelCommand,
    sendCloseTrailingEntryPosition,
    sendContinueMissedTrailingEntry,
    sendRefreshAccountKeys,
    sendDeleteHyperliquidAccount,
    requestMarketCapabilities,
    capabilitiesForMarketContext,
    requestOrderThrottleSnapshot,
    applyOrderThrottleSnapshot,
    orderThrottleForMarketContext,
    requestSymbolLeverage,
    e2ePublishBybitPublicTrades,
    e2ePublishHyperliquidPublicTrades,
    applySymbolLeverageSnapshot,
    symbolLeverageForMarketContext,
    getDeviceTree,
    flushPerfLog,
  }
})
