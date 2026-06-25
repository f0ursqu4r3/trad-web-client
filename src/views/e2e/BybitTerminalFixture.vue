<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import CommandPanel from '@/components/terminal/panels/CommandPanel.vue'
import DeviceTreePanel from '@/components/terminal/panels/DeviceTreePanel.vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore } from '@/stores/devices'
import { bybitProtocolFixtures } from '@/lib/bybitProtocolFixtures'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  MarketOrderStatus,
  NetworkType,
  OrderSide,
  PositionSide,
  type CommandHistoryItem,
  type DeviceSnapshotLiteData,
  type MarketContext,
  type MarketProduct,
  type MarketRef,
} from '@/lib/ws/protocol'

const commandPanelRef = ref<InstanceType<typeof CommandPanel> | null>(null)

const binanceAccountId = '11111111-1111-4111-8111-111111111111'
const binanceCommandId = '22222222-2222-4222-8222-222222222222'
const binanceDeviceId = '33333333-3333-4333-8333-333333333333'
const binanceContext = {
  binance: { account_id: binanceAccountId },
} satisfies MarketContext
const binanceMarketRef = {
  exchange: ExchangeType.Binance,
  network: NetworkType.Testnet,
  product: 'usdt_perp' satisfies MarketProduct,
  trading_account_id: binanceAccountId,
  trading_account_label: 'Binance QA',
  symbol: 'ETHUSDT',
} satisfies MarketRef

const accounts = [
  {
    id: bybitProtocolFixtures.bybitAccountId,
    label: 'Bybit QA',
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
  },
  {
    id: binanceAccountId,
    label: 'Binance QA',
    key: 'redacted',
    network: NetworkType.Testnet,
    exchange: ExchangeType.Binance,
  },
] satisfies AccountRecord[]

const binanceCommand = {
  command_id: binanceCommandId,
  command: {
    kind: 'MarketOrder',
    data: {
      action: MarketAction.Open,
      symbol: 'ETHUSDT',
      quantity_usd: 125,
      position_side: PositionSide.Long,
      market_context: binanceContext,
    },
  },
  market_ref: binanceMarketRef,
  status: CommandStatus.Succeeded,
  created_at: '2026-06-19T00:01:00.000Z',
} satisfies CommandHistoryItem

const binanceMarketOrderDevice = {
  device_id: binanceDeviceId,
  owner_user_id: '44444444-4444-4444-8444-444444444444',
  associated_command_id: binanceCommandId,
  market_ref: binanceMarketRef,
  protection_state: null,
  parent_device: null,
  children_devices: null,
  created_at: '2026-06-19T00:01:00.000Z',
  complete: true,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: null,
  snapshot: {
    kind: 'MarketOrder',
    data: {
      market_context: binanceContext,
      market_action: MarketAction.Open,
      symbol: 'ETHUSDT',
      order_side: OrderSide.Buy,
      quantity: 0.04,
      position_side: PositionSide.Long,
      price: 3125,
      throttle: false,
      status: MarketOrderStatus.Filled,
      filled_qty: 0.04,
      remote_id: 123456789,
      remote_order_id: null,
      client_order_id: 'binance-entry-1',
      sent_at: '2026-06-19T00:01:00.000Z',
      last_status_check_at: '2026-06-19T00:01:01.000Z',
      last_update_seen_at: '2026-06-19T00:01:01.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

onMounted(async () => {
  const accountStore = useAccountsStore()
  const commandStore = useCommandStore()
  const deviceStore = useDeviceStore()

  accountStore.accountsRaw = accounts
  accountStore.accountOrder = accounts.map((account) => account.id)
  accountStore.selectedAccountId = bybitProtocolFixtures.bybitAccountId

  commandStore.history = [binanceCommand, bybitProtocolFixtures.bybitCommandHistoryItem]
  commandStore.commandFilters = {
    kind: [],
    status: [],
    position: [],
    exchange: [],
    product: [],
    account: [],
    symbol: [],
    timeRange: 'Any',
    solo: {
      kind: false,
      status: false,
      position: false,
      exchange: false,
      product: false,
      account: false,
      symbol: false,
    },
  }
  commandStore.commandMeta = {
    [binanceCommandId]: {
      nickname: 'Binance ETH legacy',
      nicknameColor: null,
      pinned: false,
    },
    [bybitProtocolFixtures.bybitCommandHistoryItem.command_id]: {
      nickname: 'Bybit BTC native TP/SL',
      nicknameColor: null,
      pinned: false,
    },
  }

  deviceStore.clearDevices()
  deviceStore.handleDeviceSnapshotLite(binanceMarketOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitProtocolFixtures.bybitDeviceSnapshotLite)

  await nextTick()
  commandPanelRef.value?.toggleFilters()
})
</script>

<template>
  <main class="e2e-shell">
    <section class="e2e-panel" data-testid="command-panel" aria-label="Command History">
      <CommandPanel ref="commandPanelRef" />
    </section>

    <section class="e2e-panel" data-testid="device-tree-panel" aria-label="Device Tree">
      <DeviceTreePanel />
    </section>
  </main>
</template>

<style scoped>
.e2e-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
  gap: 12px;
  padding: 12px;
  background: var(--color-bg);
  color: var(--color-text);
}

.e2e-panel {
  min-height: 0;
  height: calc(100vh - 24px);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--color-panel);
}
</style>
