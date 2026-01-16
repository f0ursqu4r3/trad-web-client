import {
  type MarketContext,
  type ServerToClientMessage,
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
import { getBearerToken } from '@/lib/auth0Helpers'
import { useUserStore } from './user'
import { createLogger } from '@/lib/utils'
import { recordPerf, recordPerfDuration, flushPerfLog, isPerfLogEnabled } from '@/lib/perfLog'

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

export const useWsStore = defineStore('ws', () => {
  const commandStore = useCommandStore()
  const deviceStore = useDeviceStore()

  const status = ref<WsStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const clientId = ref<string | null>(null)
  const username = ref<string>('anonymous')
  const protocolVersion = ref<number | null>(null)
  const inbound = ref<RawInboundRecord[]>([])
  const inboundDebugEnabled = ref(localStorage.getItem('fe_inbound_debug') === '1')
  const outboundCount = ref(0)
  const reconnectCount = ref(0)
  const authAccepted = ref<boolean | null>(null)
  const authError = ref<string | null>(null)
  let lastPingSend: number | null = null
  let perfLoopTimer: number | null = null

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

  /* System Commands */
  function sendSystemCommand(command: SystemMessagePayload): void {
    client.send({
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

  function sendRefreshAccountKeys(accountId: Uuid, label: string, userToken: string) {
    sendSystemCommand({
      kind: 'RefreshAccountKeys',
      data: {
        account_id: accountId,
        label,
        user_token: userToken,
      },
    })
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
      DeviceSplitDelta: handleDeviceSplitDelta,
      DeviceMoDelta: handleDeviceMoDelta,
      SplitPreview: handleSplitPreview,
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
      const freshToken = await getBearerToken()
      if (freshToken) {
        localStorage.setItem('auth_token', freshToken)
        logger.info('sending TokenLogin with fresh token')
        sendTokenLogin(freshToken)
        return
      }
      const cachedToken = localStorage.getItem('auth_token')
      if (cachedToken) {
        logger.info('sending TokenLogin with stored token')
        sendTokenLogin(cachedToken)
      } else {
        logger.info('no stored token found')
      }
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
    const pending = commandStore.pendingCommands[data.request_uuid]
    commandStore.verifyPendingCommand(data.request_uuid)
    if (pending && (pending.command as { kind?: string }).kind === 'TrailingEntryOrder') {
      commandStore.inspectCommand(data.request_uuid)
    }
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
    authAccepted.value = false
    authError.value = data.error
    if (isAuthError(data.error)) {
      localStorage.removeItem('auth_token')
      logger.warn('cleared cached auth token after auth error')
    }
  }

  function handleCommandHistory(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandHistory' }>)
      .data
    commandStore.history = data.items
  }

  function handleSetCommandStatus(payload: ServerToClientMessage['payload']): void {
    const data = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'SetCommandStatus' }>
    ).data
    const idx = commandStore.history.findIndex((item) => item.command_id === data.command_id)
    if (idx !== -1) {
      commandStore.history[idx].status = data.status
      commandStore.history = [...commandStore.history]
    }
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
    recordPerf('DeviceTeDelta', start, { device_id: data.data.device_id, delta: data.data.delta.kind })
  }

  function handleDeviceMoDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceMoDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceMoDelta', start, { device_id: data.data.device_id, delta: data.data.delta.kind })
  }

  function handleDeviceSgDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceSgDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceSgDelta', start, { device_id: data.data.device_id, delta: data.data.delta.kind })
  }

  function handleDeviceSplitDelta(payload: ServerToClientMessage['payload']): void {
    const start = performance.now()
    const data = payload as Extract<ServerToClientMessage['payload'], { kind: 'DeviceSplitDelta' }>
    deviceStore.handleDeviceUpdate(data.kind, data.data)
    recordPerf('DeviceSplitDelta', start, { device_id: data.data.device_id, delta: data.data.delta.kind })
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
    inboundDebugEnabled,
    outboundCount,
    reconnectCount,
    authAccepted,
    authError,
    // getters
    isConnected,
    // actions
    connect,
    disconnect,
    setInboundDebugEnabled,
    inspectCommand,
    sendSystemPing,
    sendTokenLogin,
    sendLogout,
    sendUserCommand,
    sendUserCommandPreview,
    sendCancelCommand,
    sendCloseTrailingEntryPosition,
    sendRefreshAccountKeys,
    getDeviceTree,
    flushPerfLog,
  }
})
