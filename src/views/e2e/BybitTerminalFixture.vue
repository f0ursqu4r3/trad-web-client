<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import AccountsListPanel from '@/components/terminal/panels/AccountsListPanel.vue'
import CommandPanel from '@/components/terminal/panels/CommandPanel.vue'
import DeviceDetailsPanel from '@/components/terminal/panels/DeviceDetailsPanel.vue'
import DeviceTreePanel from '@/components/terminal/panels/DeviceTreePanel.vue'
import MarketOrderModal from '@/components/terminal/modals/commands/MarketOrderModal.vue'
import LimitOrderModal from '@/components/terminal/modals/commands/LimitOrderModal.vue'
import ChaseOrderModal from '@/components/terminal/modals/commands/ChaseOrderModal.vue'
import CommandModalContainer from '@/components/terminal/modals/commands/CommandModalContainer.vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { bybitProtocolFixtures } from '@/lib/bybitProtocolFixtures'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  OrderStatus,
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
  type DeviceChaseDeltaEvent,
  type MarketContext,
  type MarketProduct,
  type MarketRef,
} from '@/lib/ws/protocol'

const commandPanelRef = ref<InstanceType<typeof CommandPanel> | null>(null)
const accountStore = useAccountsStore()
const wsStore = useWsStore()
const continueMissedEntrySends = ref<string[]>([])
const commandSends = ref<unknown[]>([])
const marketOrderOpen = ref(false)
const limitOrderOpen = ref(false)
const chaseOrderOpen = ref(false)

wsStore.sendContinueMissedTrailingEntry = (commandId: string) => {
  continueMissedEntrySends.value = [...continueMissedEntrySends.value, commandId]
  return commandId
}
wsStore.sendUserCommand = ((payload: unknown) => {
  commandSends.value = [...commandSends.value, payload]
  return '19191919-1919-4919-8919-191919191919'
}) as typeof wsStore.sendUserCommand

declare global {
  interface Window {
    __tradBybitTerminalFixture?: {
      getContinueMissedEntrySends: () => string[]
      getCommandSends: () => unknown[]
      setChaseStale: () => void
    }
  }
}

window.__tradBybitTerminalFixture = {
  getContinueMissedEntrySends: () => [...continueMissedEntrySends.value],
  getCommandSends: () => [...commandSends.value],
  setChaseStale: () => {
    const event: DeviceChaseDeltaEvent = {
      device_id: hyperliquidChaseDeviceId,
      ts: new Date().toISOString(),
      seq: 13,
      chase: {
        ...hyperliquidChaseDevice.snapshot.data,
        revision: 13,
        status: 'paused_stale_market',
        latest_book_at: '2026-06-19T00:06:04.000Z',
        last_reason: 'BBO stream is older than the one-second repricing limit',
      },
    }
    useDeviceStore().handleDeviceUpdate('DeviceChaseDelta', event)
  },
}

function openHyperliquidMarketOrder() {
  accountStore.selectedAccountId = hyperliquidAccountId
  marketOrderOpen.value = true
}

function openHyperliquidLimitOrder() {
  accountStore.selectedAccountId = hyperliquidAccountId
  limitOrderOpen.value = true
}

function openHyperliquidChaseOrder() {
  accountStore.selectedAccountId = hyperliquidAccountId
  chaseOrderOpen.value = true
}

function captureMarketOrder(payload: unknown) {
  commandSends.value = [...commandSends.value, payload]
  marketOrderOpen.value = false
}

