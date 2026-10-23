import { marketStreamCauses, type MarketStreamCause } from '../telemetry/marketObservation.ts'

export type MarketStreamStatus = 'idle' | 'subscribing' | 'ready' | 'reconnecting' | 'error'

interface DisconnectableStream {
  status: MarketStreamStatus
  requestId: string | null
  subscriptionId: string | null
  error: string | null
  cause: MarketStreamCause | null
  unknownMarket: boolean
}

// The gateway socket is gone, so the stream's request and subscription are
// too. While the client reconnects the market is resubscribed on the next
// socket: that is a reconnect, not a failed feed. A market the exchange
// refused is never resubscribed and keeps its error.
export function disconnectedStream<Stream extends DisconnectableStream>(
  stream: Stream,
  reason: string,
  reconnecting: boolean,
): Stream {
  if (stream.unknownMarket && stream.status === 'error') {
    return { ...stream, requestId: null, subscriptionId: null }
  }
  return {
    ...stream,
    status: reconnecting ? 'reconnecting' : 'error',
    requestId: null,
    subscriptionId: null,
    error: reason,
    cause: marketStreamCauses.transportInterrupted,
  }
}
