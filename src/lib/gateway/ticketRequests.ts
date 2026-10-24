import { issuedTicket, type IssuedTicket, type SocketTicket } from './socketTicket.ts'

// WebSocket ticket requests in flight, so a halted client can abort them
// (GatewayWebSocketClient.haltForProtocol). A ticket names its socket URL
// (socketTicket.ts); a bare token or an older gateway's ticket keeps `base`.
export class TicketRequests {
  private readonly open = new Set<AbortController>()

  async request(
    getTicket: (signal?: AbortSignal) => Promise<string | SocketTicket | null>,
    base: string,
  ): Promise<IssuedTicket | null> {
    const request = new AbortController()
    this.open.add(request)
    try {
      return issuedTicket(await getTicket(request.signal), base)
    } finally {
      this.open.delete(request)
    }
  }

  abortAll(): void {
    for (const request of this.open) request.abort()
    this.open.clear()
  }
}
