<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import DeviceDetailsPanel from '@/components/terminal/panels/DeviceDetailsPanel.vue'
import DeviceTreePanel from '@/components/terminal/panels/DeviceTreePanel.vue'
import { bybitMarketContext } from '@/lib/marketContext'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import {
  type Device,
  type MarketOrderState,
  type NativeProtectionState,
  useDeviceStore,
} from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  MarketOrderStatus,
  NativeProtectionStatus,
  NetworkType,
  PositionSide,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

type SmokePhase =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'submitting'
  | 'waiting-open'
  | 'waiting-protection'
  | 'waiting-fill'
  | 'cleanup'
  | 'done'
  | 'failed'

type TriggerSide = 'tp' | 'sl'

type SmokeState = {
  phase: SmokePhase
  accountId: string | null
  symbol: string
  price: number | null
  trigger: TriggerSide
  takeProfit: number | null
  stopLoss: number | null
  quantityUsd: number
  commandId: string | null
  cleanupCommandId: string | null
  openDeviceId: string | null
  nativeProtectionDeviceId: string | null
  nativeProtectionStatus: string | null
  protectionFilledQty: number | null
  lastOrderReason: string | null
  parentOrderLinkId: string | null
  error: string | null
  events: string[]
}

const state = reactive<SmokeState>({
  phase: 'idle',
  accountId: null,
  symbol: 'ADAUSDT',
  price: null,
  trigger: 'sl',
  takeProfit: null,
  stopLoss: null,
  quantityUsd: 6.5,
  commandId: null,
  cleanupCommandId: null,
  openDeviceId: null,
  nativeProtectionDeviceId: null,
  nativeProtectionStatus: null,
  protectionFilledQty: null,
  lastOrderReason: null,
  parentOrderLinkId: null,
  error: null,
  events: [],
})

const ws = useWsStore()
const accounts = useAccountsStore()
const commands = useCommandStore()
const devices = useDeviceStore()
commands.setAutoInspectNewCommands(false)
onBeforeUnmount(() => commands.setAutoInspectNewCommands(true))

function record(message: string) {
  state.events.push(`${new Date().toISOString()} ${message}`)
  if (state.events.length > 300) state.events.shift()
}

function snapshotState(): SmokeState {
  refreshNativeProtectionFields()
  return JSON.parse(JSON.stringify(state)) as SmokeState
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function numberParam(name: string, fallback?: number): number {
  const raw = param(name)
  if (raw === null || raw.trim() === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`${name} is required`)
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return parsed
}

function triggerParam(): TriggerSide {
  const raw = (param('trigger') || 'sl').trim().toLowerCase()
  if (raw !== 'tp' && raw !== 'sl') throw new Error('trigger must be tp or sl')
  return raw
}

function roundUp(value: number, tick: number): number {
  return Math.ceil(value / tick) * tick
}

function roundDown(value: number, tick: number): number {
  return Math.floor(value / tick) * tick
}

function roundPrice(value: number, tick: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(tick)) + 2)
  return Number(value.toFixed(decimals))
}

