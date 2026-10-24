import { indexedDbHistoryCache } from './historyCache.ts'
import { HistoryClient } from './historyClient.ts'
import { historyRoute } from './socketTicket.ts'
import { getSocketTicket } from '@/lib/auth'

// The page's one history client: one Retry-After gate for the user's
// requests, one IndexedDB cache. A user with a cell reads their cell's
// edge with the pass from the latest socket ticket.
let shared: HistoryClient | null = null

export function historyClient(): HistoryClient {
  shared ??= new HistoryClient({
    baseUrl: import.meta.env.VITE_API_BASE || '/api',
    route: historyRoute,
    renewRoute: async () => {
      await getSocketTicket()
    },
    cache: indexedDbHistoryCache(),
  })
  return shared
}
