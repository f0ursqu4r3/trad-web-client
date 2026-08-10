<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import AccountsListPanel from '@/components/terminal/panels/LegacyAccountsListPanel.vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import {
  ExchangeType,
  NetworkType,
  type OrderThrottleSnapshotData,
  type SymbolLeverageSnapshotData,
} from '@/lib/ws/protocol'

type SmokePhase = 'idle' | 'connecting' | 'authenticating' | 'ready' | 'failed'

type SmokeState = {
  phase: SmokePhase
  accountId: string | null
  symbol: string
  leverageText: string | null
  throttle: OrderThrottleSnapshotData | null
  leverage: SymbolLeverageSnapshotData | null
  error: string | null
  events: string[]
}

const state = reactive<SmokeState>({
  phase: 'idle',
  accountId: null,
  symbol: 'DOGEUSDT',
  leverageText: null,
  throttle: null,
  leverage: null,
  error: null,
  events: [],
})

const accounts = useAccountsStore()
const ws = useWsStore()

function record(message: string) {
  state.events.push(`${new Date().toISOString()} ${message}`)
  if (state.events.length > 200) state.events.shift()
}

function snapshotState(): SmokeState {
  const marketContext = selectedMarketContext()
  if (marketContext) {
    state.throttle = ws.orderThrottleForMarketContext(marketContext)
    state.leverage = ws.symbolLeverageForMarketContext(marketContext)
    state.leverageText =
      state.leverage?.leverages
        .map((item) => `${item.symbol}:${item.long_leverage ?? '?'}:${item.short_leverage ?? '?'}`)
        .join('|') ?? null
  }
  return JSON.parse(JSON.stringify(state)) as SmokeState
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function seedAccount(accountId: string) {
  const label = param('label') || 'Bybit Live Account Panel'
  const account = {
    id: accountId,
    label,
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

const initialAccountId = param('accountId')
if (initialAccountId) {
  state.accountId = initialAccountId
  state.symbol = (param('symbol') || state.symbol).trim().toUpperCase()
  seedAccount(initialAccountId)
}

function selectedMarketContext() {
  const account = accounts.selectedAccount
  return account ? accounts.getMarketContextForAccount(account.id) : null
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function startSmoke() {
  try {
    state.error = null
    state.phase = 'connecting'

    const accountId = param('accountId')
    const token = param('token')
    const symbol = (param('symbol') || 'DOGEUSDT').trim().toUpperCase()
    if (!accountId) throw new Error('accountId is required')
    if (!token) throw new Error('token is required')
    state.accountId = accountId
    state.symbol = symbol

    seedAccount(accountId)
    ws.setInboundDebugEnabled(true)
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    record('websocket ready; sending Bybit live account-panel token login')
    ws.sendTokenLogin(token)
    await waitFor('token login', () => ws.authAccepted === true, 30_000)

    const marketContext = selectedMarketContext()
    if (!marketContext) throw new Error('selected market context missing')
    ws.requestMarketCapabilities(marketContext)
    ws.requestOrderThrottleSnapshot(marketContext)

    await waitFor(
      'throttle snapshot',
      () => {
        state.throttle = ws.orderThrottleForMarketContext(marketContext)
        return !!state.throttle
      },
      30_000,
    )
    state.phase = 'ready'
    record('live account panel authenticated')
  } catch (err) {
    state.phase = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    record(`failed: ${state.error}`)
  }
}

declare global {
  interface Window {
    __tradBybitLiveAccountPanel?: {
      start: () => Promise<void>
      getState: () => SmokeState
    }
  }
}

window.__tradBybitLiveAccountPanel = {
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
  <main class="live-account-shell" data-testid="bybit-live-account-panel">
    <aside class="panel-wrap" data-testid="accounts-panel">
      <AccountsListPanel />
    </aside>
    <section class="status-wrap">
      <h1>Bybit Live Account Panel</h1>
      <dl>
        <div>
          <dt>Phase</dt>
          <dd data-testid="smoke-phase">{{ state.phase }}</dd>
        </div>
        <div>
          <dt>Symbol</dt>
          <dd data-testid="smoke-symbol">{{ state.symbol }}</dd>
        </div>
        <div>
          <dt>Leverage</dt>
          <dd data-testid="smoke-leverage">{{ state.leverageText || '-' }}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd data-testid="smoke-error">{{ state.error || '-' }}</dd>
        </div>
      </dl>
      <button type="button" @click="startSmoke">Run</button>
      <pre>{{ state.events.join('\n') }}</pre>
    </section>
  </main>
</template>

<style scoped>
.live-account-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(520px, 1fr) minmax(280px, 420px);
  gap: 16px;
  padding: 16px;
  background: var(--color-bg);
  color: var(--color-text);
}

.panel-wrap,
.status-wrap {
  min-height: 520px;
}

.status-wrap {
  font-family: system-ui, sans-serif;
}

h1 {
  margin: 0 0 16px;
  font-size: 20px;
}

dl {
  display: grid;
  gap: 8px;
}

dl > div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
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
}
</style>
