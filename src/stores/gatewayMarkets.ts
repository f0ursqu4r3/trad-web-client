import type { BrowserClientMessage, BrowserServerMessage, Uuid } from '@/lib/gateway'
import {
  classifyMarketError,
  marketErrorMessage,
  MarketRetryScheduler,
  normalizeMarketDemand,
  type MarketDemand,
} from '@/lib/gateway/marketSubscriptionPolicy'
import { MarketSampleBuffer } from '@/lib/gateway/marketSampleBuffer'
import { recordTelemetry } from '@/lib/telemetry'
import {
  marketErrorCause,
  marketStreamCauses,
  marketStreamEvent,
} from '@/lib/telemetry/marketObservation'
import { marketKey, useMarketStore } from '@/stores/market'

// The gateway store's market subscriptions: which markets the UI wants
// (reference counted), the subscribe requests and live subscriptions on the
// current socket, their retries, and the buffered samples. The gateway store
// owns the socket and dispatches market messages here.

// Market samples reach the store at most this often while the tab is visible.
// A quiet feed shows its next trade at once; a busy one updates prices and
// charts ten times a second instead of on every message.
const MARKET_SAMPLE_FLUSH_INTERVAL_MS = 100
// A subscribe the gateway has not answered by then is retried. A window that
// arrives later is still used if nothing newer replaced it.
export const MARKET_SUBSCRIBE_TIMEOUT_MS = 10_000

export interface GatewayMarketDeps {
  markets: ReturnType<typeof useMarketStore>
  ready: () => boolean
  send: (message: BrowserClientMessage) => void
  logger: { debug: (...args: unknown[]) => unknown; warn: (...args: unknown[]) => unknown }
  // A price for this market was applied (its first per connection is timed).
  priceApplied: (accountId: Uuid, symbol: string) => void
}

type ServerMessage<Kind extends BrowserServerMessage['kind']> = Extract<
  BrowserServerMessage,
  { kind: Kind }
>

