import { computed, onBeforeUnmount, shallowRef, type ComputedRef } from 'vue'

import type { HistoryRequestError } from '@/lib/gateway/historyClient'
import {
  HistoryPager,
  type HistoryPagerOptions,
  type PagerStatus,
} from '@/lib/gateway/historyPager'

// A component's own history pager (fills, evidence, exposures): loaded on
// demand, dropped when the component goes.

export interface HistoryPagerState<T> {
  items: readonly T[]
  status: PagerStatus
  waitingMs: number | null
  error: HistoryRequestError | null
}

export function useHistoryPager<T>(options: Omit<HistoryPagerOptions<T>, 'onChange'>): {
  state: ComputedRef<HistoryPagerState<T>>
  loadMore: () => Promise<boolean>
  reset: () => void
} {
  const version = shallowRef(0)
  const pager = new HistoryPager<T>({ ...options, onChange: () => (version.value += 1) })
  const state = computed<HistoryPagerState<T>>(() => {
    void version.value
    return {
      items: pager.items,
      status: pager.status,
      waitingMs: pager.waitingMs,
      error: pager.error,
    }
  })
  onBeforeUnmount(() => pager.reset())
  return { state, loadMore: () => pager.loadMore(), reset: () => pager.reset() }
}

// What the page says about a history request that is not plainly loading.
export function historyErrorText(error: HistoryRequestError): string {
  switch (error.code) {
    case 'rate_limited':
      return 'Too many history requests right now. Try again in a moment.'
    case 'account_unavailable':
      return 'Account history is reloading. Try again in a moment.'
    case 'account_not_found':
      return 'This account’s history is not available.'
    case 'unknown_trade':
      return 'The server does not know this trade.'
    case 'network':
      return 'Could not reach Trad. Check the connection and try again.'
    default:
      return `History did not load: ${error.message}`
  }
}
