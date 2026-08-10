import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  GatewayWebSocketClient,
  type BrowserClientMessage,
  type BrowserCommandIntent,
  type BrowserCommandOutcome,
  type BrowserHistoryError,
  type BrowserPreviewIntent,
  type BrowserPreviewOutcome,
  type BrowserReconciliationRefreshOutcome,
  type BrowserServerMessage,
  type GatewayConnectionStatus,
  type Uuid,
} from '@/lib/gateway'
import { getWebSocketToken } from '@/lib/auth'
import { createLogger } from '@/lib/utils'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { marketKey, useMarketStore } from '@/stores/market'

const logger = createLogger('gateway')
const COMMAND_RESULT_TIMEOUT_MS = 30_000
const RECONCILIATION_RESULT_TIMEOUT_MS = 30_000
const PREVIEW_RESULT_TIMEOUT_MS = 15_000
const HISTORY_RESULT_TIMEOUT_MS = 30_000
const SUBSCRIPTION_RETRY_INITIAL_MS = 1_000
const SUBSCRIPTION_RETRY_MAX_MS = 30_000

interface PendingCommand {
  accountId: Uuid
  timer: number
  resolve: (outcome: BrowserCommandOutcome) => void
  reject: (error: Error) => void
}

interface PendingHistory {
  accountId: Uuid
  kind: 'modern' | 'legacy'
  timer: number
  resolve: () => void
  reject: (error: Error) => void
}

interface PendingPreview {
  accountId: Uuid
  timer: number
  resolve: (outcome: BrowserPreviewOutcome) => void
  reject: (error: Error) => void
}

interface PendingReconciliationRefresh {
  accountId: Uuid
  timer: number
  resolve: (outcome: BrowserReconciliationRefreshOutcome) => void
  reject: (error: Error) => void
}

interface MarketDemand {
  accountId: Uuid
  symbol: string
  limit: number
}

export interface ReconciliationRefreshState {
  requestId: Uuid
  cycleId: Uuid | null
  duplicate: boolean
  error: string | null
}

export class CommandOutcomeUnknownError extends Error {
  readonly requestId: Uuid

  constructor(requestId: Uuid, reason: string) {
    super(`command ${requestId} outcome is unknown: ${reason}`)
    this.name = 'CommandOutcomeUnknownError'
    this.requestId = requestId
  }
}

