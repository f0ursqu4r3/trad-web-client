import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { BrowserMarketSample, BrowserMarketWindow, Uuid } from '@/lib/gateway'
import { appendMarketSamples, installMarketWindow } from '@/lib/gateway/marketWindow'

export type MarketStreamStatus = 'idle' | 'subscribing' | 'ready' | 'error'

export interface MarketStreamView {
  accountId: Uuid
  symbol: string
  status: MarketStreamStatus
  requestId: Uuid | null
  subscriptionId: Uuid | null
  oldestSequence: number | null
  nextSequence: number | null
  samples: BrowserMarketSample[]
  error: string | null
}

export const useMarketStore = defineStore('market', () => {
  const streams = ref<Record<string, MarketStreamView>>({})
  const activeKeys = computed(() => Object.keys(streams.value))

  function begin(accountId: Uuid, symbol: string, requestId: Uuid): void {
    const key = marketKey(accountId, symbol)
    const current = streams.value[key]
    streams.value[key] = {
      accountId,
      symbol: normalizeSymbol(symbol),
      status: 'subscribing',
      requestId,
      subscriptionId: null,
      oldestSequence: current?.oldestSequence ?? null,
      nextSequence: current?.nextSequence ?? null,
      samples: current?.samples ?? [],
      error: null,
    }
  }

  function install(
    accountId: Uuid,
    requestId: Uuid | null,
    subscriptionId: Uuid,
    window: BrowserMarketWindow,
  ): void {
    const symbol = normalizeSymbol(window.symbol)
    const key = marketKey(accountId, symbol)
    const current = streams.value[key]
    if (requestId !== null && current?.requestId !== requestId) return
    const installed = installMarketWindow(window)
    streams.value[key] = {
      accountId,
      symbol,
      status: 'ready',
      requestId: null,
      subscriptionId,
      oldestSequence: installed.oldestSequence,
      nextSequence: installed.nextSequence,
      samples: installed.samples,
      error: null,
    }
  }

  function append(
    accountId: Uuid,
    subscriptionId: Uuid,
    symbol: string,
    samples: BrowserMarketSample[],
  ): void {
    const key = marketKey(accountId, symbol)
    const current = streams.value[key]
    if (current?.subscriptionId !== subscriptionId || current.nextSequence === null) return
    const appended = appendMarketSamples(
      {
        oldestSequence: current.oldestSequence,
        nextSequence: current.nextSequence,
        samples: current.samples,
      },
      samples,
    )
    streams.value[key] = {
      ...current,
      samples: appended.samples,
      oldestSequence: appended.oldestSequence,
      nextSequence: appended.nextSequence,
    }
  }

  function fail(accountId: Uuid, symbol: string, reason: string): void {
    const key = marketKey(accountId, symbol)
    const current = streams.value[key]
    streams.value[key] = {
      accountId,
      symbol: normalizeSymbol(symbol),
      status: 'error',
      requestId: null,
      subscriptionId: null,
      oldestSequence: current?.oldestSequence ?? null,
      nextSequence: current?.nextSequence ?? null,
      samples: current?.samples ?? [],
      error: reason,
    }
  }

  function disconnected(reason: string): void {
    for (const [key, stream] of Object.entries(streams.value)) {
      streams.value[key] = {
        ...stream,
        status: 'error',
        requestId: null,
        subscriptionId: null,
        error: reason,
      }
    }
  }

  function remove(accountId: Uuid, symbol: string): void {
    delete streams.value[marketKey(accountId, symbol)]
  }

  function stream(accountId: Uuid | null, symbol: string | null): MarketStreamView | null {
    if (accountId === null || symbol === null) return null
    return streams.value[marketKey(accountId, symbol)] ?? null
  }

  return { streams, activeKeys, begin, install, append, fail, disconnected, remove, stream }
})

export function marketKey(accountId: Uuid, symbol: string): string {
  return `${accountId}:${normalizeSymbol(symbol)}`
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}
