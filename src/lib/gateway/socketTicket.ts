// The socket ticket and where to use it (backend multi-user-readiness S5).
// A user with a cell connects to their cell's edge (`ws_url`
// "/ws/<cell>") and reads history pages there with a history pass; anyone
// else, and a gateway that sends no `ws_url`, stays on "/ws" with the
// session cookie.

export interface SocketTicket {
  token: string
  // The socket path ("/ws" or "/ws/<cell>"); null from an older gateway.
  wsUrl: string | null
  // Where this user's history pages live, and their bearer; null on /ws.
  historyUrl: string | null
  historyToken: string | null
}

// What the gateway client opens: the token and the absolute socket URL.
export interface IssuedTicket {
  token: string
  url: string
}

// The history base and bearer for a user with a cell.
export interface HistoryRoute {
  baseUrl: string
  bearer: string
}

const SOCKET_PATH = /^\/ws(\/[A-Za-z0-9_-]{1,64})?$/
const HISTORY_PATH = /^\/ws\/[A-Za-z0-9_-]{1,64}\/api$/

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// The ticket response; paths the gateway never sends are ignored.
export function parseSocketTicket(body: unknown): SocketTicket | null {
  if (typeof body !== 'object' || body === null) return null
  const fields = body as Record<string, unknown>
  const token = text(fields.token)
  if (token === null) return null
  const wsUrl = text(fields.ws_url)
  const historyUrl = text(fields.history_url)
  const historyToken = text(fields.history_token)
  const history = historyUrl !== null && HISTORY_PATH.test(historyUrl) && historyToken !== null
  return {
    token,
    wsUrl: wsUrl !== null && SOCKET_PATH.test(wsUrl) ? wsUrl : null,
    historyUrl: history ? historyUrl : null,
    historyToken: history ? historyToken : null,
  }
}

// `wsUrl` on the host of `base` (the configured "/ws" URL); `base` itself
// when the ticket names no path.
export function socketUrl(base: string, wsUrl: string | null): string {
  if (wsUrl === null) return base
  try {
    return new URL(wsUrl, base).toString()
  } catch {
    return base
  }
}

// A ticket as the client opens it; a bare token keeps the configured URL.
export function issuedTicket(
  ticket: string | SocketTicket | null,
  base: string,
): IssuedTicket | null {
  if (ticket === null) return null
  if (typeof ticket === 'string') return ticket.length > 0 ? { token: ticket, url: base } : null
  if (ticket.token.length === 0) return null
  return { token: ticket.token, url: socketUrl(base, ticket.wsUrl) }
}

// The latest ticket's history route; the history client reads it per
// request, so a renewed pass is used as soon as the socket has it.
let currentHistoryRoute: HistoryRoute | null = null

export function rememberHistoryRoute(ticket: SocketTicket, apiOrigin: string): void {
  if (ticket.historyUrl === null || ticket.historyToken === null) {
    currentHistoryRoute = null
    return
  }
  try {
    const baseUrl = new URL(ticket.historyUrl, apiOrigin).toString()
    currentHistoryRoute = { baseUrl, bearer: ticket.historyToken }
  } catch {
    currentHistoryRoute = null
  }
}

export function historyRoute(): HistoryRoute | null {
  return currentHistoryRoute
}

export function forgetHistoryRoute(): void {
  currentHistoryRoute = null
}
