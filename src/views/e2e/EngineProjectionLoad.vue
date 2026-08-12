<script setup lang="ts">
import { nextTick, onMounted, reactive } from 'vue'

import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import ProjectionDetails from '@/components/engine/ProjectionDetails.vue'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import {
  LOAD_ACCOUNT_ID,
  LOAD_SUBSCRIPTION_ID,
  loadDelta,
  loadSnapshot,
} from './engineProjectionLoadData'

interface LoadState {
  phase: 'idle' | 'running' | 'done' | 'failed'
  commands: number
  trailingEntries: number
  revisions: number
  strategyUpdates: number
  elapsedMs: number
  maxEventLoopLagMs: number
  error: string | null
}

const state = reactive<LoadState>({
  phase: 'idle',
  commands: 0,
  trailingEntries: 0,
  revisions: 0,
  strategyUpdates: 0,
  elapsedMs: 0,
  maxEventLoopLagMs: 0,
  error: null,
})

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()

async function run(): Promise<void> {
  const count = integerParameter('count', 500)
  const revisions = integerParameter('revisions', 64)
  state.phase = 'running'
  state.error = null

  try {
    accounts.accountsRaw = [
      {
        id: LOAD_ACCOUNT_ID,
        label: 'Engine Projection Load',
        key: 'fixture',
        network: NetworkType.Testnet,
        exchange: ExchangeType.Bifake,
      },
    ]
    accounts.selectedAccountId = LOAD_ACCOUNT_ID
    projections.install(
      LOAD_ACCOUNT_ID,
      LOAD_SUBSCRIPTION_ID,
      { kind: 'initial' },
      loadSnapshot(count),
    )
    await paint()

    const lag = startLagMonitor()
    const started = performance.now()
    for (let offset = 1; offset <= revisions; offset += 1) {
      projections.apply(LOAD_ACCOUNT_ID, LOAD_SUBSCRIPTION_ID, loadDelta(count, offset + 1))
      await paint()
    }
    state.elapsedMs = performance.now() - started
    state.maxEventLoopLagMs = lag.stop()
    state.commands = projections.selectedGraph?.commands.length ?? 0
    state.trailingEntries = projections.selectedGraph?.trailing_entries.length ?? 0
    state.revisions = revisions
    state.strategyUpdates = count * revisions
    state.phase = 'done'
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    state.phase = 'failed'
  }
}

function integerParameter(name: string, fallback: number): number {
  const raw = new URLSearchParams(window.location.search).get(name)
  if (raw === null) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be positive`)
  return value
}

async function paint(): Promise<void> {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function startLagMonitor(): { stop: () => number } {
  let maximum = 0
  let expected = performance.now() + 10
  const timer = window.setInterval(() => {
    const now = performance.now()
    maximum = Math.max(maximum, Math.max(0, now - expected))
    expected = now + 10
  }, 10)
  return {
    stop: () => {
      window.clearInterval(timer)
      return maximum
    },
  }
}

declare global {
  interface Window {
    __tradEngineProjectionLoad?: { getState: () => LoadState }
  }
}

window.__tradEngineProjectionLoad = {
  getState: () => JSON.parse(JSON.stringify(state)) as LoadState,
}

onMounted(() => void run())
</script>

<template>
  <main class="engine-load" data-testid="engine-projection-load">
    <OrdersColumn />
    <ProjectionDetails />
  </main>
</template>

<style scoped>
.engine-load {
  display: grid;
  width: 100vw;
  height: 100vh;
  grid-template-columns: minmax(480px, 44%) minmax(0, 1fr);
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-bg);
}
</style>
