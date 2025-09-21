import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { TradWebClient } from '@/lib/ws/websocketClient'
import type { ServerToClientMessage } from '@/lib/ws/protocol'

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
  let lastPingSend: number | null = null

  // Build from env (fallback to same host /ws)
  const url = import.meta.env.VITE_WS_URL || location.origin.replace(/^http/, 'ws') + '/ws'

  const client = new TradWebClient({
    url,
    clientName: 'trad-web-ui',
    build: import.meta.env.VITE_APP_BUILD || 'dev',
    logger: console,
    reconnectDelayMs: 1000,
    pingIntervalMs: 10_000,
  })

  function connect() {
    if (status.value === 'ready' || status.value === 'connecting') return
    lastError.value = null
    status.value = 'connecting'
    client.setServerMessageHandler(onServerMessage)
    client.setFatalErrorHandler((err) => {
      lastError.value = err
      status.value = 'error'
    })
    client.connect()
  }

  function disconnect() {
    client.disconnect()
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
    // getters
    isConnected,
    // actions
    connect,
    disconnect,
    sendSystemPing,
  }
})