function buildAttachedLevels(
  price: number,
  trigger: TriggerSide,
  tick: number,
  triggerFrac: number,
  farExitFrac: number,
) {
  const takeProfit =
    trigger === 'tp'
      ? roundPrice(roundUp(price * (1 + triggerFrac), tick), tick)
      : roundPrice(roundUp(price * (1 + farExitFrac), tick), tick)
  const stopLoss =
    trigger === 'sl'
      ? roundPrice(roundDown(price * (1 - triggerFrac), tick), tick)
      : roundPrice(roundDown(price * (1 - farExitFrac), tick), tick)
  if (!(stopLoss > 0 && stopLoss < price && takeProfit > price)) {
    throw new Error(`invalid attached levels price=${price} tp=${takeProfit} sl=${stopLoss}`)
  }
  return { takeProfit, stopLoss }
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

function seedAccount(accountId: string) {
  const account = {
    id: accountId,
    label: 'Bybit Live Native TP/SL',
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
}

function findMarketOrder(commandId: string | null, action: MarketAction): Device | null {
  if (!commandId) return null
  return (
    devices.devices.find((device) => {
      if (device.associated_command_id !== commandId) return false
      if (device.kind !== 'MarketOrder') return false
      const mo = device.state as MarketOrderState
      return mo.market_action === action && mo.status === MarketOrderStatus.Filled
    }) ?? null
  )
}

function findNativeProtection(commandId: string | null): Device | null {
  if (!commandId) return null
  return (
    devices.devices.find(
      (device) => device.associated_command_id === commandId && device.kind === 'NativeProtection',
    ) ?? null
  )
}

function refreshNativeProtectionFields(): NativeProtectionState | null {
  const device = findNativeProtection(state.commandId)
  if (!device) return null
  const np = device.state as NativeProtectionState
  state.nativeProtectionDeviceId = device.id
  state.nativeProtectionStatus = np.status
  state.protectionFilledQty = np.protection_filled_qty
  state.lastOrderReason = np.last_order_reason
  return np
}

function throwIfCommandFailed(commandId: string | null) {
  if (!commandId) return
  const command = commands.history.find((item) => item.command_id === commandId)
  if (command?.status === CommandStatus.Failed || command?.status === CommandStatus.Malformed) {
    throw new Error(`command ${commandId} ended with ${command.status}`)
  }
  const failedDevice = devices.devices.find(
    (device) => device.associated_command_id === commandId && device.failed,
  )
  if (failedDevice) {
    throw new Error(
      `device ${failedDevice.id} failed: ${failedDevice.failure_reason || 'unknown failure'}`,
    )
  }
}

async function cleanupPosition(symbol: string, accountId: string, quantityUsd: number) {
  state.phase = 'cleanup'
  state.cleanupCommandId = ws.sendUserCommand({
    kind: 'MarketOrder',
    data: {
      action: MarketAction.Close,
      symbol,
      quantity_usd: Math.max(quantityUsd * 2, quantityUsd + 5),
      position_side: PositionSide.Long,
      market_context: bybitMarketContext(accountId),
      attached_exit_plan: null,
    },
  } satisfies Extract<UserCommandPayload, { kind: 'MarketOrder' }>)
  record(`submitted cleanup close ${state.cleanupCommandId}`)
  await waitFor(
    'cleanup close fill',
    () => !!findMarketOrder(state.cleanupCommandId, MarketAction.Close),
    60_000,
  )
  record('cleanup close filled')
}

async function startSmoke() {
  try {
    state.error = null
    state.phase = 'connecting'

    const accountId = param('accountId')
    const token = param('token')
    const symbol = (param('symbol') || 'ADAUSDT').trim().toUpperCase()
    const price = numberParam('price')
    const quantityUsd = numberParam('quantityUsd', 6.5)
    const trigger = triggerParam()
    const tick = numberParam('tick', 0.0001)
    const triggerFrac = numberParam('triggerFrac', 0.0006)
    const farExitFrac = numberParam('farExitFrac', 0.02)
    const fillWaitMs = numberParam('fillWaitMs', 180_000)
    if (!accountId) throw new Error('accountId is required')
    if (!token) throw new Error('token is required')

    state.accountId = accountId
    state.symbol = symbol
    state.price = price
    state.trigger = trigger
    state.quantityUsd = quantityUsd
    const levels = buildAttachedLevels(price, trigger, tick, triggerFrac, farExitFrac)
    state.takeProfit = levels.takeProfit
    state.stopLoss = levels.stopLoss
    seedAccount(accountId)

    ws.setInboundDebugEnabled(true)
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    record('websocket ready; sending native TP/SL token login')
    ws.sendTokenLogin(token)
    await waitFor('token login', () => ws.authAccepted === true, 30_000)
    await sleep(500)
    await waitFor('websocket still ready after token login', () => ws.status === 'ready', 5_000)

    state.phase = 'submitting'
    const payload = {
      kind: 'MarketOrder',
      data: {
        action: MarketAction.Open,
        symbol,
        quantity_usd: quantityUsd,
        position_side: PositionSide.Long,
        market_context: bybitMarketContext(accountId),
        attached_exit_plan: {
          take_profit: levels.takeProfit,
          stop_loss: levels.stopLoss,
        },
      },
    } satisfies Extract<UserCommandPayload, { kind: 'MarketOrder' }>
    state.commandId = ws.sendUserCommand(payload)
    record(
      `submitted attached MarketOrder ${state.commandId} tp=${levels.takeProfit} sl=${levels.stopLoss}`,
    )
    const submittedCommandId = state.commandId

    await waitFor(
      'MarketOrder command acknowledgement',
      () => commands.commandStatus(submittedCommandId) !== null,
      15_000,
    )
    commands.inspectCommand(submittedCommandId)

    state.phase = 'waiting-open'
    await waitFor(
      'open MarketOrder fill',
      () => {
        throwIfCommandFailed(state.commandId)
        return !!findMarketOrder(state.commandId, MarketAction.Open)
      },
      60_000,
    )
    const open = findMarketOrder(state.commandId, MarketAction.Open)
    if (!open) throw new Error('open MarketOrder missing after fill wait')
    const openState = open.state as MarketOrderState
    state.openDeviceId = open.id
    state.parentOrderLinkId = openState.client_order_id
    record(`open filled device=${open.id} parent=${state.parentOrderLinkId || '-'}`)

    state.phase = 'waiting-protection'
    await waitFor(
      'NativeProtection device',
      () => {
        throwIfCommandFailed(state.commandId)
        return !!refreshNativeProtectionFields()
      },
      20_000,
    )
    if (state.nativeProtectionDeviceId) devices.inspectDevice(state.nativeProtectionDeviceId)
    record(`native protection observed device=${state.nativeProtectionDeviceId}`)

    state.phase = 'waiting-fill'
    try {
      await waitFor(
        'NativeProtection exchange fill',
        () => {
          throwIfCommandFailed(state.commandId)
          const np = refreshNativeProtectionFields()
          return (
            !!np &&
            np.status === NativeProtectionStatus.Flat &&
            np.protection_filled_qty > 0 &&
            (np.last_order_reason || '').toLowerCase().includes('exchange') &&
            (np.last_order_reason || '').toLowerCase().includes('filled')
          )
        },
        fillWaitMs,
      )
    } catch (err) {
      record(`native fill wait failed, starting cleanup: ${err instanceof Error ? err.message : err}`)
      await cleanupPosition(symbol, accountId, quantityUsd)
      throw err
    }

    const np = refreshNativeProtectionFields()
    if (!np || !state.nativeProtectionDeviceId) throw new Error('NativeProtection disappeared')
    devices.inspectDevice(state.nativeProtectionDeviceId)
    state.phase = 'done'
    record(
      `native protection flat qty=${np.protection_filled_qty} reason=${np.last_order_reason || '-'}`,
    )
  } catch (err) {
    state.phase = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    record(`failed: ${state.error}`)
  }
}

declare global {
  interface Window {
    __tradBybitLiveNativeTpslFill?: {
      start: () => Promise<void>
      getState: () => SmokeState
    }
  }
}

window.__tradBybitLiveNativeTpslFill = {
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
  <main class="native-shell" data-testid="bybit-live-native-tpsl-fill">
    <section class="tree-wrap">
      <DeviceTreePanel />
    </section>
    <section class="details-wrap">
      <DeviceDetailsPanel />
    </section>
    <section class="status-wrap">
      <h1>Bybit Native TP/SL Fill</h1>
      <dl>
        <div><dt>Phase</dt><dd data-testid="smoke-phase">{{ state.phase }}</dd></div>
        <div><dt>Symbol</dt><dd>{{ state.symbol }}</dd></div>
        <div><dt>Trigger</dt><dd>{{ state.trigger }}</dd></div>
        <div><dt>TP</dt><dd>{{ state.takeProfit ?? '-' }}</dd></div>
        <div><dt>SL</dt><dd>{{ state.stopLoss ?? '-' }}</dd></div>
        <div><dt>Command</dt><dd>{{ state.commandId || '-' }}</dd></div>
        <div><dt>NP</dt><dd>{{ state.nativeProtectionDeviceId || '-' }}</dd></div>
        <div><dt>Reason</dt><dd data-testid="last-order-reason">{{ state.lastOrderReason || '-' }}</dd></div>
        <div><dt>Error</dt><dd data-testid="smoke-error">{{ state.error || '-' }}</dd></div>
      </dl>
      <button type="button" @click="startSmoke">Run</button>
      <pre>{{ state.events.join('\n') }}</pre>
    </section>
  </main>
</template>

<style scoped>
.native-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.1fr) minmax(300px, 420px);
  gap: 12px;
  padding: 12px;
  background: var(--color-bg);
  color: var(--color-text);
}

.tree-wrap,
.details-wrap,
.status-wrap {
  min-height: 620px;
  min-width: 0;
  border: 1px solid var(--border-color);
}

.status-wrap {
  padding: 12px;
  font-family: system-ui, sans-serif;
  overflow: auto;
}

h1 {
  margin: 0 0 16px;
  font-size: 18px;
}

dl {
  display: grid;
  gap: 8px;
}

dl > div {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px;
}

dt {
  color: var(--color-text-muted);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

button {
  margin-top: 16px;
}

pre {
  margin-top: 16px;
  white-space: pre-wrap;
  font-size: 11px;
}
</style>
