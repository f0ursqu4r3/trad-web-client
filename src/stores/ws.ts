import { ref, computed, onUnmounted } from 'vue'
import { defineStore } from 'pinia'
import { TradWebClient } from '@/lib/ws/websocketClient'
import { useCommandStore } from '@/stores/command'
import type {
  ClientToServerMessagePayload,
  CreateAccountCommand,
  ServerToClientMessage,
  UserCommandPayload,
  Uuid,
} from '@/lib/ws/protocol'
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
  }

  function disconnect() {
    client.disconnect()
    console.info('[ws] disconnect() invoked, status -> idle')
    status.value = 'idle'
  }

  function sendSystemPing() {
    lastPingSend = performance.now()
    client.send({
      kind: 'System',
      data: { kind: 'Ping', data: { client_send_time: Date.now() } },
    })
    outboundCount.value++
  }

  function sendTokenLogin(token: string) {
    client.send({
      kind: 'UserCommand',
      data: {
        raw_text: `/tokenLogin ${token}`,
        command: {
          kind: 'TokenLogin',
          data: { token },
        } as UserCommandPayload,
      },
    } as ClientToServerMessagePayload)
    outboundCount.value++
  }

  function sendLogout() {
    client.send({
      kind: 'UserCommand',
      data: {
        raw_text: `/logout`,
        command: {
          kind: 'Logout',
          data: {
            all_sessions: false,
          },
        } as UserCommandPayload,
      },
    } as ClientToServerMessagePayload)
    outboundCount.value++
  }

  /** Generic sender for any UserCommandPayload (raw_text optional convenience) */
  function sendUserCommand(command: UserCommandPayload, rawText?: string) {
    const raw = rawText ?? `/${command.kind}`
    client.send({
      kind: 'UserCommand',
      data: { raw_text: raw, command },
    })
    outboundCount.value++
  }

  function listCommandDevices(commandId: Uuid) {
    client.send({
      kind: 'System',
      data: { kind: 'ListCommandDevicesRequest', data: { command_id: commandId } },
    })
    outboundCount.value++
  }

  function sendCancelCommand(commandId: Uuid) {
    client.send({
      kind: 'System',
      data: { kind: 'CancelCommand', data: { command_id: commandId } },
    })
    outboundCount.value++
  }

  function sendCreateAccountCommand(account: CreateAccountCommand) {
    client.send({
      kind: 'UserCommand',
      data: {
        raw_text: `/createAccount ${account.network} ${account.name} ${account.api_key}`,
        command: {
          kind: 'CreateAccount',
          data: account,
        } as UserCommandPayload,
      },
    } as ClientToServerMessagePayload)
    outboundCount.value++
  }

  function onServerMessage(msg: ServerToClientMessage) {
    const payload = msg.payload
    inbound.value.push({ ts: Date.now(), kind: payload.kind, payload: payload.data })
    if (inbound.value.length > 300) inbound.value.shift()

    switch (payload.kind) {
      case 'ClientIdAssignment': {
        const data = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'ClientIdAssignment' }>
        ).data
        clientId.value = data.new_client_id
        break
      }
      case 'ServerHello': {
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
        break
      }
      case 'SetUser': {
        authAccepted.value = true
        authError.value = null
        username.value = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'SetUser' }>
        ).data.username
        console.info('[ws] SetUser received. authAccepted -> true, username=', username.value)
        // Update user store as well
        const userStore = useUserStore()
        userStore.isServerAuthenticated = true
        break
      }
      case 'UnsetUser': {
        authAccepted.value = false
        username.value = 'anonymous'
        console.info('[ws] UnsetUser received. authAccepted -> false, username -> anonymous')
        // Keep existing authError if any; UnsetUser is not necessarily an error.
        break
      }
      case 'Pong': {
        if (lastPingSend != null) {
          latencyMs.value = performance.now() - lastPingSend
          lastPingSend = null
        }
        break
      }
      case 'FatalServerError': {
        const data = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'FatalServerError' }>
        ).data
        lastError.value = data.error
        status.value = 'error'
        console.error('[ws] FatalServerError received. status -> error', data.error)
        break
      }
      case 'ServerError': {
        // If a ServerError arrives immediately after a Login attempt, surface it as authError
        const data = (payload as Extract<ServerToClientMessage['payload'], { kind: 'ServerError' }>)
          .data
        authAccepted.value = false
        authError.value = data.error
        break
      }
      case 'CommandHistory': {
        const data = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandHistory' }>
        ).data
        commandStore.history = data.items
        break
      }
      case 'SetCommandStatus': {
        const data = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'SetCommandStatus' }>
        ).data
        const idx = commandStore.history.findIndex((item) => item.command_id === data.command_id)
        if (idx !== -1) {
          commandStore.history[idx].status = data.status
          // Force update
          commandStore.history = [...commandStore.history]
        }
        break
      }
      case 'CommandDevicesList': {
        const data = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'CommandDevicesList' }>
        ).data
        commandStore.devices[data.command_id] = data
        break
      }
      default:
        break
    }
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
    sendCreateAccountCommand,
  }
})
