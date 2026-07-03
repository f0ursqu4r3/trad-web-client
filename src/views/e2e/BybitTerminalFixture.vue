<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import AccountsListPanel from '@/components/terminal/panels/AccountsListPanel.vue'
import CommandPanel from '@/components/terminal/panels/CommandPanel.vue'
import DeviceDetailsPanel from '@/components/terminal/panels/DeviceDetailsPanel.vue'
import DeviceTreePanel from '@/components/terminal/panels/DeviceTreePanel.vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { bybitProtocolFixtures } from '@/lib/bybitProtocolFixtures'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  MarketOrderStatus,
  NativeProtectionStatus,
  NetworkType,
  OrderSide,
  PositionSide,
  ProtectionLifecycle,
  ProtectionStrategy,
  TrailingEntryLifecycle,
  TrailingEntryPhase,
  type CommandHistoryItem,
  type DeviceSnapshotLiteData,
  type MarketContext,
  type MarketProduct,
  type MarketRef,
} from '@/lib/ws/protocol'

const commandPanelRef = ref<InstanceType<typeof CommandPanel> | null>(null)
const accountStore = useAccountsStore()
const wsStore = useWsStore()

const binanceAccountId = '11111111-1111-4111-8111-111111111111'
const binanceCommandId = '22222222-2222-4222-8222-222222222222'
const binanceDeviceId = '33333333-3333-4333-8333-333333333333'
const bybitRejectedCommandId = '77777777-7777-4777-8777-777777777777'
const bybitRejectedDeviceId = '88888888-8888-4888-8888-888888888888'
const bybitMissedCommandId = '12121212-1212-4212-8212-121212121212'
const bybitMissedTeDeviceId = '13131313-1313-4313-8313-131313131313'
const bybitMissedMoDeviceId = '14141414-1414-4414-8414-141414141414'
const bybitMissingProtectionDeviceId = '16161616-1616-4616-8616-161616161616'
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

accountStore.accountsRaw = accounts
accountStore.accountOrder = accounts.map((account) => account.id)
accountStore.selectedAccountId = bybitProtocolFixtures.bybitAccountId
accountStore.lastFetchedAt = Date.now()
wsStore.applyOrderThrottleSnapshot({
  request_uuid: '55555555-5555-4555-8555-555555555555',
  market_context: bybitProtocolFixtures.bybitContext,
  total_queued: 20,
  total_in_flight: 5,
  enqueued_total: 42,
  started_total: 17,
  completed_total: 12,
  canceled_total: 3,
  errored_total: 2,
  stale_rejected_total: 1,
  rate_limit_rejected_total: 4,
  delayed_by_limiter_total: 16,
  bybit_rate_limit: {
    method: 'POST',
    path: '/v5/order/create',
    limit: '10',
    remaining: '0',
    reset_timestamp_ms: '1781827201000',
    reset_in_ms: 2500,
    exhausted: true,
    observed_at_unix_ms: Date.now() - 1500,
  },
  min_interval_ms: 200,
  max_in_flight_per_account: 5,
  accounts: [
    {
      account_id: bybitProtocolFixtures.bybitAccountId,
      queued: 20,
      in_flight: 5,
      oldest_queued_age_ms: 8_500,
      estimated_drain_ms: 4_000,
    },
  ],
})
wsStore.applySymbolLeverageSnapshot({
  request_uuid: '66666666-6666-4666-8666-666666666666',
  market_context: bybitProtocolFixtures.bybitContext,
  leverages: [
    {
      symbol: 'DOGEUSDT',
      long_leverage: 2,
      short_leverage: 3,
    },
    {
      symbol: 'ETHUSDT',
      long_leverage: null,
      short_leverage: 1,
    },
  ],
  unavailable_symbols: ['MISSINGUSDT'],
})

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

const bybitRejectedCommand = {
  command_id: bybitRejectedCommandId,
  command: {
    kind: 'MarketOrder',
    data: {
      action: MarketAction.Open,
      symbol: 'ADAUSDT',
      quantity_usd: 50,
      position_side: PositionSide.Long,
      market_context: bybitProtocolFixtures.bybitContext,
      attached_exit_plan: {
        take_profit: 0.7,
        stop_loss: 0.5,
      },
    },
  },
  market_ref: {
    ...bybitProtocolFixtures.bybitMarketRef,
    symbol: 'ADAUSDT',
  },
  status: CommandStatus.Failed,
  created_at: '2026-06-19T00:02:00.000Z',
} satisfies CommandHistoryItem

