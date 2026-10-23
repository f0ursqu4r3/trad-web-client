// WebSocket ticket requests in flight, so a halted client can abort them
// (GatewayWebSocketClient.haltForProtocol).
export class TicketRequests {
  private readonly open = new Set<AbortController>()

  async request(
    getTicket: (signal?: AbortSignal) => Promise<string | null>,
  ): Promise<string | null> {
    const request = new AbortController()
    this.open.add(request)
    try {
      return await getTicket(request.signal)
    } finally {
      this.open.delete(request)
    }
  }

  abortAll(): void {
    for (const request of this.open) request.abort()
    this.open.clear()
  }
}
