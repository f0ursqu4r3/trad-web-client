import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  GatewayWebSocketClient,
  type BrowserClientMessage,
  type BrowserCommandIntent,
  type BrowserCommandOutcome,
  type BrowserHistoryError,
  type BrowserServerMessage,
  type GatewayConnectionStatus,
  type Uuid,
} from '@/lib/gateway'
import { getWebSocketToken } from '@/lib/auth'
import { createLogger } from '@/lib/utils'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'

const logger = createLogger('gateway')
const COMMAND_RESULT_TIMEOUT_MS = 30_000
const HISTORY_RESULT_TIMEOUT_MS = 30_000

interface PendingCommand {
  accountId: Uuid
  timer: number
  resolve: (outcome: BrowserCommandOutcome) => void
  reject: (error: Error) => void
}

interface PendingHistory {
  accountId: Uuid
  timer: number
  resolve: () => void
  reject: (error: Error) => void
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
  const status = ref<GatewayConnectionStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const sessionValidUntil = ref<number | null>(null)
  const pendingCommandCount = ref(0)
  const pendingHistoryCount = ref(0)

  const subscriptionRequests = new Map<Uuid, Uuid>()
  const subscriptionAccounts = new Map<Uuid, Uuid>()
  const pendingCommands = new Map<Uuid, PendingCommand>()
  const pendingHistories = new Map<Uuid, PendingHistory>()
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
      losePendingRequests(error ?? 'gateway connection interrupted')
      resetSubscriptions()
    }
  })
  client.setReadyHandler((validForMs) => {
    sessionValidUntil.value = Date.now() + validForMs
    resetSubscriptions()
    subscribeSelectedAccount()
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
      pendingHistories.set(requestId, { accountId, timer, resolve, reject })
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
      case 'command_result':
        handleCommandResult(message)
        return
      case 'command_history_page':
        handleHistoryPage(message)
        return
      case 'command_history_error':
        handleHistoryError(message.request_id, message.error)
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
  }

  function handleUnsubscribed(subscriptionId: Uuid): void {
    const accountId = subscriptionAccounts.get(subscriptionId)
    subscriptionAccounts.delete(subscriptionId)
    projections.clearSubscription(subscriptionId)
    if (selectedSubscriptionId === subscriptionId) selectedSubscriptionId = null
    if (accountId === accounts.selectedAccountId) subscribeSelectedAccount()
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

  function handleHistoryPage(
    message: Extract<BrowserServerMessage, { kind: 'command_history_page' }>,
  ): void {
    const pending = pendingHistories.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(message.request_id)
    updatePendingCounts()
    if (pending.accountId !== message.account_id) {
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

  function handleHistoryError(requestId: Uuid, error: BrowserHistoryError): void {
    const pending = pendingHistories.get(requestId)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(requestId)
    updatePendingCounts()
    pending.reject(new Error(historyError(error)))
  }

  function switchSelectedAccount(): void {
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

  function send(message: BrowserClientMessage): void {
    client.send(message)
  }

  function resetSubscriptions(): void {
    subscriptionRequests.clear()
    subscriptionAccounts.clear()
    selectedSubscriptionId = null
  }

  function losePendingRequests(reason: string): void {
    for (const [requestId, pending] of pendingCommands) {
      window.clearTimeout(pending.timer)
      pending.reject(new CommandOutcomeUnknownError(requestId, reason))
    }
    pendingCommands.clear()
    for (const pending of pendingHistories.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(`history request interrupted: ${reason}`))
    }
    pendingHistories.clear()
    updatePendingCounts()
  }

  function updatePendingCounts(): void {
    pendingCommandCount.value = pendingCommands.size
    pendingHistoryCount.value = pendingHistories.size
  }

  return {
    status,
    lastError,
    latencyMs,
    sessionValidUntil,
    pendingCommandCount,
    pendingHistoryCount,
    isConnected,
    connect,
    disconnect,
    submitCommand,
    requestOlderHistory,
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

function historyError(error: BrowserHistoryError): string {
  switch (error.kind) {
    case 'unauthorized':
      return 'command history is unauthorized'
    case 'invalid_request':
    case 'routing_changed':
    case 'unavailable':
      return error.reason
    case 'revision_changed':
      return `command history revision changed from ${error.expected} to ${error.actual}`
  }
}

function uuid(): Uuid {
  return crypto.randomUUID()
}