const bybitMissedCommand = {
  command_id: bybitMissedCommandId,
  command: {
    kind: 'TrailingEntryOrder',
    data: {
      position_side: PositionSide.Long,
      symbol: 'BTCUSDT',
      activation_price: 65_000,
      jump_frac_threshold: 0.001,
      stop_loss: 62_000,
      take_profit: 68_000,
      risk_amount: 25,
      market_context: bybitProtocolFixtures.bybitContext,
      split_settings: {
        target_child_notional: 25,
        max_splits_cap: 4,
        mode: 'prefer_target',
        slippage_margin: 0.001,
      },
    },
  },
  market_ref: bybitProtocolFixtures.bybitMarketRef,
  status: CommandStatus.Running,
  created_at: '2026-06-19T00:03:00.000Z',
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

const bybitRejectedMarketOrderDevice = {
  device_id: bybitRejectedDeviceId,
  owner_user_id: '99999999-9999-4999-8999-999999999999',
  associated_command_id: bybitRejectedCommandId,
  market_ref: {
    ...bybitProtocolFixtures.bybitMarketRef,
    symbol: 'ADAUSDT',
  },
  protection_state: null,
  parent_device: null,
  children_devices: null,
  created_at: '2026-06-19T00:02:00.000Z',
  complete: true,
  failed: true,
  canceled: false,
  awaiting_children: false,
  failure_reason:
    'Bybit rejected market order before opening a position: retCode=110007 retMsg=ab not enough for new order symbol=ADAUSDT orderLinkId=mo-rejected. No position was established by this order.',
  snapshot: {
    kind: 'MarketOrder',
    data: {
      market_context: bybitProtocolFixtures.bybitContext,
      market_action: MarketAction.Open,
      symbol: 'ADAUSDT',
      order_side: OrderSide.Buy,
      quantity: 100,
      position_side: PositionSide.Long,
      price: 0,
      throttle: false,
      status: MarketOrderStatus.Rejected,
      filled_qty: null,
      remote_id: null,
      remote_order_id: null,
      client_order_id: 'mo-rejected',
      sent_at: null,
      last_status_check_at: null,
      last_update_seen_at: null,
    },
  },
} satisfies DeviceSnapshotLiteData

const bybitMissedTrailingEntryDevice = {
  device_id: bybitMissedTeDeviceId,
  owner_user_id: '15151515-1515-4515-8515-151515151515',
  associated_command_id: bybitMissedCommandId,
  market_ref: bybitProtocolFixtures.bybitMarketRef,
  protection_state: null,
  parent_device: null,
  children_devices: [bybitMissedMoDeviceId],
  created_at: '2026-06-19T00:03:00.000Z',
  complete: false,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: 'Missed entry: queued open orders became stale before submit',
  snapshot: {
    kind: 'TrailingEntry',
    data: {
      symbol: 'BTCUSDT',
      market_context: bybitProtocolFixtures.bybitContext,
      position_side: PositionSide.Long,
      activation_price: 65_000,
      jump_frac_threshold: 0.001,
      stop_loss: 62_000,
      take_profit: 68_000,
      risk_amount: 25,
      split_settings: {
        target_child_notional: 25,
        max_splits_cap: 4,
        mode: 'prefer_target',
        slippage_margin: 0.001,
      },
      phase: TrailingEntryPhase.Initial,
      peak: 0,
      peak_index: 0,
      position_size: 0,
      actual_activation_price: 0,
      buy_or_sell_price: 0,
      completed: false,
      cancelled: false,
      succeeded: false,
      stop_loss_hit: false,
      base_index: 0,
      total_points: 0,
      start_trigger_index: null,
      end_trigger_index: null,
      lifecycle: TrailingEntryLifecycle.MissedEntryPaused,
      stats: {
        open_filled_qty: 0,
        close_filled_qty: 0,
        open_filled_notional: 0,
        close_filled_notional: 0,
        dust_threshold: 0.001,
      },
    },
  },
} satisfies DeviceSnapshotLiteData

const bybitMissedMarketOrderDevice = {
  device_id: bybitMissedMoDeviceId,
  owner_user_id: '15151515-1515-4515-8515-151515151515',
  associated_command_id: bybitMissedCommandId,
  market_ref: bybitProtocolFixtures.bybitMarketRef,
  protection_state: null,
  parent_device: bybitMissedTeDeviceId,
  children_devices: null,
  created_at: '2026-06-19T00:03:01.000Z',
  complete: true,
  failed: true,
  canceled: false,
  awaiting_children: false,
  failure_reason:
    'Bybit queued market order mo-missed for BTCUSDT is stale before submit: age=17000ms max=16000ms.',
  snapshot: {
    kind: 'MarketOrder',
    data: {
      market_context: bybitProtocolFixtures.bybitContext,
      market_action: MarketAction.Open,
      symbol: 'BTCUSDT',
      order_side: OrderSide.Buy,
      quantity: 0.001,
      position_side: PositionSide.Long,
      price: 65_000,
      throttle: true,
      status: MarketOrderStatus.Rejected,
      filled_qty: null,
      remote_id: null,
      remote_order_id: null,
      client_order_id: 'mo-missed',
      sent_at: null,
      last_status_check_at: null,
      last_update_seen_at: null,
    },
  },
} satisfies DeviceSnapshotLiteData

const bybitMissingProtectionDevice = {
  device_id: bybitMissingProtectionDeviceId,
  owner_user_id: '17171717-1717-4717-8717-171717171717',
  associated_command_id: bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
  market_ref: {
    ...bybitProtocolFixtures.bybitMarketRef,
    symbol: 'MISSINGUSDT',
  },
  protection_state: {
    strategy: ProtectionStrategy.NativeAttachedTpsl,
    lifecycle: ProtectionLifecycle.Rejected,
    parent_client_order_id: 'mo-missing-protection-parent',
    parent_remote_order_id: 'remote-missing-protection-parent',
    take_profit_trigger_price: 2.42,
    stop_loss_trigger_price: 1.91,
    protected_qty: null,
    filled_qty: 0,
    last_reconciled_at: '2026-06-19T00:04:05.000Z',
  },
  parent_device: null,
  children_devices: null,
  created_at: '2026-06-19T00:04:00.000Z',
  complete: true,
  failed: true,
  canceled: false,
  awaiting_children: false,
  failure_reason:
    'Native Bybit TP/SL protection missing: observed 1 linked protection order, expected 2.',
  snapshot: {
    kind: 'NativeProtection',
    data: {
      symbol: 'MISSINGUSDT',
      market_context: bybitProtocolFixtures.bybitContext,
      position_side: PositionSide.Long,
      take_profit: 2.42,
      stop_loss: 1.91,
      expected_entries: 1,
      observed_entries: 1,
      observed_protection_orders: 1,
      observed_entry_order_ids: ['mo-missing-protection-parent'],
      observed_protection_order_ids: ['partial-stop-only'],
      tracked_parent_client_order_ids: ['mo-missing-protection-parent'],
      tracked_parent_remote_order_ids: ['remote-missing-protection-parent'],
      entry_filled_qty: 25,
      protection_filled_qty: 0,
      status: NativeProtectionStatus.Rejected,
      last_client_order_id: 'partial-stop-only',
      last_parent_client_order_id: 'mo-missing-protection-parent',
      last_remote_order_id: 'remote-partial-stop-only',
      last_order_status: 'Rejected',
      last_order_reason: 'native_protection_missing: observed 1 linked TP/SL orders, expected 2',
      last_update_seen_at: '2026-06-19T00:04:05.000Z',
      created_at: '2026-06-19T00:04:00.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

onMounted(async () => {
  const commandStore = useCommandStore()
  const deviceStore = useDeviceStore()

  commandStore.history = [
    binanceCommand,
    bybitProtocolFixtures.bybitCommandHistoryItem,
    bybitRejectedCommand,
    bybitMissedCommand,
  ]
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
    [bybitRejectedCommandId]: {
      nickname: 'Bybit ADA rejected open',
      nicknameColor: null,
      pinned: false,
    },
    [bybitMissedCommandId]: {
      nickname: 'Bybit missed BTC entry',
      nicknameColor: null,
      pinned: false,
    },
  }

  deviceStore.clearDevices()
  deviceStore.handleDeviceSnapshotLite(binanceMarketOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitProtocolFixtures.bybitDeviceSnapshotLite)
  deviceStore.handleDeviceSnapshotLite(bybitRejectedMarketOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitMissedTrailingEntryDevice)
  deviceStore.handleDeviceSnapshotLite(bybitMissedMarketOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitMissingProtectionDevice)

  await nextTick()
  commandPanelRef.value?.toggleFilters()
})
</script>

<template>
  <main class="e2e-shell">
    <section class="e2e-panel" data-testid="accounts-panel" aria-label="Trading Accounts">
      <AccountsListPanel />
    </section>

    <section class="e2e-panel" data-testid="command-panel" aria-label="Command History">
      <CommandPanel ref="commandPanelRef" />
    </section>

    <section class="e2e-panel" data-testid="device-tree-panel" aria-label="Device Tree">
      <DeviceTreePanel />
    </section>

    <section class="e2e-panel" data-testid="device-details-panel" aria-label="Device Details">
      <DeviceDetailsPanel />
    </section>
  </main>
</template>

<style scoped>
.e2e-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns:
    minmax(320px, 0.9fr) minmax(320px, 1fr) minmax(320px, 1fr)
    minmax(320px, 1fr);
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
