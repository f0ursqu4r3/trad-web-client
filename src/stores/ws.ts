import {
  type ServerToClientMessage,
  type SystemMessagePayload,
  type UserCommandPayload,
  type Uuid,
} from '@/lib/ws/protocol'
import { ref, computed, onUnmounted } from 'vue'
import { defineStore } from 'pinia'
import { TradWebClient } from '@/lib/ws/websocketClient'
import { useCommandStore } from '@/stores/command'
import { useUserStore } from './user'

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

  const status = ref<WsStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const clientId = ref<string | null>(null)
  const username = ref<string>('anonymous')
  const protocolVersion = ref<number | null>(null)
  const inbound = ref<RawInboundRecord[]>([])
  const outboundCount = ref(0)
  const reconnectCount = ref(0)
  const authAccepted = ref<boolean | null>(null)
  const authError = ref<string | null>(null)
  let lastPingSend: number | null = null

  // Build from env (fallback to same host /ws)
  const url = import.meta.env.VITE_WS_URL || location.origin.replace(/^http/, 'ws') + '/ws'

  const client = new TradWebClient({
    url,
    clientName: 'trad-web-ui',
    build: import.meta.env.VITE_APP_BUILD || 'dev',
    logger: console,
    reconnectDelayMs: 1000,
    exponentialBackoff: true,
    maxReconnectDelayMs: 30_000,
    pingIntervalMs: 10_000,
  })

  function connect() {
    if (status.value === 'ready' || status.value === 'connecting') return
    lastError.value = null
    console.info('[ws] connect() invoked, status -> connecting, url=', url)
    status.value = 'connecting'
    client.setServerMessageHandler(onServerMessage)
    client.setFatalErrorHandler((err) => {
      lastError.value = err
      status.value = 'error'
      console.error('[ws] fatal error', err)
    })
    client.connect()
    // wait for the client to open the connection
    client.onOpen(() => {
      console.info('[ws] WebSocket connection opened')
    })
    // wait for the client to close the connection
    client.onClose((event) => {
      console.warn('[ws] WebSocket connection closed', event)
      if (status.value !== 'error') {
        status.value = 'idle'
      }
    })
    // handle ping sent
    client.onPing(() => {
      lastPingSend = performance.now()
    })
  }

  function disconnect() {
    client.disconnect()
    console.info('[ws] disconnect() invoked, status -> idle')
    status.value = 'idle'
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

  function listCommandDevices(commandId: Uuid) {
    sendSystemCommand({
      kind: 'ListCommandDevicesRequest',
      data: { command_id: commandId },
    })
  }

  function sendCancelCommand(commandId: Uuid) {
    sendSystemCommand({
      kind: 'CancelCommand',
      data: { command_id: commandId },
    })
  }

  /* User Commands */
  function sendUserCommand(command: UserCommandPayload, rawText?: string) {
    const raw = rawText ?? `/${command.kind}`
    const commandId = client.send({
      kind: 'UserCommand',
      data: { raw_text: raw, command },
    })
    outboundCount.value++
    commandStore.addPendingCommand(commandId)
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
    inbound.value.push({ ts: Date.now(), kind: payload.kind, payload: payload.data })
    if (inbound.value.length > 300) inbound.value.shift()

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
    } as Record<string, (p: ServerToClientMessage['payload']) => void>
    const handler = handlers[payload.kind]
    handler?.(payload)
  }

  /* Handlers for inbound message kinds */
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
    console.info('[ws] ServerHello received. status -> ready, protocol=', data.protocol_version)
    // send TokenLogin if we have a token stored
    const token = localStorage.getItem('auth_token')
    if (token) {
      console.info('[ws] sending TokenLogin with stored token')
      sendTokenLogin(token)
    } else {
      console.info('[ws] no stored token found')
    }
    // reset reconnect count on successful connection
    reconnectCount.value = 0
  }

  function handleSetUser(payload: ServerToClientMessage['payload']): void {
    authAccepted.value = true
    authError.value = null
    username.value = (
      payload as Extract<ServerToClientMessage['payload'], { kind: 'SetUser' }>
    ).data.username
    console.info('[ws] SetUser received. authAccepted -> true, username=', username.value)
    // Update user store as well
    const userStore = useUserStore()
    userStore.isServerAuthenticated = true
  }

  function handleUnsetUser(): void {
    authAccepted.value = false
    username.value = 'anonymous'
    console.info('[ws] UnsetUser received. authAccepted -> false, username -> anonymous')
    // Keep existing authError if any; UnsetUser is not necessarily an error.
  }

  function handleCommandResponse(payload: ServerToClientMessage['payload']): void {
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandResponse' }>)
      .data
    commandStore.verifyPendingCommand(data.request_uuid)
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
    console.error('[ws] FatalServerError received. status -> error', data.error)
  }

  function handleServerError(payload: ServerToClientMessage['payload']): void {
    // If a ServerError arrives immediately after a Login attempt, surface it as authError
    const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'ServerError' }>)
      .data
    authAccepted.value = false
    authError.value = data.error
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

  onUnmounted(() => {
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
    outboundCount,
    reconnectCount,
    authAccepted,
    authError,
    // getters
    isConnected,
    // actions
    connect,
    disconnect,
    sendSystemPing,
    sendTokenLogin,
    sendLogout,
    sendUserCommand,
    listCommandDevices,
    sendCancelCommand,
    sendRefreshAccountKeys,
  }
})