export const useGatewayStore = defineStore('gateway', () => {
  const accounts = useAccountsStore()
  const projections = useAccountProjectionStore()
  const markets = useMarketStore()
  const status = ref<GatewayConnectionStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const sessionValidUntil = ref<number | null>(null)
  const pendingCommandCount = ref(0)
  const pendingHistoryCount = ref(0)
  const pendingReconciliationCount = ref(0)
  const reconciliationRefreshByAccount = ref<Record<Uuid, ReconciliationRefreshState>>({})

  const subscriptionRequests = new Map<Uuid, Uuid>()
  const subscriptionAccounts = new Map<Uuid, Uuid>()
  const subscriptionRetryAttempts = new Map<Uuid, number>()
  const subscriptionRetryTimers = new Map<Uuid, number>()
  const marketDemands = new Map<string, MarketDemand>()
  const marketRequests = new Map<Uuid, MarketDemand>()
  const marketSubscriptions = new Map<Uuid, MarketDemand>()
  const marketRetryAttempts = new Map<string, number>()
  const marketRetryTimers = new Map<string, number>()
  const pendingCommands = new Map<Uuid, PendingCommand>()
  const pendingPreviews = new Map<Uuid, PendingPreview>()
  const pendingHistories = new Map<Uuid, PendingHistory>()
  const pendingReconciliationRefreshes = new Map<Uuid, PendingReconciliationRefresh>()
  let selectedSubscriptionId: Uuid | null = null
  let started = false

  const url = import.meta.env.VITE_WS_URL || location.origin.replace(/^http/, 'ws') + '/ws'
  const client = new GatewayWebSocketClient({
    url,
    getTicket: getWebSocketToken,
    reconnectDelayMs: 1_000,
    maxReconnectDelayMs: 30_000,
    pingIntervalMs: 30_000,
    logger,
  })

  const isConnected = computed(() => status.value === 'ready')

  client.setStatusHandler((next, error) => {
    const wasReady = status.value === 'ready'
    status.value = next
    lastError.value = error
    if (wasReady && next !== 'ready') {
      projections.markAllStale(error ?? 'gateway connection interrupted')
      markets.disconnected(error ?? 'gateway connection interrupted')
      losePendingRequests(error ?? 'gateway connection interrupted')
      resetSubscriptions()
    }
  })
  client.setReadyHandler((validForMs) => {
    sessionValidUntil.value = Date.now() + validForMs
    resetSubscriptions()
    subscribeSelectedAccount()
    subscribeMarketDemands()
  })
  client.setMessageHandler(handleMessage)

  watch(
    () => accounts.selectedAccountId,
    () => {
      if (status.value === 'ready') switchSelectedAccount()
    },
  )

  function connect(): void {
    if (started) return
    started = true
    client.connect()
  }

  function disconnect(): void {
    if (!started) return
    started = false
    client.disconnect()
    projections.markAllStale('gateway disconnected')
    markets.disconnected('gateway disconnected')
    losePendingRequests('gateway disconnected')
    resetSubscriptions()
  }

  function submitCommand(
    intent: BrowserCommandIntent,
    accountId = accounts.selectedAccountId,
    requestId = uuid(),
  ): Promise<BrowserCommandOutcome> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    if (pendingCommands.has(requestId)) {
      return Promise.reject(new Error(`command request ${requestId} is already pending`))
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingCommands.delete(requestId)
        updatePendingCounts()
        reject(new CommandOutcomeUnknownError(requestId, 'gateway response timed out'))
      }, COMMAND_RESULT_TIMEOUT_MS)
      pendingCommands.set(requestId, { accountId, timer, resolve, reject })
      updatePendingCounts()
      try {
        send({ kind: 'submit_command', request_id: requestId, account_id: accountId, intent })
      } catch (error) {
        window.clearTimeout(timer)
        pendingCommands.delete(requestId)
        updatePendingCounts()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function refreshReconciliation(
    accountId = accounts.selectedAccountId,
    requestId = uuid(),
  ): Promise<BrowserReconciliationRefreshOutcome> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    if (pendingReconciliationRefreshes.has(requestId)) {
      return Promise.reject(new Error(`reconciliation request ${requestId} is already pending`))
    }
    if (
      Array.from(pendingReconciliationRefreshes.values()).some(
        (pending) => pending.accountId === accountId,
      )
    ) {
      return Promise.reject(new Error('an account reconciliation request is already pending'))
    }

    reconciliationRefreshByAccount.value[accountId] = {
      requestId,
      cycleId: null,
      duplicate: false,
      error: null,
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingReconciliationRefreshes.delete(requestId)
        updatePendingCounts()
        reconciliationRefreshByAccount.value[accountId] = {
          requestId,
          cycleId: null,
          duplicate: false,
          error: 'gateway response timed out; reconciliation outcome is unknown',
        }
        reject(new Error(`reconciliation request ${requestId} timed out`))
      }, RECONCILIATION_RESULT_TIMEOUT_MS)
      pendingReconciliationRefreshes.set(requestId, { accountId, timer, resolve, reject })
      updatePendingCounts()
      try {
        send({ kind: 'refresh_reconciliation', request_id: requestId, account_id: accountId })
      } catch (error) {
        window.clearTimeout(timer)
        pendingReconciliationRefreshes.delete(requestId)
        updatePendingCounts()
        const failure = error instanceof Error ? error : new Error(String(error))
        reconciliationRefreshByAccount.value[accountId] = {
          requestId,
          cycleId: null,
          duplicate: false,
          error: failure.message,
        }
        reject(failure)
      }
    })
  }

  function previewCommand(
    intent: BrowserPreviewIntent,
    accountId = accounts.selectedAccountId,
    requestId = uuid(),
  ): Promise<BrowserPreviewOutcome> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    if (pendingPreviews.has(requestId)) {
      return Promise.reject(new Error(`planning request ${requestId} is already pending`))
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingPreviews.delete(requestId)
        reject(new Error(`planning request ${requestId} timed out`))
      }, PREVIEW_RESULT_TIMEOUT_MS)
      pendingPreviews.set(requestId, { accountId, timer, resolve, reject })
      try {
        send({ kind: 'preview_command', request_id: requestId, account_id: accountId, intent })
      } catch (error) {
        window.clearTimeout(timer)
        pendingPreviews.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function requestOlderHistory(accountId = accounts.selectedAccountId, limit = 100): Promise<void> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    const entry = projections.byAccount[accountId]
    if (entry?.view === null || entry?.view === undefined) {
      return Promise.reject(new Error('account projection is not ready'))
    }
    const requestId = uuid()
    const before = entry.view.history?.next_cursor ?? null
    const expectedRevision = entry.view.live.checkpoint.projection_revision

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(new Error(`history request ${requestId} timed out`))
      }, HISTORY_RESULT_TIMEOUT_MS)
      pendingHistories.set(requestId, { accountId, kind: 'modern', timer, resolve, reject })
      updatePendingCounts()
      try {
        send({
          kind: 'request_command_history',
          request_id: requestId,
          account_id: accountId,
          expected_projection_revision: expectedRevision,
          before,
          limit,
        })
      } catch (error) {
        window.clearTimeout(timer)
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function requestLegacyHistory(
    accountId = accounts.selectedAccountId,
    limit = 100,
  ): Promise<void> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    const entry = projections.byAccount[accountId]
    if (entry?.view === null || entry?.view === undefined) {
      return Promise.reject(new Error('account projection is not ready'))
    }
    if (entry.view.live.checkpoint.legacy_migration === undefined) {
      return Promise.reject(new Error('account has no imported command history'))
    }
    const requestId = uuid()
    const before = entry.view.legacyHistory?.next_cursor ?? null
    const expectedRevision = entry.view.live.checkpoint.projection_revision

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(new Error(`imported history request ${requestId} timed out`))
      }, HISTORY_RESULT_TIMEOUT_MS)
      pendingHistories.set(requestId, { accountId, kind: 'legacy', timer, resolve, reject })
      updatePendingCounts()
      try {
        send({
          kind: 'request_legacy_command_history',
          request_id: requestId,
          account_id: accountId,
          expected_projection_revision: expectedRevision,
          before,
          limit,
        })
      } catch (error) {
        window.clearTimeout(timer)
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function subscribeMarket(accountId: Uuid, symbol: string, limit = 1_024): void {
    const demand = normalizeMarketDemand(accountId, symbol, limit)
    const key = marketKey(demand.accountId, demand.symbol)
    marketDemands.set(key, demand)
    subscribeMarketDemand(demand)
  }

  function unsubscribeMarket(accountId: Uuid, symbol: string): void {
    const key = marketKey(accountId, symbol)
    marketDemands.delete(key)
    clearMarketRetry(key)
    for (const [subscriptionId, demand] of marketSubscriptions) {
      if (marketKey(demand.accountId, demand.symbol) !== key) continue
      marketSubscriptions.delete(subscriptionId)
      if (status.value === 'ready') {
        try {
          send({ kind: 'unsubscribe_market', subscription_id: subscriptionId })
        } catch (error) {
          logger.debug('Market unsubscribe raced a gateway disconnect', error)
        }
      }
    }
    markets.remove(accountId, symbol)
  }

  function handleMessage(message: BrowserServerMessage): void {
    switch (message.kind) {
      case 'hello':
        return
      case 'account_snapshot':
        handleSnapshot(message)
        return
      case 'account_delta':
        handleDelta(message)
        return
      case 'account_error':
        handleAccountError(message)
        return
      case 'account_unsubscribed':
        handleUnsubscribed(message.subscription_id)
        return
      case 'market_window':
        handleMarketWindow(message)
        return
      case 'market_samples':
        handleMarketSamples(message)
        return
      case 'market_error':
        handleMarketError(message)
        return
      case 'market_unsubscribed':
        marketSubscriptions.delete(message.subscription_id)
        return
      case 'command_result':
        handleCommandResult(message)
        return
      case 'command_preview_result':
        handleCommandPreviewResult(message)
        return
      case 'reconciliation_refresh_result':
        handleReconciliationRefreshResult(message)
        return
      case 'command_history_page':
        handleHistoryPage(message)
        return
      case 'command_history_error':
        handleHistoryError(message.request_id, message.error, 'modern')
        return
      case 'legacy_command_history_page':
        handleLegacyHistoryPage(message)
        return
      case 'legacy_command_history_error':
        handleHistoryError(message.request_id, message.error, 'legacy')
        return
      case 'pong':
        latencyMs.value = Math.max(0, Date.now() - message.nonce)
        return
    }
  }

  function handleSnapshot(
    message: Extract<BrowserServerMessage, { kind: 'account_snapshot' }>,
  ): void {
    const requestedAccount =
      message.request_id === null
        ? message.route.account_id
        : subscriptionRequests.get(message.request_id)
    if (message.request_id !== null) subscriptionRequests.delete(message.request_id)
    const accountId = message.snapshot.checkpoint.shard.account_id
    if (
      requestedAccount !== accountId ||
      message.route.account_id !== accountId ||
      message.route.exchange !== message.snapshot.checkpoint.shard.exchange ||
      message.route.network !== message.snapshot.checkpoint.shard.network
    ) {
      projections.fail(accountId, 'gateway snapshot route does not match its projection shard')
      resubscribe(accountId, message.subscription_id)
      return
    }

    subscriptionAccounts.set(message.subscription_id, accountId)
    if (accounts.selectedAccountId !== accountId) {
      send({ kind: 'unsubscribe_account', subscription_id: message.subscription_id })
      return
    }
    selectedSubscriptionId = message.subscription_id
    clearSubscriptionRetry(accountId)
    projections.install(accountId, message.subscription_id, message.cause, message.snapshot)
  }

  function handleDelta(message: Extract<BrowserServerMessage, { kind: 'account_delta' }>): void {
    const accountId = subscriptionAccounts.get(message.subscription_id)
    if (accountId === undefined || accountId !== message.route.account_id) return
    try {
      projections.apply(accountId, message.subscription_id, message.delta)
    } catch (error) {
      logger.warn('Projection delta rejected; requesting a fresh snapshot', error)
      resubscribe(accountId, message.subscription_id)
    }
  }

  function handleAccountError(
    message: Extract<BrowserServerMessage, { kind: 'account_error' }>,
  ): void {
    if (message.request_id !== null) subscriptionRequests.delete(message.request_id)
    if (message.subscription_id !== null) {
      subscriptionAccounts.delete(message.subscription_id)
      if (selectedSubscriptionId === message.subscription_id) selectedSubscriptionId = null
    }
    projections.fail(message.account_id, subscriptionError(message.error))
    if (message.error.kind !== 'unauthorized') scheduleSubscriptionRetry(message.account_id)
  }

  function handleUnsubscribed(subscriptionId: Uuid): void {
    const accountId = subscriptionAccounts.get(subscriptionId)
    subscriptionAccounts.delete(subscriptionId)
    projections.clearSubscription(subscriptionId)
    if (selectedSubscriptionId === subscriptionId) selectedSubscriptionId = null
    if (accountId === accounts.selectedAccountId) subscribeSelectedAccount()
  }

  function handleMarketWindow(
    message: Extract<BrowserServerMessage, { kind: 'market_window' }>,
  ): void {
    const demand =
      message.request_id === null
        ? marketSubscriptions.get(message.subscription_id)
        : marketRequests.get(message.request_id)
    if (message.request_id !== null) marketRequests.delete(message.request_id)
    if (
      demand === undefined ||
      demand.accountId !== message.account_id ||
      demand.symbol !== message.window.symbol.toUpperCase()
    ) {
      send({ kind: 'unsubscribe_market', subscription_id: message.subscription_id })
      return
    }
    const key = marketKey(demand.accountId, demand.symbol)
    if (!marketDemands.has(key)) {
      send({ kind: 'unsubscribe_market', subscription_id: message.subscription_id })
      return
    }
    marketSubscriptions.set(message.subscription_id, demand)
    try {
      markets.install(
        message.account_id,
        message.request_id,
        message.subscription_id,
        message.window,
      )
      clearMarketRetry(key)
    } catch (error) {
      logger.warn('Market window rejected; requesting a fresh window', error)
      resubscribeMarket(message.subscription_id, demand)
    }
  }

  function handleMarketSamples(
    message: Extract<BrowserServerMessage, { kind: 'market_samples' }>,
  ): void {
    const demand = marketSubscriptions.get(message.subscription_id)
    if (
      demand === undefined ||
      demand.accountId !== message.account_id ||
      demand.symbol !== message.symbol.toUpperCase()
    ) {
      return
    }
    try {
      markets.append(message.account_id, message.subscription_id, message.symbol, message.samples)
    } catch (error) {
      logger.warn('Market samples rejected; requesting a fresh window', error)
      resubscribeMarket(message.subscription_id, demand)
    }
  }

  function handleMarketError(
    message: Extract<BrowserServerMessage, { kind: 'market_error' }>,
  ): void {
    const demand =
      message.request_id === null
        ? message.subscription_id === null
          ? undefined
          : marketSubscriptions.get(message.subscription_id)
        : marketRequests.get(message.request_id)
    if (message.request_id !== null) marketRequests.delete(message.request_id)
    if (message.subscription_id !== null) marketSubscriptions.delete(message.subscription_id)
    if (demand === undefined) return
    const reason = marketError(message.error)
    markets.fail(demand.accountId, demand.symbol, reason)
    if (message.error.kind === 'unavailable' && message.error.retryable) {
      scheduleMarketRetry(demand)
    }
  }

  function handleCommandResult(
    message: Extract<BrowserServerMessage, { kind: 'command_result' }>,
  ): void {
    const pending = pendingCommands.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingCommands.delete(message.request_id)
    updatePendingCounts()
    if (pending.accountId !== message.account_id) {
      pending.reject(new Error('command result account does not match its request'))
      return
    }
    pending.resolve(message.outcome)
  }

  function handleCommandPreviewResult(
    message: Extract<BrowserServerMessage, { kind: 'command_preview_result' }>,
  ): void {
    const pending = pendingPreviews.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingPreviews.delete(message.request_id)
    if (pending.accountId !== message.account_id) {
      pending.reject(new Error('planning result account does not match its request'))
      return
    }
    pending.resolve(message.outcome)
  }

  function handleReconciliationRefreshResult(
    message: Extract<BrowserServerMessage, { kind: 'reconciliation_refresh_result' }>,
  ): void {
    const pending = pendingReconciliationRefreshes.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingReconciliationRefreshes.delete(message.request_id)
    updatePendingCounts()
    if (pending.accountId !== message.account_id) {
      const error = new Error('reconciliation result account does not match its request')
      reconciliationRefreshByAccount.value[pending.accountId] = {
        requestId: message.request_id,
        cycleId: null,
        duplicate: false,
        error: error.message,
      }
      pending.reject(error)
      return
    }

    reconciliationRefreshByAccount.value[message.account_id] =
      message.outcome.kind === 'accepted'
        ? {
            requestId: message.request_id,
            cycleId: message.outcome.cycle_id,
            duplicate: message.outcome.duplicate,
            error: null,
          }
        : {
            requestId: message.request_id,
            cycleId: null,
            duplicate: false,
            error: message.outcome.rejection.reason,
          }
    pending.resolve(message.outcome)
  }

  function handleHistoryPage(
    message: Extract<BrowserServerMessage, { kind: 'command_history_page' }>,
  ): void {
    const pending = pendingHistories.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(message.request_id)
    updatePendingCounts()
    if (pending.kind !== 'modern' || pending.accountId !== message.account_id) {
      pending.reject(new Error('history response account does not match its request'))
      return
    }
    try {
      projections.mergeHistory(message.account_id, message.page)
      pending.resolve()
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  function handleLegacyHistoryPage(
    message: Extract<BrowserServerMessage, { kind: 'legacy_command_history_page' }>,
  ): void {
    const pending = pendingHistories.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(message.request_id)
    updatePendingCounts()
    if (pending.kind !== 'legacy' || pending.accountId !== message.account_id) {
      pending.reject(new Error('imported history response does not match its request'))
      return
    }
    try {
      projections.mergeLegacyHistory(message.account_id, message.page)
      pending.resolve()
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  function handleHistoryError(
    requestId: Uuid,
    error: BrowserHistoryError,
    kind: PendingHistory['kind'],
  ): void {
    const pending = pendingHistories.get(requestId)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(requestId)
    updatePendingCounts()
    if (pending.kind !== kind) {
      pending.reject(new Error('history error kind does not match its request'))
      return
    }
    pending.reject(new Error(historyError(error, kind)))
  }

  function switchSelectedAccount(): void {
    clearAllSubscriptionRetries()
    if (selectedSubscriptionId !== null) {
      const oldSubscription = selectedSubscriptionId
      selectedSubscriptionId = null
      send({ kind: 'unsubscribe_account', subscription_id: oldSubscription })
    }
    subscribeSelectedAccount()
  }

  function subscribeSelectedAccount(): void {
    const accountId = accounts.selectedAccountId
    if (status.value !== 'ready' || accountId === null) return
    if (
      selectedSubscriptionId !== null &&
      subscriptionAccounts.get(selectedSubscriptionId) === accountId
    ) {
      return
    }
    if (Array.from(subscriptionRequests.values()).includes(accountId)) return

    const requestId = uuid()
    subscriptionRequests.set(requestId, accountId)
    projections.beginSubscription(accountId)
    send({ kind: 'subscribe_account', request_id: requestId, account_id: accountId })
  }

  function resubscribe(accountId: Uuid, subscriptionId: Uuid): void {
    subscriptionAccounts.delete(subscriptionId)
    if (selectedSubscriptionId === subscriptionId) selectedSubscriptionId = null
    try {
      send({ kind: 'unsubscribe_account', subscription_id: subscriptionId })
    } catch {
      return
    }
    if (accounts.selectedAccountId === accountId) subscribeSelectedAccount()
  }

  function subscribeMarketDemand(demand: MarketDemand): void {
    if (status.value !== 'ready') return
    const key = marketKey(demand.accountId, demand.symbol)
    if (
      Array.from(marketRequests.values()).some(
        (current) => marketKey(current.accountId, current.symbol) === key,
      ) ||
      Array.from(marketSubscriptions.values()).some(
        (current) => marketKey(current.accountId, current.symbol) === key,
      )
    ) {
      return
    }
    const requestId = uuid()
    marketRequests.set(requestId, demand)
    markets.begin(demand.accountId, demand.symbol, requestId)
    try {
      send({
        kind: 'subscribe_market',
        request_id: requestId,
        account_id: demand.accountId,
        symbol: demand.symbol,
        limit: demand.limit,
      })
    } catch (error) {
      marketRequests.delete(requestId)
      markets.fail(demand.accountId, demand.symbol, 'gateway disconnected before subscription')
      logger.debug('Market subscribe raced a gateway disconnect', error)
      scheduleMarketRetry(demand)
    }
  }

  function subscribeMarketDemands(): void {
    for (const demand of marketDemands.values()) subscribeMarketDemand(demand)
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
    if (status.value !== 'ready' || !marketDemands.has(key) || marketRetryTimers.has(key)) return
    const attempt = marketRetryAttempts.get(key) ?? 0
    const delay =
      minimumDelay ??
      Math.min(SUBSCRIPTION_RETRY_INITIAL_MS * 2 ** Math.min(attempt, 5), SUBSCRIPTION_RETRY_MAX_MS)
    marketRetryAttempts.set(key, attempt + 1)
    const timer = window.setTimeout(() => {
      marketRetryTimers.delete(key)
      const current = marketDemands.get(key)
      if (current !== undefined) subscribeMarketDemand(current)
    }, delay)
    marketRetryTimers.set(key, timer)
  }

  function clearMarketRetry(key: string): void {
    const timer = marketRetryTimers.get(key)
    if (timer !== undefined) window.clearTimeout(timer)
    marketRetryTimers.delete(key)
    marketRetryAttempts.delete(key)
  }

  function clearAllMarketRetries(): void {
    for (const timer of marketRetryTimers.values()) window.clearTimeout(timer)
    marketRetryTimers.clear()
    marketRetryAttempts.clear()
  }

  function scheduleSubscriptionRetry(accountId: Uuid): void {
    if (
      status.value !== 'ready' ||
      accounts.selectedAccountId !== accountId ||
      subscriptionRetryTimers.has(accountId)
    ) {
      return
    }
    const attempt = subscriptionRetryAttempts.get(accountId) ?? 0
    const delay = Math.min(
      SUBSCRIPTION_RETRY_INITIAL_MS * 2 ** Math.min(attempt, 5),
      SUBSCRIPTION_RETRY_MAX_MS,
    )
    subscriptionRetryAttempts.set(accountId, attempt + 1)
    const timer = window.setTimeout(() => {
      subscriptionRetryTimers.delete(accountId)
      if (status.value === 'ready' && accounts.selectedAccountId === accountId) {
        subscribeSelectedAccount()
      }
    }, delay)
    subscriptionRetryTimers.set(accountId, timer)
  }

  function clearSubscriptionRetry(accountId: Uuid): void {
    const timer = subscriptionRetryTimers.get(accountId)
    if (timer !== undefined) window.clearTimeout(timer)
    subscriptionRetryTimers.delete(accountId)
    subscriptionRetryAttempts.delete(accountId)
  }

  function clearAllSubscriptionRetries(): void {
    for (const timer of subscriptionRetryTimers.values()) window.clearTimeout(timer)
    subscriptionRetryTimers.clear()
    subscriptionRetryAttempts.clear()
  }

  function send(message: BrowserClientMessage): void {
    client.send(message)
  }

  function resetSubscriptions(): void {
    clearAllSubscriptionRetries()
    clearAllMarketRetries()
    subscriptionRequests.clear()
    subscriptionAccounts.clear()
    marketRequests.clear()
    marketSubscriptions.clear()
    selectedSubscriptionId = null
  }

  function losePendingRequests(reason: string): void {
    for (const [requestId, pending] of pendingCommands) {
      window.clearTimeout(pending.timer)
      pending.reject(new CommandOutcomeUnknownError(requestId, reason))
    }
    pendingCommands.clear()
    for (const [requestId, pending] of pendingPreviews) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(`planning request ${requestId} interrupted: ${reason}`))
    }
    pendingPreviews.clear()
    for (const pending of pendingHistories.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(`history request interrupted: ${reason}`))
    }
    pendingHistories.clear()
    for (const [requestId, pending] of pendingReconciliationRefreshes) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(`reconciliation request ${requestId} interrupted: ${reason}`))
      reconciliationRefreshByAccount.value[pending.accountId] = {
        requestId,
        cycleId: null,
        duplicate: false,
        error: `request interrupted: ${reason}`,
      }
    }
    pendingReconciliationRefreshes.clear()
    updatePendingCounts()
  }

  function updatePendingCounts(): void {
    pendingCommandCount.value = pendingCommands.size
    pendingHistoryCount.value = pendingHistories.size
    pendingReconciliationCount.value = pendingReconciliationRefreshes.size
  }

  return {
    status,
    lastError,
    latencyMs,
    sessionValidUntil,
    pendingCommandCount,
    pendingHistoryCount,
    pendingReconciliationCount,
    reconciliationRefreshByAccount,
    isConnected,
    connect,
    disconnect,
    submitCommand,
    previewCommand,
    refreshReconciliation,
    requestOlderHistory,
    requestLegacyHistory,
    subscribeMarket,
    unsubscribeMarket,
  }
})

