<script setup lang="ts">
import { computed, onMounted, reactive, type Component } from 'vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore, type TrailingEntryState } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { bybitMarketContext } from '@/lib/marketContext'
import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import TrailingEntryView from '@/components/terminal/views/TrailingEntryView.vue'
import DeviceDetailsView from '@/components/terminal/views/DeviceDetailsView.vue'
import {
  CommandStatus,
  ExchangeType,
  NetworkType,
  PositionSide,
  TrailingEntryLifecycle,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

type WatchOnlyPhase =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'submitting'
  | 'inspecting'
  | 'holding'
  | 'cleanup'
  | 'done'
  | 'failed'

type SymbolPlan = {
  symbol: string
  price: number
  activation: number
  stopLoss: number
  takeProfit: number
}

type WatchOnlyState = {
  phase: WatchOnlyPhase
  accountId: string | null
  requested: number
  submitted: number
  accepted: number
  inspectedCommandId: string | null
  inspectedSymbol: string | null
  inspectedTeDeviceId: string | null
  cleanupRequested: number
  orderDeviceCount: number
  nativeProtectionCount: number
  error: string | null
  events: string[]
}

const state = reactive<WatchOnlyState>({
  phase: 'idle',
  accountId: null,
  requested: 0,
  submitted: 0,
  accepted: 0,
  inspectedCommandId: null,
  inspectedSymbol: null,
  inspectedTeDeviceId: null,
  cleanupRequested: 0,
  orderDeviceCount: 0,
  nativeProtectionCount: 0,
  error: null,
  events: [],
})

const ws = useWsStore()
const accounts = useAccountsStore()
const commands = useCommandStore()
const devices = useDeviceStore()

const componentMap: Record<string, Component> = {
  TrailingEntryOrder: TrailingEntryView,
}

const currentComponent = computed<Component>(() => {
  const selected = commands.selectedCommand
  if (!selected) return DeviceDetailsView
  return componentMap[selected.command.kind] || DeviceDetailsView
})

function record(message: string) {
  state.events.push(`${new Date().toISOString()} ${message}`)
  if (state.events.length > 300) state.events.shift()
}

function snapshotState(): WatchOnlyState {
  state.accepted = acceptedCommandIds().length
  refreshVisibleDeviceCounts()
  return JSON.parse(JSON.stringify(state)) as WatchOnlyState
}

function refreshVisibleDeviceCounts() {
  state.orderDeviceCount = devices.devices.filter((device) => device.kind === 'MarketOrder').length
  state.nativeProtectionCount = devices.devices.filter(
    (device) => device.kind === 'NativeProtection',
  ).length
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function numberParam(name: string, fallback: number): number {
  const raw = param(name)
  if (raw === null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return parsed
}

function fracParam(name: string, fallback: number): number {
  const raw = param(name)
  if (raw === null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be finite`)
  return parsed
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await wait(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function parseSymbolPrices(raw: string | null): Array<{ symbol: string; price: number }> {
  if (!raw) throw new Error('plans are required')
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [symbolRaw, priceRaw] = part.split(':')
      const symbol = (symbolRaw || '').trim().toUpperCase()
      const price = Number(priceRaw)
      if (!/^[A-Z0-9]+USDT$/.test(symbol)) throw new Error(`invalid symbol plan ${part}`)
      if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid price plan ${part}`)
      return { symbol, price }
    })
}

function buildPlans(): SymbolPlan[] {
  const activationFrac = fracParam('activationFrac', -0.4)
  const stopLossFrac = fracParam('stopLossFrac', 0.45)
  const takeProfitFrac = fracParam('takeProfitFrac', 0.02)
  if (!(activationFrac < 0 && activationFrac >= -0.5)) {
    throw new Error('activationFrac must be negative and >= -0.5')
  }
  if (stopLossFrac <= Math.abs(activationFrac)) {
    throw new Error('stopLossFrac must put stop loss below activation')
  }
  if (takeProfitFrac <= 0) throw new Error('takeProfitFrac must be positive')
  return parseSymbolPrices(param('plans')).map(({ symbol, price }) => {
    const activation = price * (1 + activationFrac)
    const stopLoss = price * (1 - stopLossFrac)
    const takeProfit = price * (1 + takeProfitFrac)
    if (!(stopLoss > 0 && activation > stopLoss && takeProfit > activation)) {
      throw new Error(`invalid watch-only levels for ${symbol}`)
    }
    return {
      symbol,
      price,
      activation: Number(activation.toPrecision(10)),
      stopLoss: Number(stopLoss.toPrecision(10)),
      takeProfit: Number(takeProfit.toPrecision(10)),
    }
  })
}

function seedAccount(accountId: string) {
  const account = {
    id: accountId,
    label: 'Bybit Live Watch Only',
    key: 'redacted',
    network: NetworkType.Mainnet,
    exchange: ExchangeType.Bybit,
    exchange_metadata: {
      product: 'usdt_perp',
      hedge_mode_only: true,
      account_mode: 'unified',
      margin_mode: 'regular_margin',
      unified_margin_status: 5,
    },
  } satisfies AccountRecord
  accounts.accountsRaw = [account]
  accounts.accountOrder = [accountId]
  accounts.selectedAccountId = accountId
  accounts.lastFetchedAt = Date.now()
}

function acceptedCommandIds(): string[] {
  return submittedCommandIds.filter((commandId) => {
    const item = commands.history.find((entry) => entry.command_id === commandId)
    return !!item && item.status !== CommandStatus.Failed && item.status !== CommandStatus.Malformed
  })
}

function commandFailed(commandId: string): string | null {
  const item = commands.history.find((entry) => entry.command_id === commandId)
  if (item?.status === CommandStatus.Failed || item?.status === CommandStatus.Malformed) {
    return `command ${commandId} ended with ${item.status}`
  }
  return null
}

function allSubmittedCommandsSucceeded(): boolean {
  return submittedCommandIds.every((commandId) => {
    const item = commands.history.find((entry) => entry.command_id === commandId)
    return item?.status === CommandStatus.Succeeded
  })
}

let submittedCommandIds: string[] = []

async function startSmoke() {
  try {
    state.error = null
    state.phase = 'connecting'
    state.cleanupRequested = 0
    submittedCommandIds = []

    const accountId = param('accountId')
    const token = param('token')
    const holdMs = numberParam('holdMs', 30_000)
    const risk = numberParam('risk', 10)
    const jumpFracThreshold = numberParam('jumpFracThreshold', 0.001)
    const plans = buildPlans()
    if (!accountId) throw new Error('accountId is required')
    if (!token) throw new Error('token is required')

    state.accountId = accountId
    state.requested = plans.length
    seedAccount(accountId)

    ws.setInboundDebugEnabled(true)
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    record('websocket ready; sending watch-only token login')
    ws.sendTokenLogin(token)
    await waitFor('token login', () => ws.authAccepted === true, 30_000)

    state.phase = 'submitting'
    for (const plan of plans) {
      const payload = {
        kind: 'TrailingEntryOrder',
        data: {
          position_side: PositionSide.Long,
          symbol: plan.symbol,
          activation_price: plan.activation,
          jump_frac_threshold: jumpFracThreshold,
          stop_loss: plan.stopLoss,
          take_profit: plan.takeProfit,
          risk_amount: risk,
          market_context: bybitMarketContext(accountId),
          split_settings: {
            target_child_notional: 1000,
            max_splits_cap: 1,
            mode: 'prefer_target',
            slippage_margin: 0.005,
          },
        },
      } satisfies UserCommandPayload
      const commandId = ws.sendUserCommand(payload)
      submittedCommandIds.push(commandId)
      state.submitted = submittedCommandIds.length
      record(`submitted watch-only TE ${commandId} ${plan.symbol}`)
    }

    await waitFor(
      'all watch-only commands accepted',
      () => acceptedCommandIds().length === submittedCommandIds.length,
      60_000,
    )
    state.accepted = acceptedCommandIds().length

    const failed = submittedCommandIds.map(commandFailed).find(Boolean)
    if (failed) throw new Error(failed)

    state.phase = 'inspecting'
    const inspectCommandId = submittedCommandIds[submittedCommandIds.length - 1]
    const inspectPlan = plans[plans.length - 1]
    state.inspectedCommandId = inspectCommandId
    state.inspectedSymbol = inspectPlan.symbol
    commands.inspectCommand(inspectCommandId)
    await waitFor(
      'inspected TE device',
      () =>
        devices.devices.some((device) => {
          if (device.associated_command_id !== inspectCommandId) return false
          if (device.kind !== 'TrailingEntry') return false
          const te = device.state as TrailingEntryState
          if (te.symbol !== inspectPlan.symbol) return false
          state.inspectedTeDeviceId = device.id
          return true
        }),
      30_000,
    )

    state.phase = 'holding'
    record(`holding ${plans.length} dormant TEs for ${holdMs}ms`)
    await wait(holdMs)
    refreshVisibleDeviceCounts()
    if (state.orderDeviceCount > 0 || state.nativeProtectionCount > 0) {
      throw new Error(
        `watch-only TE unexpectedly showed order/protection devices: orders=${state.orderDeviceCount} native=${state.nativeProtectionCount}`,
      )
    }

    state.phase = 'cleanup'
    for (const commandId of submittedCommandIds) {
      ws.sendCancelCommand(commandId)
      state.cleanupRequested += 1
    }
    record(`requested cleanup for ${state.cleanupRequested} watch-only TEs`)
    await waitFor('watch-only cancel completion', allSubmittedCommandsSucceeded, 120_000)

    state.phase = 'done'
    record('watch-only frontend smoke completed')
  } catch (err) {
    state.phase = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    record(`failed: ${state.error}`)
  }
}

declare global {
  interface Window {
    __tradBybitLiveWatchOnly?: {
      start: () => Promise<void>
      getState: () => WatchOnlyState
    }
  }
}

window.__tradBybitLiveWatchOnly = {
  start: startSmoke,
  getState: snapshotState,
}

onMounted(() => {
  if (param('autostart') === '1') {
    void startSmoke()
  }
})
</script>

<template>
  <main class="watch-shell" data-testid="bybit-live-watch-only">
    <SplitView storage-key="bybit-live-watch-only-shell">
      <template #left>
        <OrdersColumn />
      </template>
      <template #right>
        <component :is="currentComponent" />
      </template>
    </SplitView>
    <aside class="watch-status">
      <h1>Bybit Live Watch Only</h1>
      <dl>
        <div><dt>Phase</dt><dd data-testid="watch-phase">{{ state.phase }}</dd></div>
        <div><dt>Requested</dt><dd>{{ state.requested }}</dd></div>
        <div><dt>Accepted</dt><dd>{{ state.accepted }}</dd></div>
        <div><dt>Inspect</dt><dd>{{ state.inspectedSymbol || '-' }}</dd></div>
        <div><dt>Cleanup</dt><dd>{{ state.cleanupRequested }}</dd></div>
        <div><dt>Error</dt><dd data-testid="watch-error">{{ state.error || '-' }}</dd></div>
      </dl>
      <button type="button" @click="startSmoke">Run</button>
      <pre>{{ state.events.join('\n') }}</pre>
    </aside>
  </main>
</template>

<style scoped>
.watch-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(900px, 1fr) minmax(280px, 360px);
  gap: 12px;
  padding: 12px;
  background: var(--color-bg);
  color: var(--color-text);
}

.watch-status {
  min-height: 100%;
  font-family: system-ui, sans-serif;
  border-left: 1px solid var(--color-border);
  padding-left: 12px;
}

h1 {
  margin: 0 0 12px;
  font-size: 18px;
}

dl {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
}

dt {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

dd {
  margin: 0;
  font-family: monospace;
  overflow-wrap: anywhere;
}

button {
  margin-bottom: 12px;
}

pre {
  max-height: 50vh;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 11px;
}
</style>
