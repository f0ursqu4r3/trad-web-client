import { indexedDbHistoryCache } from './historyCache.ts'
import { HistoryClient } from './historyClient.ts'

// The page's one history client: one Retry-After gate for the user's
// requests, one IndexedDB cache.
let shared: HistoryClient | null = null

export function historyClient(): HistoryClient {
  shared ??= new HistoryClient({
    baseUrl: import.meta.env.VITE_API_BASE || '/api',
    cache: indexedDbHistoryCache(),
  })
  return shared
}