function subscriptionError(
  error: Extract<BrowserServerMessage, { kind: 'account_error' }>['error'],
): string {
  switch (error.kind) {
    case 'unauthorized':
      return 'account subscription is unauthorized'
    case 'unavailable':
    case 'resync_failed':
      return error.reason
  }
}

function historyError(error: BrowserHistoryError, kind: PendingHistory['kind']): string {
  const label = kind === 'legacy' ? 'imported command history' : 'command history'
  switch (error.kind) {
    case 'unauthorized':
      return `${label} is unauthorized`
    case 'invalid_request':
    case 'routing_changed':
    case 'unavailable':
      return error.reason
    case 'revision_changed':
      return `${label} revision changed from ${error.expected} to ${error.actual}`
  }
}

function marketError(
  error: Extract<BrowserServerMessage, { kind: 'market_error' }>['error'],
): string {
  switch (error.kind) {
    case 'unauthorized':
      return 'market subscription is unauthorized'
    case 'invalid_request':
    case 'unavailable':
      return error.reason
  }
}

function normalizeMarketDemand(accountId: Uuid, symbol: string, limit: number): MarketDemand {
  const normalized = symbol.trim().toUpperCase()
  if (normalized.length === 0) throw new Error('market symbol is required')
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_024) {
    throw new Error('market sample limit must be between 1 and 1024')
  }
  return { accountId, symbol: normalized, limit }
}

function uuid(): Uuid {
  return crypto.randomUUID()
}
