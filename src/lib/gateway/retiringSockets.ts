import type { GatewaySocket } from './socketTypes.ts'
import type { BrowserServerMessage } from './wire.ts'

// Sockets a lease renewal replaced (networking work item 9). Each stays open
// only for replies to the commands, previews and history requests sent on
// it: the gateway answers on the socket a request came from. Whatever it
// still streams (account deltas, prices) is unsubscribed on first sight,
// since the replacement carries those now, and the gateway store closes it
// as soon as its requests are settled. A grace timer closes it regardless.

const OPEN = 1

interface RetiringSocket {
  timer: ReturnType<typeof setTimeout>
  // Subscriptions already unsubscribed on this socket.
  unsubscribed: Set<string>
}

export class RetiringSockets {
  private readonly sockets = new Map<GatewaySocket, RetiringSocket>()

  has(socket: GatewaySocket): boolean {
    return this.sockets.has(socket)
  }

  retire(socket: GatewaySocket, graceMs: number): void {
    const timer = setTimeout(() => {
      this.sockets.delete(socket)
      socket.close(1000, 'lease rotated')
    }, graceMs)
    this.sockets.set(socket, { timer, unsubscribed: new Set() })
  }

  // True when the message is a reply the caller should still handle.
  receive(socket: GatewaySocket, message: BrowserServerMessage): boolean {
    switch (message.kind) {
      case 'account_snapshot':
      case 'account_resumed':
      case 'account_delta':
        this.unsubscribe(socket, 'unsubscribe_account', message.subscription_id)
        return false
      case 'market_window':
      case 'market_samples':
      case 'market_feed_unavailable':
        this.unsubscribe(socket, 'unsubscribe_market', message.subscription_id)
        return false
      case 'command_result':
      case 'command_preview_result':
      case 'position_resolution_result':
      case 'command_history_page':
      case 'command_history_error':
      case 'legacy_command_history_page':
      case 'legacy_command_history_error':
      case 'pong':
        return true
    }
    return false
  }

  closeAll(reason: string): void {
    for (const [socket, state] of this.sockets) {
      clearTimeout(state.timer)
      socket.close(1000, reason)
    }
    this.sockets.clear()
  }

  // The socket closed by itself.
  forget(socket: GatewaySocket): void {
    const state = this.sockets.get(socket)
    if (state !== undefined) clearTimeout(state.timer)
    this.sockets.delete(socket)
  }

  private unsubscribe(
    socket: GatewaySocket,
    kind: 'unsubscribe_account' | 'unsubscribe_market',
    subscriptionId: unknown,
  ): void {
    const state = this.sockets.get(socket)
    if (state === undefined || typeof subscriptionId !== 'string') return
    if (state.unsubscribed.has(subscriptionId) || socket.readyState !== OPEN) return
    state.unsubscribed.add(subscriptionId)
    try {
      socket.send(JSON.stringify({ kind, subscription_id: subscriptionId }))
    } catch {
      // The socket is closing anyway.
    }
  }
}
