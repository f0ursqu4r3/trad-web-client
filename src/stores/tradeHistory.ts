import { computed, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'

import { historyClient } from '@/lib/gateway/historyShared'
import { HistoryPager, newerSummary } from '@/lib/gateway/historyPager'
import type { TradeSummary } from '@/lib/gateway/tradeSummary'
import { useAccountsStore } from '@/stores/accounts'

// Older closed trades over HTTP (slice S3), one pager per account, kept
// across filter switches. Rows stay out of deep reactivity: the pager
// replaces its array, and one shallow trigger tells the page.

export const useTradeHistoryStore = defineStore('tradeHistory', () => {
  const accounts = useAccountsStore()
  const pagers = shallowRef(new Map<string, HistoryPager<TradeSummary>>())

  function pagerFor(accountId: string): HistoryPager<TradeSummary> {
    let pager = pagers.value.get(accountId)
    if (pager === undefined) {
      pager = new HistoryPager<TradeSummary>({
        fetchPage: async (cursor, onWait) => {
          const page = await historyClient().closedTrades(accountId, cursor, {
            onWait: (waitMs) => onWait(waitMs),
          })
          return { items: page.trades, next: page.next }
        },
        id: (summary) => summary.trade_id,
        keep: newerSummary,
        onChange: () => triggerRef(pagers),
      })
      pagers.value.set(accountId, pager)
    }
    return pager
  }

  // Read through `pagers` so a page change re-renders.
  const selected = computed(() => {
    const accountId = accounts.selectedAccountId
    const all = pagers.value
    if (accountId === null) return null
    const pager = all.get(accountId) ?? null
    return {
      accountId,
      items: pager?.items ?? [],
      status: pager?.status ?? 'idle',
      waitingMs: pager?.waitingMs ?? null,
      error: pager?.error ?? null,
    }
  })

  function loadMore(): Promise<boolean> {
    const accountId = accounts.selectedAccountId
    return accountId === null ? Promise.resolve(false) : pagerFor(accountId).loadMore()
  }

  return { selected, loadMore }
})