export function createGatewayMarkets(deps: GatewayMarketDeps) {
  const { markets, ready, send, logger, priceApplied } = deps
  const marketDemands = new Map<string, MarketDemand>()
  const marketDemandReferences = new Map<string, number>()
  const marketRequests = new Map<Uuid, MarketDemand>()
  const marketRequestTimers = new Map<Uuid, number>()
  // Requests that timed out on this socket; their late answer may still land.
  const lateMarketRequests = new Map<Uuid, MarketDemand>()
  const marketSubscriptions = new Map<Uuid, MarketDemand>()
  const marketRetries = new MarketRetryScheduler(
    (key) => ready() && marketDemands.has(key),
    (key) => {
      const demand = marketDemands.get(key)
      if (demand !== undefined) subscribeMarketDemand(demand)
    },
  )
  const pendingSamples = new MarketSampleBuffer()
  let sampleFlushTimer: number | null = null
  let lastSampleFlushAt = 0

  function subscribeMarket(accountId: Uuid, symbol: string, limit = 1_024): void {
    const demand = normalizeMarketDemand(accountId, symbol, limit)
    const key = marketKey(demand.accountId, demand.symbol)
    const references = marketDemandReferences.get(key) ?? 0
    marketDemandReferences.set(key, references + 1)
    const existing = marketDemands.get(key)
    if (existing !== undefined) {
      if (demand.limit > existing.limit) existing.limit = demand.limit
      // A new viewer of a market whose retries ran out gets one fresh attempt.
      if (
        marketRetries.exhausted(key) &&
        !markets.stream(accountId, demand.symbol)?.unknownMarket
      ) {
        marketRetries.cancel(key)
        subscribeMarketDemand(existing)
      }
      return
    }
    marketDemands.set(key, demand)
    subscribeMarketDemand(demand)
  }

  function unsubscribeMarket(accountId: Uuid, symbol: string): void {
    const key = marketKey(accountId, symbol)
    const references = marketDemandReferences.get(key) ?? 0
    if (references > 1) {
      marketDemandReferences.set(key, references - 1)
      return
    }
    marketDemandReferences.delete(key)
    marketDemands.delete(key)
    marketRetries.cancel(key)
    for (const [subscriptionId, demand] of marketSubscriptions) {
      if (marketKey(demand.accountId, demand.symbol) !== key) continue
      marketSubscriptions.delete(subscriptionId)
      pendingSamples.discard(subscriptionId)
      if (ready()) {
        try {
          send({ kind: 'unsubscribe_market', subscription_id: subscriptionId })
        } catch (error) {
          logger.debug('Market unsubscribe raced a gateway disconnect', error)
        }
      }
    }
    markets.remove(accountId, symbol)
  }

  function handleMarketWindow(message: ServerMessage<'market_window'>): void {
    const late = message.request_id !== null && lateMarketRequests.has(message.request_id)
    const demand =
      message.request_id === null
        ? marketSubscriptions.get(message.subscription_id)
        : (marketRequests.get(message.request_id) ?? lateMarketRequests.get(message.request_id))
    if (message.request_id !== null) forgetMarketRequest(message.request_id)
    if (
      demand === undefined ||
      demand.accountId !== message.account_id ||
      demand.symbol !== message.window.symbol.toUpperCase()
    ) {
      if (demand !== undefined) {
        recordTelemetry(
          marketStreamEvent(demand.accountId, demand.symbol, 'error', {
            requestId: message.request_id,
            source: 'client_validation',
            reasonCode: 'invalid_window',
          }),
        )
      }
      send({ kind: 'unsubscribe_market', subscription_id: message.subscription_id })
      return
    }
    const key = marketKey(demand.accountId, demand.symbol)
    // A late answer is used only while no newer request or subscription for
    // the market exists.
    if (!marketDemands.has(key) || (late && marketBusy(key))) {
      send({ kind: 'unsubscribe_market', subscription_id: message.subscription_id })
      return
    }
    marketSubscriptions.set(message.subscription_id, demand)
    try {
      markets.install(
        message.account_id,
        late ? null : message.request_id,
        message.subscription_id,
        message.window,
      )
      const installed = markets.stream(demand.accountId, demand.symbol)
      if (installed?.subscriptionId !== message.subscription_id) {
        recordTelemetry(
          marketStreamEvent(demand.accountId, demand.symbol, 'error', {
            requestId: message.request_id,
            source: 'client_validation',
            reasonCode: 'window_not_installed',
          }),
        )
      } else {
        const latest = installed.samples[installed.samples.length - 1]
        if (latest && installed.status === 'ready') priceApplied(demand.accountId, demand.symbol)
        recordTelemetry(
          marketStreamEvent(
            demand.accountId,
            demand.symbol,
            installed.status === 'reconnecting'
              ? 'reconnecting'
              : latest
                ? 'ready'
                : 'waiting_for_sample',
            {
              requestId: message.request_id,
              source: 'window',
              sampleCount: installed.samples.length,
              lastSampleReceivedAtMs: latest?.received_at_ms ?? null,
            },
          ),
        )
      }
      marketRetries.cancel(key)
    } catch (error) {
      logger.warn('Market window rejected; requesting a fresh window', error)
      recordTelemetry(
        marketStreamEvent(demand.accountId, demand.symbol, 'error', {
          requestId: message.request_id,
          source: 'client_validation',
          reasonCode: 'invalid_window',
        }),
      )
      resubscribeMarket(message.subscription_id, demand)
    }
  }

  function handleMarketSamples(message: ServerMessage<'market_samples'>): void {
    const demand = marketSubscriptions.get(message.subscription_id)
    if (
      demand === undefined ||
      demand.accountId !== message.account_id ||
      demand.symbol !== message.symbol.toUpperCase()
    ) {
      return
    }
    const applied = markets.stream(demand.accountId, demand.symbol)
    try {
      pendingSamples.push(
        {
          subscriptionId: message.subscription_id,
          accountId: message.account_id,
          symbol: message.symbol,
        },
        message.samples,
        applied?.subscriptionId === message.subscription_id ? applied.nextSequence : null,
      )
    } catch (error) {
      rejectMarketSamples(message.subscription_id, demand, error)
      return
    }
    scheduleMarketSampleFlush()
  }

  // A hidden tab holds its samples until it is shown again, or until another
  // gateway message has to apply after them.
  function scheduleMarketSampleFlush(): void {
    if (pendingSamples.size === 0 || sampleFlushTimer !== null) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const wait = Math.max(0, lastSampleFlushAt + MARKET_SAMPLE_FLUSH_INTERVAL_MS - Date.now())
    sampleFlushTimer = window.setTimeout(
      () => {
        sampleFlushTimer = null
        flushMarketSamples()
      },
      Math.min(wait, MARKET_SAMPLE_FLUSH_INTERVAL_MS),
    )
  }

  function flushMarketSamples(): void {
    if (sampleFlushTimer !== null) window.clearTimeout(sampleFlushTimer)
    sampleFlushTimer = null
    if (pendingSamples.size === 0) return
    lastSampleFlushAt = Date.now()
    for (const pending of pendingSamples.drain()) {
      const demand = marketSubscriptions.get(pending.subscriptionId)
      if (demand === undefined) continue
      const previous = markets.stream(demand.accountId, demand.symbol)
      const wasReady = previous?.status === 'ready' && previous.samples.length > 0
      try {
        markets.append(pending.accountId, pending.subscriptionId, pending.symbol, pending.samples)
      } catch (error) {
        rejectMarketSamples(pending.subscriptionId, demand, error)
        continue
      }
      if (wasReady) continue
      const samples = markets.stream(demand.accountId, demand.symbol)?.samples ?? []
      const latest = samples[samples.length - 1]
      if (latest) {
        priceApplied(demand.accountId, demand.symbol)
        recordTelemetry(
          marketStreamEvent(demand.accountId, demand.symbol, 'ready', {
            source: 'samples',
            sampleCount: pending.samples.length,
            lastSampleReceivedAtMs: latest.received_at_ms,
          }),
        )
      }
    }
  }

  function rejectMarketSamples(subscriptionId: Uuid, demand: MarketDemand, error: unknown): void {
    logger.warn('Market samples rejected; requesting a fresh window', error)
    pendingSamples.discard(subscriptionId)
    recordTelemetry(
      marketStreamEvent(demand.accountId, demand.symbol, 'error', {
        source: 'client_validation',
        reasonCode: 'invalid_samples',
      }),
    )
    resubscribeMarket(subscriptionId, demand)
  }

  function handleMarketFeedUnavailable(message: ServerMessage<'market_feed_unavailable'>): void {
    const demand = marketSubscriptions.get(message.subscription_id)
    if (
      demand === undefined ||
      demand.accountId !== message.account_id ||
      demand.symbol !== message.symbol.toUpperCase()
    )
      return
    // This is a recoverable health change, not failed subscription admission.
    // Keep the same subscription so its next real price can restore valuation.
    markets.unavailable(message.account_id, message.subscription_id, demand.symbol, message.reason)
    recordTelemetry(
      marketStreamEvent(demand.accountId, demand.symbol, 'reconnecting', {
        source: 'feed_health',
        ...marketStreamCauses.feedUnavailable,
      }),
    )
  }

  function handleMarketError(message: ServerMessage<'market_error'>): void {
    // A timed-out request already counted as failed and is being retried.
    if (message.request_id !== null && lateMarketRequests.delete(message.request_id)) return
    const demand =
      message.request_id === null
        ? message.subscription_id === null
          ? undefined
          : marketSubscriptions.get(message.subscription_id)
        : marketRequests.get(message.request_id)
    if (message.request_id !== null) forgetMarketRequest(message.request_id)
    if (message.subscription_id !== null) marketSubscriptions.delete(message.subscription_id)
    if (demand === undefined) return
    const key = marketKey(demand.accountId, demand.symbol)
    // The UI let go of this market while the request was in flight.
    if (!marketDemands.has(key)) return
    // A refused retry (for example the gateway's duplicate guard) while a late
    // answer already delivered the market leaves the live stream alone.
    if (message.subscription_id === null && marketSubscribed(key)) return
    const errorClass = classifyMarketError(message.error)
    const cause = marketErrorCause(message.error.kind)
    markets.fail(
      demand.accountId,
      demand.symbol,
      marketErrorMessage(message.error),
      cause,
      errorClass === 'unknown_market',
    )
    recordTelemetry(
      marketStreamEvent(demand.accountId, demand.symbol, 'error', {
        requestId: message.request_id,
        source: 'market_error',
        ...cause,
        retryCount: marketRetries.attempts(key),
      }),
    )
    if (errorClass === 'retry') {
      scheduleMarketRetry(demand)
    } else {
      marketRetries.cancel(key)
    }
  }

  function handleMarketUnsubscribed(subscriptionId: Uuid): void {
    marketSubscriptions.delete(subscriptionId)
  }

  function subscribeMarketDemand(demand: MarketDemand, markSubscribing = true): void {
    if (!ready()) return
    const key = marketKey(demand.accountId, demand.symbol)
    if (marketBusy(key)) return
    const requestId = crypto.randomUUID()
    marketRequests.set(requestId, demand)
    markets.begin(demand.accountId, demand.symbol, requestId, !markSubscribing)
    try {
      send({
        kind: 'subscribe_market',
        request_id: requestId,
        account_id: demand.accountId,
        symbol: demand.symbol,
        limit: demand.limit,
      })
      marketRequestTimers.set(
        requestId,
        window.setTimeout(() => marketRequestTimedOut(requestId), MARKET_SUBSCRIBE_TIMEOUT_MS),
      )
      recordTelemetry(
        marketStreamEvent(demand.accountId, demand.symbol, 'subscribing', {
          requestId,
          source: 'request',
          retryCount: marketRetries.attempts(key),
        }),
      )
    } catch (error) {
      forgetMarketRequest(requestId)
      markets.fail(
        demand.accountId,
        demand.symbol,
        'gateway disconnected before subscription',
        marketStreamCauses.sendFailed,
      )
      recordTelemetry(
        marketStreamEvent(demand.accountId, demand.symbol, 'error', {
          requestId,
          source: 'request',
          ...marketStreamCauses.sendFailed,
        }),
      )
      logger.debug('Market subscribe raced a gateway disconnect', error)
      scheduleMarketRetry(demand)
    }
  }

  // No answer within the timeout: the request no longer blocks a retry. Its
  // answer may still arrive and is then used if nothing newer took its place.
  function marketRequestTimedOut(requestId: Uuid): void {
    marketRequestTimers.delete(requestId)
    const demand = marketRequests.get(requestId)
    if (demand === undefined) return
    marketRequests.delete(requestId)
    lateMarketRequests.set(requestId, demand)
    const key = marketKey(demand.accountId, demand.symbol)
    if (!marketDemands.has(key)) return
    logger.warn(`Market ${demand.symbol} subscription timed out; retrying`)
    markets.fail(
      demand.accountId,
      demand.symbol,
      'price feed request timed out; retrying',
      marketStreamCauses.requestTimeout,
    )
    recordTelemetry(
      marketStreamEvent(demand.accountId, demand.symbol, 'error', {
        requestId,
        source: 'request',
        ...marketStreamCauses.requestTimeout,
        retryCount: marketRetries.attempts(key),
      }),
    )
    scheduleMarketRetry(demand)
  }

  function forgetMarketRequest(requestId: Uuid): void {
    marketRequests.delete(requestId)
    lateMarketRequests.delete(requestId)
    const timer = marketRequestTimers.get(requestId)
    if (timer !== undefined) window.clearTimeout(timer)
    marketRequestTimers.delete(requestId)
  }

  // A request is in flight or a subscription is live for this market.
  function marketBusy(key: string): boolean {
    for (const current of marketRequests.values()) {
      if (marketKey(current.accountId, current.symbol) === key) return true
    }
    return marketSubscribed(key)
  }

  function marketSubscribed(key: string): boolean {
    for (const current of marketSubscriptions.values()) {
      if (marketKey(current.accountId, current.symbol) === key) return true
    }
    return false
  }

  function subscribeMarketDemands(markSubscribing = true): void {
    for (const demand of marketDemands.values()) {
      // A reconnect must not ask the exchange again for a market it refused.
      if (markets.stream(demand.accountId, demand.symbol)?.unknownMarket) continue
      subscribeMarketDemand(demand, markSubscribing)
    }
  }

  function resubscribeMarket(subscriptionId: Uuid, demand: MarketDemand): void {
    marketSubscriptions.delete(subscriptionId)
    try {
      send({ kind: 'unsubscribe_market', subscription_id: subscriptionId })
    } catch {
      return
    }
    scheduleMarketRetry(demand, 0)
  }

  function scheduleMarketRetry(demand: MarketDemand, minimumDelay?: number): void {
    const key = marketKey(demand.accountId, demand.symbol)
    if (marketRetries.schedule(key, minimumDelay) !== 'exhausted') return
    const attempts = marketRetries.attempts(key)
    logger.warn(`Market ${demand.symbol} subscription gave up after ${attempts} retries`)
    markets.fail(
      demand.accountId,
      demand.symbol,
      `price feed unavailable after ${attempts} retries`,
      marketStreamCauses.retriesExhausted,
    )
    recordTelemetry(
      marketStreamEvent(demand.accountId, demand.symbol, 'error', {
        source: 'request',
        ...marketStreamCauses.retriesExhausted,
        retryCount: attempts,
      }),
    )
  }

  // The socket's subscriptions are gone; the demands stay for the next socket.
  function resetMarketSubscriptions(): void {
    marketRetries.cancelAll()
    for (const timer of marketRequestTimers.values()) window.clearTimeout(timer)
    marketRequestTimers.clear()
    marketRequests.clear()
    lateMarketRequests.clear()
    marketSubscriptions.clear()
  }

  return {
    subscribeMarket,
    unsubscribeMarket,
    handleMarketWindow,
    handleMarketSamples,
    handleMarketFeedUnavailable,
    handleMarketError,
    handleMarketUnsubscribed,
    flushMarketSamples,
    subscribeMarketDemands,
    resetMarketSubscriptions,
  }
}
