import {
  MarketAction,
  NativeProtectionStatus,
  PositionSide,
  type MarketCapabilitiesData,
  type MarketContext,
  type MarketOrderCommand,
  type NativeProtectionSnapshot,
  type TrailingEntryOrderCommand,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

const bybitContext = {
  type: 'bybit',
  account_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
} satisfies MarketContext

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
  entry_filled_qty: 0.002,
  protection_filled_qty: 0,
  status: NativeProtectionStatus.Tracking,
  last_client_order_id: 'mo-parent-1',
  last_parent_client_order_id: 'te-parent-1',
  last_remote_order_id: '5cf98598-39a7-459e-97bf-76ca765ee020',
  last_order_status: 'PARTIALLY_FILLED',
  last_update_seen_at: '2026-06-19T00:00:00.000Z',
  created_at: '2026-06-19T00:00:00.000Z',
} satisfies NativeProtectionSnapshot

export const bybitProtocolFixtures = {
  bybitContext,
  bybitMarketOrderCommandPayload,
  bybitTrailingEntryCommandPayload,
  bybitCapabilities,
  bybitNativeProtectionSnapshot,
}
