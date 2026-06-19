import {
  MarketAction,
  NativeProtectionStatus,
  PositionSide,
  CommandStatus,
  ExchangeType,
  NetworkType,
  ProtectionLifecycle,
  ProtectionStrategy,
  type CommandHistoryItem,
  type DeviceSnapshotLiteData,
  type MarketCapabilitiesData,
  type MarketContext,
  type MarketRef,
  type MarketOrderCommand,
  type NativeProtectionSnapshot,
  type TrailingEntryOrderCommand,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

const bybitContext = {
  type: 'bybit',
  account_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
} satisfies MarketContext

const bybitMarketRef = {
  exchange: ExchangeType.Bybit,
  network: NetworkType.Testnet,
  product: 'usdt_perp',
  trading_account_id: bybitContext.account_id,
  trading_account_label: 'Bybit Testnet',
  symbol: 'BTCUSDT',
} satisfies MarketRef

const bybitMarketOrderWithAttachedTpsl = {
  action: MarketAction.Open,
  symbol: 'BTCUSDT',
  quantity_usd: 100,
  position_side: PositionSide.Long,
  market_context: bybitContext,
  attached_exit_plan: {
    take_profit: 68000,
    stop_loss: 62000,
  },
} satisfies MarketOrderCommand

const bybitTrailingEntryWithTakeProfit = {
  position_side: PositionSide.Long,
  symbol: 'BTCUSDT',
  activation_price: 65000,
  jump_frac_threshold: 0.002,
  stop_loss: 62000,
  take_profit: 68000,
  risk_amount: 100,
  market_context: bybitContext,
  split_settings: {
    target_child_notional: 25,
    max_splits_cap: 4,
    mode: 'prefer_target',
    slippage_margin: 0.001,
  },
} satisfies TrailingEntryOrderCommand

const bybitMarketOrderCommandPayload = {
  kind: 'MarketOrder',
  data: bybitMarketOrderWithAttachedTpsl,
} satisfies UserCommandPayload

const bybitTrailingEntryCommandPayload = {
  kind: 'TrailingEntryOrder',
  data: bybitTrailingEntryWithTakeProfit,
} satisfies UserCommandPayload

const bybitCommandHistoryItem = {
  command_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  command: bybitMarketOrderCommandPayload,
  market_ref: bybitMarketRef,
  status: CommandStatus.Running,
  created_at: '2026-06-19T00:00:00.000Z',
} satisfies CommandHistoryItem

const bybitCapabilities = {
  request_uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  market_context: bybitContext,
  supports_market_orders: true,
  supports_limit_orders: false,
  supports_trailing_entry: true,
  supports_direct_close_market_orders: true,
  supports_trailing_entry_close_command: true,
  supports_leverage: true,
  supports_hedge_mode: true,
  hedge_mode_only: true,
  supports_attached_take_profit_stop_loss: true,
  supports_position_trading_stop: false,
  protection_strategy: 'native_attached_tpsl',
  product: 'usdt_perp',
  notes: [
    'USDT linear perpetuals only in Bybit v1.',
    'Attached TP/SL is reconciled through NativeProtection.',
  ],
} satisfies MarketCapabilitiesData

const bybitNativeProtectionSnapshot = {
  symbol: 'BTCUSDT',
  market_context: bybitContext,
  position_side: PositionSide.Long,
  take_profit: 68000,
  stop_loss: 62000,
  expected_entries: 4,
  observed_entries: 2,
  observed_protection_orders: 2,
  observed_entry_order_ids: ['mo-parent-1', 'mo-parent-2'],
  observed_protection_order_ids: ['child-sl-1', 'child-tp-1'],
  entry_filled_qty: 0.002,
  protection_filled_qty: 0,
  status: NativeProtectionStatus.Tracking,
  last_client_order_id: 'mo-parent-1',
  last_parent_client_order_id: 'te-parent-1',
  last_remote_order_id: '5cf98598-39a7-459e-97bf-76ca765ee020',
  last_order_status: 'PARTIALLY_FILLED',
  last_order_reason: null,
  last_update_seen_at: '2026-06-19T00:00:00.000Z',
  created_at: '2026-06-19T00:00:00.000Z',
} satisfies NativeProtectionSnapshot

const bybitDeviceSnapshotLite = {
  device_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  owner_user_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  associated_command_id: bybitCommandHistoryItem.command_id,
  market_ref: bybitMarketRef,
  protection_state: {
    strategy: ProtectionStrategy.NativeAttachedTpsl,
    lifecycle: ProtectionLifecycle.Active,
    parent_client_order_id: 'bybit-parent-entry-1',
    take_profit_trigger_price: 68_000,
    stop_loss_trigger_price: 62_000,
    protected_qty: 0.001,
    filled_qty: 0,
    last_reconciled_at: '2026-06-19T00:00:00.000Z',
  },
  parent_device: null,
  children_devices: null,
  created_at: '2026-06-19T00:00:00.000Z',
  complete: false,
  failed: false,
  canceled: false,
  awaiting_children: false,
  failure_reason: null,
  snapshot: {
    kind: 'NativeProtection',
    data: bybitNativeProtectionSnapshot,
  },
} satisfies DeviceSnapshotLiteData

export const bybitProtocolFixtures = {
  bybitContext,
  bybitMarketRef,
  bybitMarketOrderCommandPayload,
  bybitTrailingEntryCommandPayload,
  bybitCommandHistoryItem,
  bybitCapabilities,
  bybitNativeProtectionSnapshot,
  bybitDeviceSnapshotLite,
}
