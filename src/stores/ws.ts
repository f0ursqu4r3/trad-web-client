import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { TradWebClient } from '@/lib/ws/websocketClient'
import type {
  ClientToServerMessage,
  ClientToServerMessagePayload,
  ServerToClientMessage,
  UserCommandPayload,
} from '@/lib/ws/protocol'

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
  const status = ref<WsStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const clientId = ref<string | null>(null)
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
  }

  function disconnect() {
    client.disconnect()
    console.info('[ws] disconnect() invoked, status -> idle')
    status.value = 'idle'
  }

  function setAuthToken(token: string | null) {
    // Update token and if already connected or connecting, force a reconnect so Hello carries new token
    client.setAuthToken(token)
    if (status.value === 'ready' || status.value === 'connecting') {
      disconnect()
      connect()
    }
  }

  function sendSystemPing() {
    lastPingSend = performance.now()
    client.send({
      kind: 'System',
      data: { kind: 'Ping', data: { client_send_time: Date.now() } },
    })
    outboundCount.value++
  }

  function sendAuthenticate(username: string, password: string) {
    const passwordHash = password
    client.send({
      kind: 'UserCommand',
      data: {
        kind: 'Login',
        data: { username, password_hash: passwordHash },
      } as UserCommandPayload,
    } as ClientToServerMessagePayload)
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
        break
      }
      case 'AuthAccepted': {
        authAccepted.value = true
        authError.value = null
        break
      }
      case 'AuthRejected': {
        authAccepted.value = false
        const data = (
          payload as Extract<ServerToClientMessage['payload'], { kind: 'AuthRejected' }>
        ).data
        authError.value = data.reason
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
    setAuthToken,
    sendAuthenticate,
  }
})