const binanceAccountId = '11111111-1111-4111-8111-111111111111'
const binanceCommandId = '22222222-2222-4222-8222-222222222222'
const binanceDeviceId = '33333333-3333-4333-8333-333333333333'
const bybitRejectedCommandId = '77777777-7777-4777-8777-777777777777'
const bybitRejectedDeviceId = '88888888-8888-4888-8888-888888888888'
const bybitMissedCommandId = '12121212-1212-4212-8212-121212121212'
const bybitMissedTeDeviceId = '13131313-1313-4313-8313-131313131313'
const bybitMissedMoDeviceId = '14141414-1414-4414-8414-141414141414'
const bybitMissingProtectionDeviceId = '16161616-1616-4616-8616-161616161616'
const hyperliquidAccountId = '17171717-1717-4717-8717-171717171717'
const hyperliquidLimitCommandId = '21212121-2121-4121-8121-212121212121'
const hyperliquidLimitDeviceId = '23232323-2323-4323-8323-232323232323'
const hyperliquidChaseCommandId = '25252525-2525-4525-8525-252525252525'
const hyperliquidChaseDeviceId = '26262626-2626-4626-8626-262626262626'
const hyperliquidChaseAttemptOneId = '27272727-2727-4727-8727-272727272727'
const hyperliquidChaseAttemptTwoId = '28282828-2828-4828-8828-282828282828'
const hyperliquidChaseProtectionId = '29292929-2929-4929-8929-292929292929'
const binanceContext = {
  binance: { account_id: binanceAccountId },
} satisfies MarketContext
const hyperliquidContext = {
  hyperliquid: { account_id: hyperliquidAccountId },
} satisfies MarketContext
const binanceMarketRef = {
  exchange: ExchangeType.Binance,
  network: NetworkType.Testnet,
  product: 'usdt_perp' satisfies MarketProduct,
  trading_account_id: binanceAccountId,
  trading_account_label: 'Binance QA',
  symbol: 'ETHUSDT',
} satisfies MarketRef
const hyperliquidMarketRef = {
  exchange: ExchangeType.Hyperliquid,
  network: NetworkType.Testnet,
  product: 'usdc_perp' satisfies MarketProduct,
  trading_account_id: hyperliquidAccountId,
  trading_account_label: 'Hyperliquid QA',
  symbol: 'BTC',
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
  {
    id: hyperliquidAccountId,
    label: 'Hyperliquid QA',
    key: 'redacted',
    network: NetworkType.Testnet,
    exchange: ExchangeType.Hyperliquid,
    exchange_metadata: {
      product: 'usdc_perp',
      hedge_mode_only: false,
      user_address: '0x1111111111111111111111111111111111111111',
      agent_address: '0x2222222222222222222222222222222222222222',
      agent_approved: true,
      agent_approval_verified_at_ms: 1_780_000_000_000,
      builder_address: '0x3333333333333333333333333333333333333333',
      builder_config_version: 'test-fixture',
      builder_fee_tenths_bps: 10,
      max_builder_fee_tenths_bps: 10,
      builder_approved: true,
      builder_approval_network: NetworkType.Testnet,
      builder_approval_user_address: '0x1111111111111111111111111111111111111111',
      builder_approval_verified_at_ms: 1_780_000_000_000,
      default_leverage: 1,
      entry_market_guard_tenths_bps: 700,
      take_profit_market_guard_tenths_bps: 1_200,
      stop_loss_market_guard_tenths_bps: 11_000,
    },
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
wsStore.marketCapabilities[`hyperliquid:${hyperliquidAccountId}`] = {
  request_uuid: '20202020-2020-4020-8020-202020202020',
  market_context: hyperliquidContext,
  supports_market_orders: true,
  supports_limit_orders: true,
  supports_chase_orders: true,
  supports_trailing_entry: false,
  supports_direct_close_market_orders: true,
  supports_trailing_entry_close_command: false,
  supports_leverage: true,
  supports_hedge_mode: false,
  hedge_mode_only: false,
  supports_attached_take_profit_stop_loss: true,
  supports_position_trading_stop: false,
  new_open_orders_enabled: true,
  runtime_mode: 'enabled',
  protection_strategy: 'native_attached_tpsl',
  product: 'usdc_perp',
  notes: [],
}
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
wsStore.applyOrderThrottleSnapshot({
  request_uuid: '18181818-1818-4818-8818-181818181818',
  market_context: hyperliquidContext,
  total_queued: 7,
  total_in_flight: 2,
  enqueued_total: 11,
  started_total: 4,
  completed_total: 3,
  canceled_total: 1,
  errored_total: 5,
  stale_rejected_total: 6,
  rate_limit_rejected_total: 8,
  delayed_by_limiter_total: 9,
  bybit_rate_limit: null,
  hyperliquid_rest_budget: {
    used_weight: 375,
    hard_limit: 1200,
    open_limit: 1000,
    background_limit: 600,
    cooldown_remaining_ms: null,
    admitted_total: 120,
    rejected_total: 3,
    observed_429_total: 1,
  },
  hyperliquid_address_budget: {
    requests_used: 120,
    requests_cap: 500,
    requests_surplus: 0,
    local_actions_since_observation: 5,
    observed_open_orders: 15,
    local_open_order_reservations: 3,
    observation_age_ms: 2000,
    stale: false,
  },
  min_interval_ms: 200,
  max_in_flight_per_account: 5,
  accounts: [
    {
      account_id: hyperliquidAccountId,
      queued: 7,
      in_flight: 2,
      oldest_queued_age_ms: 12_000,
      estimated_drain_ms: 6_000,
    },
  ],
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

const hyperliquidLimitCommand = {
  command_id: hyperliquidLimitCommandId,
  command: {
    kind: 'LimitOrder',
    data: {
      action: MarketAction.Open,
      side: OrderSide.Buy,
      symbol: 'BTC',
      quantity: 25,
      quantity_mode: 'notional',
      price: 50_000,
      time_in_force: 'gtc',
      position_side: PositionSide.Long,
      market_context: hyperliquidContext,
      attached_exit_plan: null,
      execution_guard_overrides: null,
    },
  },
  market_ref: hyperliquidMarketRef,
  status: CommandStatus.Running,
  created_at: '2026-06-19T00:05:00.000Z',
} satisfies CommandHistoryItem

const hyperliquidChaseCommand = {
  command_id: hyperliquidChaseCommandId,
  command: {
    kind: 'ChaseOrder',
    data: {
      action: MarketAction.Open,
      side: OrderSide.Buy,
      symbol: 'BTC',
      quantity: 75,
      quantity_mode: 'notional',
      position_side: PositionSide.Long,
      market_context: hyperliquidContext,
      boundary: { kind: 'basis_points', value: 20 },
      expires_after_secs: 300,
      attached_exit_plan: {
        take_profit: 51_000,
        stop_loss: 49_000,
      },
      execution_guard_overrides: null,
    },
  },
  market_ref: hyperliquidMarketRef,
  status: CommandStatus.Running,
  created_at: '2026-06-19T00:06:00.000Z',
} satisfies CommandHistoryItem

const binanceOrderDevice = {
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
    kind: 'Order',
    data: {
      market_context: binanceContext,
      market_action: MarketAction.Open,
      symbol: 'ETHUSDT',
      order_side: OrderSide.Buy,
      quantity: 0.04,
      position_side: PositionSide.Long,
      price: 3125,
      throttle: false,
      status: OrderStatus.Filled,
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

const bybitRejectedOrderDevice = {
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
    kind: 'Order',
    data: {
      market_context: bybitProtocolFixtures.bybitContext,
      market_action: MarketAction.Open,
      symbol: 'ADAUSDT',
      order_side: OrderSide.Buy,
      quantity: 100,
      position_side: PositionSide.Long,
      price: 0,
      throttle: false,
      status: OrderStatus.Rejected,
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

const bybitMissedOrderDevice = {
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
    kind: 'Order',
    data: {
      market_context: bybitProtocolFixtures.bybitContext,
      market_action: MarketAction.Open,
      symbol: 'BTCUSDT',
      order_side: OrderSide.Buy,
      quantity: 0.001,
      position_side: PositionSide.Long,
      price: 65_000,
      throttle: true,
      status: OrderStatus.Rejected,
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

const hyperliquidWorkingLimitDevice = {
  device_id: hyperliquidLimitDeviceId,
  owner_user_id: '24242424-2424-4424-8424-242424242424',
  associated_command_id: hyperliquidLimitCommandId,
  market_ref: hyperliquidMarketRef,
  protection_state: null,
  parent_device: null,
  children_devices: null,
  created_at: '2026-06-19T00:05:00.000Z',
  complete: false,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: null,
  snapshot: {
    kind: 'Order',
    data: {
      market_context: hyperliquidContext,
      market_action: MarketAction.Open,
      symbol: 'BTC',
      order_side: OrderSide.Buy,
      quantity: 0.0005,
      position_side: PositionSide.Long,
      price: 50_000,
      execution: {
        kind: 'limit',
        time_in_force: 'gtc',
        input_mode: 'notional',
        input_value: 25,
      },
      throttle: false,
      status: OrderStatus.PartiallyFilled,
      filled_qty: 0.0002,
      execution_fills: [
        {
          exchange: ExchangeType.Hyperliquid,
          symbol: 'BTC',
          remote_order_id: '987654321',
          execution_id: 'fill-1',
          side: 'Buy',
          direction: 'Open Long',
          price: '50000',
          quantity: '0.0001',
          execution_time_ms: 1_750_291_501_000,
          is_maker: false,
          fee: '0.006',
          fee_token: 'USDC',
          builder_fee: '0.001',
          closed_pnl: '0.25',
          start_position: '0',
          transaction_hash: '0xabc',
        },
        {
          exchange: ExchangeType.Hyperliquid,
          symbol: 'BTC',
          remote_order_id: '987654321',
          execution_id: 'fill-2',
          side: 'Buy',
          direction: 'Open Long',
          price: '50010',
          quantity: '0.0001',
          execution_time_ms: 1_750_291_502_000,
          is_maker: true,
          fee: '0.004',
          fee_token: 'USDC',
          builder_fee: '0.001',
          closed_pnl: '0.10',
          start_position: '0.0001',
          transaction_hash: '0xdef',
        },
      ],
      remote_id: 987654321,
      remote_order_id: '987654321',
      client_order_id: 'hl-working-limit',
      sent_at: '2026-06-19T00:05:00.000Z',
      last_status_check_at: '2026-06-19T00:05:01.000Z',
      last_update_seen_at: '2026-06-19T00:05:01.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

const hyperliquidChaseDevice = {
  device_id: hyperliquidChaseDeviceId,
  owner_user_id: '24242424-2424-4424-8424-242424242424',
  associated_command_id: hyperliquidChaseCommandId,
  market_ref: hyperliquidMarketRef,
  protection_state: null,
  parent_device: null,
  children_devices: [hyperliquidChaseAttemptOneId, hyperliquidChaseAttemptTwoId],
  created_at: '2026-06-19T00:06:00.000Z',
  complete: false,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: null,
  snapshot: {
    kind: 'Chase',
    data: {
      revision: 12,
      market_context: hyperliquidContext,
      market_action: MarketAction.Open,
      symbol: 'BTC',
      order_side: OrderSide.Buy,
      position_side: PositionSide.Long,
      quantity: 75,
      quantity_mode: 'notional',
      total_base_qty: 0.0015,
      filled_qty: 0.0005,
      remaining_qty: 0.001,
      boundary: { kind: 'basis_points', value: 20 },
      boundary_price: 50_100,
      expires_at: '2099-06-19T00:11:00.000Z',
      attached_exit_plan: {
        take_profit: 51_000,
        stop_loss: 49_000,
      },
      execution_guards: {
        entry_market_tenths_bps: 700,
        take_profit_market_tenths_bps: 1_200,
        stop_loss_market_tenths_bps: 11_000,
      },
      status: 'working',
      current_child_id: hyperliquidChaseAttemptTwoId,
      current_client_order_id: '0x22222222222222222222222222222222',
      next_attempt_sequence: 2,
      attempts: [
        {
          sequence: 0,
          child_device_id: hyperliquidChaseAttemptOneId,
          client_order_id: '0x11111111111111111111111111111111',
          price: 50_000,
          requested_qty: 0.0015,
          filled_qty: 0.0005,
          status: 'canceled',
          created_at: '2026-06-19T00:06:01.000Z',
          completed_at: '2026-06-19T00:06:02.000Z',
        },
        {
          sequence: 1,
          child_device_id: hyperliquidChaseAttemptTwoId,
          client_order_id: '0x22222222222222222222222222222222',
          price: 50_020,
          requested_qty: 0.001,
          filled_qty: 0,
          status: 'working',
          created_at: '2026-06-19T00:06:03.000Z',
          completed_at: null,
        },
      ],
      latest_bid: 50_020,
      latest_ask: 50_021,
      latest_book_at: '2099-06-19T00:06:04.000Z',
      desired_price: 50_020,
      working_price: 50_020,
      last_reprice_at: '2026-06-19T00:06:03.000Z',
      retry_not_before: null,
      replacement_pending: false,
      pending_terminal_status: null,
      last_reason: 'Replacement 1 is resting at the current best bid',
      created_at: '2026-06-19T00:06:00.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

const hyperliquidChaseAttemptOne = {
  device_id: hyperliquidChaseAttemptOneId,
  owner_user_id: '24242424-2424-4424-8424-242424242424',
  associated_command_id: hyperliquidChaseCommandId,
  market_ref: hyperliquidMarketRef,
  protection_state: null,
  parent_device: hyperliquidChaseDeviceId,
  children_devices: [hyperliquidChaseProtectionId],
  created_at: '2026-06-19T00:06:01.000Z',
  complete: false,
  failed: false,
  canceled: true,
  awaiting_children: true,
  failure_reason: null,
  snapshot: {
    kind: 'Order',
    data: {
      market_context: hyperliquidContext,
      market_action: MarketAction.Open,
      symbol: 'BTC',
      order_side: OrderSide.Buy,
      quantity: 0.0015,
      position_side: PositionSide.Long,
      price: 50_000,
      execution: {
        kind: 'limit',
        time_in_force: 'alo',
        input_mode: 'base',
        input_value: 0.0015,
      },
      throttle: false,
      status: OrderStatus.Canceled,
      filled_qty: 0.0005,
      remote_id: 98_765_432,
      remote_order_id: '98765432',
      client_order_id: '0x11111111111111111111111111111111',
      sent_at: '2026-06-19T00:06:01.000Z',
      last_status_check_at: '2026-06-19T00:06:02.000Z',
      last_update_seen_at: '2026-06-19T00:06:02.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

const hyperliquidChaseAttemptTwo = {
  device_id: hyperliquidChaseAttemptTwoId,
  owner_user_id: '24242424-2424-4424-8424-242424242424',
  associated_command_id: hyperliquidChaseCommandId,
  market_ref: hyperliquidMarketRef,
  protection_state: null,
  parent_device: hyperliquidChaseDeviceId,
  children_devices: null,
  created_at: '2026-06-19T00:06:03.000Z',
  complete: false,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: null,
  snapshot: {
    kind: 'Order',
    data: {
      market_context: hyperliquidContext,
      market_action: MarketAction.Open,
      symbol: 'BTC',
      order_side: OrderSide.Buy,
      quantity: 0.001,
      position_side: PositionSide.Long,
      price: 50_020,
      execution: {
        kind: 'limit',
        time_in_force: 'alo',
        input_mode: 'base',
        input_value: 0.001,
      },
      throttle: false,
      status: OrderStatus.AlreadySentAndAwaitingFilling,
      filled_qty: 0,
      remote_id: 98_765_433,
      remote_order_id: '98765433',
      client_order_id: '0x22222222222222222222222222222222',
      sent_at: '2026-06-19T00:06:03.000Z',
      last_status_check_at: '2026-06-19T00:06:04.000Z',
      last_update_seen_at: '2026-06-19T00:06:04.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

const hyperliquidChaseProtection = {
  device_id: hyperliquidChaseProtectionId,
  owner_user_id: '24242424-2424-4424-8424-242424242424',
  associated_command_id: hyperliquidChaseCommandId,
  market_ref: hyperliquidMarketRef,
  protection_state: null,
  parent_device: hyperliquidChaseAttemptOneId,
  children_devices: null,
  created_at: '2026-06-19T00:06:02.000Z',
  complete: false,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: null,
  snapshot: {
    kind: 'NativeProtection',
    data: {
      symbol: 'BTC',
      market_context: hyperliquidContext,
      position_side: PositionSide.Long,
      take_profit: 51_000,
      stop_loss: 49_000,
      expected_entries: 1,
      activation_policy: 'first_fill_cancel_remainder',
      execution_guards: {
        entry_market_tenths_bps: 700,
        take_profit_market_tenths_bps: 1_200,
        stop_loss_market_tenths_bps: 11_000,
      },
      observed_entries: 1,
      observed_protection_orders: 2,
      observed_entry_order_ids: ['0x11111111111111111111111111111111'],
      observed_protection_order_ids: ['chase-tp', 'chase-sl'],
      tracked_parent_client_order_ids: ['0x11111111111111111111111111111111'],
      tracked_parent_remote_order_ids: ['98765432'],
      entry_filled_qty: 0.0005,
      protection_filled_qty: 0,
      owned_remaining_qty: 0.0005,
      ownership_status: 'external_surplus',
      last_live_signed_position: 0.001,
      aggregate_owned_qty: 0.0005,
      aggregate_owner_count: 1,
      ownership_reason:
        'Live position 0.00100000 includes 0.00050000 same-side quantity not owned by Trad protection groups',
      status: NativeProtectionStatus.Tracking,
      last_client_order_id: 'chase-sl',
      last_parent_client_order_id: '0x11111111111111111111111111111111',
      last_remote_order_id: '98765435',
      last_order_status: 'Open',
      last_order_reason: null,
      last_update_seen_at: '2026-06-19T00:06:04.000Z',
      created_at: '2026-06-19T00:06:02.000Z',
    },
  },
} satisfies DeviceSnapshotLiteData

const highCountBybitSymbols = [
  'DOGEUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'TRXUSDT',
  'XLMUSDT',
  'SUIUSDT',
  'LINKUSDT',
  'AVAXUSDT',
  'DOTUSDT',
  'LTCUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'BCHUSDT',
  'ETCUSDT',
  'APTUSDT',
  'NEARUSDT',
  'FILUSDT',
  'OPUSDT',
  'ARBUSDT',
  'INJUSDT',
  'ATOMUSDT',
  'UNIUSDT',
  'AAVEUSDT',
  'ALGOUSDT',
  'HBARUSDT',
  'ICPUSDT',
  'SEIUSDT',
  'TIAUSDT',
  'WLDUSDT',
  'JUPUSDT',
  'PYTHUSDT',
  'WIFUSDT',
  'ORDIUSDT',
  '1000PEPEUSDT',
  '1000SHIBUSDT',
  '1000BONKUSDT',
  'FETUSDT',
  'RENDERUSDT',
  'GRTUSDT',
  'MKRUSDT',
  'COMPUSDT',
  'SANDUSDT',
  'MANAUSDT',
  'GALAUSDT',
  'RUNEUSDT',
  'IMXUSDT',
  'ENAUSDT',
  'ONDOUSDT',
  'JTOUSDT',
  'ZROUSDT',
]

function highCountId(prefix: string, index: number): string {
  return `${prefix}000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}

const highCountBybitCommands = highCountBybitSymbols.map((symbol, index) => {
  const price = 1 + index * 0.25
  return {
    command_id: highCountId('20', index + 1),
    command: {
      kind: 'TrailingEntryOrder',
      data: {
        position_side: PositionSide.Long,
        symbol,
        activation_price: price,
        jump_frac_threshold: 0.000001,
        stop_loss: price * 0.95,
        take_profit: price * 1.02,
        risk_amount: 1,
        market_context: bybitProtocolFixtures.bybitContext,
        split_settings: {
          target_child_notional: 25,
          max_splits_cap: 1,
          mode: 'prefer_target',
          slippage_margin: 0.001,
        },
      },
    },
    market_ref: {
      ...bybitProtocolFixtures.bybitMarketRef,
      symbol,
    },
    status: CommandStatus.Running,
    created_at: `2026-06-19T01:${String(index).padStart(2, '0')}:00.000Z`,
  } satisfies CommandHistoryItem
})

const highCountBybitDevices = highCountBybitSymbols.map((symbol, index) => {
  const price = 1 + index * 0.25
  return {
    device_id: highCountId('30', index + 1),
    owner_user_id: highCountId('40', index + 1),
    associated_command_id: highCountBybitCommands[index].command_id,
    market_ref: {
      ...bybitProtocolFixtures.bybitMarketRef,
      symbol,
    },
    protection_state: null,
    parent_device: null,
    children_devices: null,
    created_at: `2026-06-19T01:${String(index).padStart(2, '0')}:00.000Z`,
    complete: false,
    failed: false,
    canceled: false,
    awaiting_children: false,
    failure_reason: null,
    snapshot: {
      kind: 'TrailingEntry',
      data: {
        symbol,
        market_context: bybitProtocolFixtures.bybitContext,
        position_side: PositionSide.Long,
        activation_price: price,
        jump_frac_threshold: 0.000001,
        stop_loss: price * 0.95,
        take_profit: price * 1.02,
        risk_amount: 1,
        split_settings: {
          target_child_notional: 25,
          max_splits_cap: 1,
          mode: 'prefer_target',
          slippage_margin: 0.001,
        },
        phase: TrailingEntryPhase.Initial,
        peak: price,
        peak_index: 0,
        position_size: 0,
        actual_activation_price: 0,
        buy_or_sell_price: 0,
        completed: false,
        cancelled: false,
        succeeded: false,
        stop_loss_hit: false,
        base_index: 0,
        total_points: 120 + index,
        start_trigger_index: null,
        end_trigger_index: null,
        lifecycle: TrailingEntryLifecycle.Running,
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
})

onMounted(async () => {
  const commandStore = useCommandStore()
  const deviceStore = useDeviceStore()

  commandStore.history = [
    binanceCommand,
    bybitProtocolFixtures.bybitCommandHistoryItem,
    bybitRejectedCommand,
    bybitMissedCommand,
    hyperliquidLimitCommand,
    hyperliquidChaseCommand,
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
  deviceStore.handleDeviceSnapshotLite(binanceOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitProtocolFixtures.bybitDeviceSnapshotLite)
  deviceStore.handleDeviceSnapshotLite(bybitRejectedOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitMissedTrailingEntryDevice)
  deviceStore.handleDeviceSnapshotLite(bybitMissedOrderDevice)
  deviceStore.handleDeviceSnapshotLite(bybitMissingProtectionDevice)
  deviceStore.handleDeviceSnapshotLite(hyperliquidWorkingLimitDevice)
  deviceStore.handleDeviceSnapshotLite(hyperliquidChaseDevice)
  deviceStore.handleDeviceSnapshotLite(hyperliquidChaseAttemptOne)
  deviceStore.handleDeviceSnapshotLite(hyperliquidChaseAttemptTwo)
  deviceStore.handleDeviceSnapshotLite(hyperliquidChaseProtection)
  highCountBybitDevices.forEach((device) => deviceStore.handleDeviceSnapshotLite(device))

  await nextTick()
  commandPanelRef.value?.toggleFilters()
})
</script>

<template>
  <main class="e2e-shell">
    <div class="fixed top-2 right-2 z-50 flex gap-2">
      <button data-testid="open-hyperliquid-mo" type="button" @click="openHyperliquidMarketOrder">
        Open Hyperliquid MO
      </button>
      <button data-testid="open-hyperliquid-limit" type="button" @click="openHyperliquidLimitOrder">
        Open Hyperliquid Limit
      </button>
      <button data-testid="open-hyperliquid-chase" type="button" @click="openHyperliquidChaseOrder">
        Open Hyperliquid Chase
      </button>
    </div>
    <MarketOrderModal
      :open="marketOrderOpen"
      @submit="captureMarketOrder"
      @close="marketOrderOpen = false"
    />
    <LimitOrderModal :open="limitOrderOpen" @close="limitOrderOpen = false" />
    <ChaseOrderModal :open="chaseOrderOpen" @close="chaseOrderOpen = false" />
    <CommandModalContainer />
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
