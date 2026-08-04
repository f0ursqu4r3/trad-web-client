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
  type DeviceOrderDeltaEvent,
  type DeviceSnapshotLiteData,
  type DeviceTeDeltaEvent,
  type ProtectionState,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { createSSRApp, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { renderToString } from '@vue/server-renderer'
import { bybitProtocolFixtures } from '@/lib/bybitProtocolFixtures'
import {
  binanceMarketContext,
  formatMarketContext,
  hyperliquidMarketContext,
  marketContextAccountId,
  type AccountDisplayRecord,
} from '@/lib/marketContext'
import {
  commandMarketFacets,
  deviceMarketFacets,
  marketFacetMatchesFilters,
  uniqueFacetValues,
} from '@/lib/marketFilterFacets'
import {
  bybitMarketOrderExitLevelError,
  bybitTrailingEntryExitLevelError,
  isValidBybitUsdtSymbol,
  normalizeBybitUsdtSymbol,
} from '@/lib/bybitOrderValidation'
import { commandWithMarketAvailability } from '@/lib/commandAvailability'
import { commandRegistry } from '@/components/terminal/commands/commandRegistry'
import {
  accountMetadataChips,
  accountMetadataStatus,
  isBybitMetadataVerified,
  type AccountMetadataLike,
} from '@/lib/accountMetadata'
import { buildAccountFormPayload } from '@/lib/accountFormPayload'
import {
  useDeviceStore,
  type Device,
  type OrderState,
  type NativeProtectionState,
  type SplitState,
} from '@/stores/devices'

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Bybit filter smoke failed: ${message}`)
  }
}

function sorted(value: Iterable<string>): string[] {
  return Array.from(value).sort()
}

export function runBybitAccountPayloadSmoke(): void {
  const payload = buildAccountFormPayload({
    label: '  Bybit Live Dev  ',
    key: '  api-key  ',
    secret: '  secret-key  ',
    network: NetworkType.Mainnet,
    exchange: ExchangeType.Bybit,
  })

  assertSmoke(payload.label === 'Bybit Live Dev', 'Bybit account label should be trimmed')
  assertSmoke(payload.key === 'api-key', 'Bybit account API key should be trimmed')
  assertSmoke(payload.secret === 'secret-key', 'Bybit account secret should be trimmed')
  assertSmoke(payload.network === NetworkType.Mainnet, 'Bybit account network should be mainnet')
  assertSmoke(payload.exchange === ExchangeType.Bybit, 'Bybit account exchange should be bybit')
}

const binanceAccountId = '11111111-1111-1111-1111-111111111111'
const binanceContext = binanceMarketContext(binanceAccountId)

const binancePayload = {
  kind: 'MarketOrder',
  data: {
    action: MarketAction.Open,
    symbol: 'ETHUSDT',
    quantity: 100,
    quantity_mode: 'notional',
    position_side: PositionSide.Short,
    market_context: binanceContext,
  },
} satisfies UserCommandPayload

const binanceCommand = {
  command_id: '11111111-2222-3333-4444-555555555555',
  command: binancePayload,
  market_ref: {
    exchange: ExchangeType.Binance,
    network: NetworkType.Testnet,
    trading_account_id: binanceAccountId,
    trading_account_label: 'Binance Testnet',
    symbol: 'ETHUSDT',
  },
  status: CommandStatus.Running,
  created_at: '2026-06-19T00:00:00.000Z',
} satisfies CommandHistoryItem

const accounts = [
  {
    id: binanceAccountId,
    label: 'Binance Testnet',
    exchange: ExchangeType.Binance,
    network: NetworkType.Testnet,
  },
  {
    id: bybitProtocolFixtures.bybitAccountId,
    label: 'Bybit Testnet',
    exchange: ExchangeType.Bybit,
    network: NetworkType.Testnet,
  },
] satisfies AccountDisplayRecord[]

function bybitAccountWithMetadata(
  metadata: Partial<NonNullable<AccountMetadataLike['exchange_metadata']>>,
): AccountMetadataLike {
  return {
    id: bybitProtocolFixtures.bybitAccountId,
    label: 'Bybit Testnet',
    network: NetworkType.Testnet,
    exchange: ExchangeType.Bybit,
    exchange_metadata: {
      product: 'usdt_perp',
      hedge_mode_only: true,
      ...metadata,
    },
  }
}

function baseDevice(
  id: string,
  kind: string,
  associatedCommandId: string,
  state: Device['state'],
): Device {
  return {
    id,
    kind,
    associated_command_id: associatedCommandId,
    created_at: new Date('2026-06-19T00:00:00.000Z'),
    market_ref: null,
    protection_state: null,
    parent_device: null,
    children_devices: [],
    complete: false,
    failed: false,
    canceled: false,
    awaiting_children: false,
    failure_reason: null,
    state,
  }
}

function binanceOrderDevice(): Device {
  return baseDevice('device-binance-mo', 'Order', binanceCommand.command_id, {
    market_context: binanceContext,
    market_action: MarketAction.Open,
    symbol: 'ETHUSDT',
    order_side: OrderSide.Sell,
    quantity: 0.1,
    position_side: PositionSide.Short,
    price: 3500,
    execution: { kind: 'market' },
    throttle: false,
    one_way_open_semantics: 'delta',
    one_way_position_effect: null,
    one_way_transition: null,
    execution_guards: null,
    builder_target_total_tenths_bps: null,
    status: OrderStatus.AlreadySentAndAwaitingFilling,
    filled_qty: null,
    remote_id: null,
    remote_order_id: null,
    client_order_id: 'binance-entry-1',
    sent_at: null,
    last_status_check_at: null,
    last_update_seen_at: null,
  } satisfies OrderState)
}

function bybitNativeProtectionDevice(): Device {
  const state = {
    symbol: 'BTCUSDT',
    market_context: bybitProtocolFixtures.bybitContext,
    position_side: PositionSide.Long,
    take_profit: 68_000,
    take_profit_ladder: null,
    stop_loss: 62_000,
    expected_entries: 2,
    activation_policy: 'parent_attached',
    execution_guards: null,
    builder_target_total_tenths_bps: null,
    observed_entries: 1,
    observed_protection_orders: 1,
    observed_entry_order_ids: ['bybit-entry-1'],
    observed_protection_order_ids: ['bybit-sl-1'],
    tracked_parent_client_order_ids: ['bybit-entry-1'],
    tracked_parent_remote_order_ids: ['remote-bybit-entry-1'],
    entry_filled_qty: 0.001,
    protection_filled_qty: 0,
    explicit_close_filled_qty: 0,
    owned_remaining_qty: 0.001,
    ownership_status: 'unknown',
    last_live_signed_position: null,
    aggregate_owned_qty: null,
    aggregate_owner_count: null,
    ownership_reason: null,
    explicit_close_cleanup: false,
    status: NativeProtectionStatus.Tracking,
    last_client_order_id: 'bybit-entry-1',
    last_parent_client_order_id: null,
    last_remote_order_id: null,
    last_order_status: 'PARTIALLY_FILLED',
    last_order_reason: null,
    last_take_profit: '68000',
    last_stop_loss: '62000',
    last_tpsl_mode: 'Partial',
    last_update_seen_at: null,
    created_at: new Date('2026-06-19T00:00:00.000Z'),
  } satisfies NativeProtectionState

  const device = baseDevice(
    'device-bybit-native-protection',
    'NativeProtection',
    bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
    state,
  )
  device.market_ref = bybitProtocolFixtures.bybitMarketRef
  return device
}

function bybitSplitParent(childId: string): Device {
  const device = baseDevice(
    'device-bybit-split-parent',
    'Split',
    bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
    {
      symbol: 'BTCUSDT',
      quantity: 0.002,
      price: 65_000,
    } satisfies SplitState,
  )
  device.children_devices = [childId]
  return device
}

export function runBybitFilterSmoke(): void {
  assertSmoke(
    'bybit' in bybitProtocolFixtures.bybitContext &&
      !('type' in bybitProtocolFixtures.bybitContext),
    'Bybit market context fixture should use Rust externally tagged wire shape',
  )
  assertSmoke(
    marketContextAccountId(bybitProtocolFixtures.bybitContext) ===
      bybitProtocolFixtures.bybitAccountId,
    'Bybit market context account id should normalize from wire shape',
  )
  assertSmoke(
    formatMarketContext(bybitProtocolFixtures.bybitContext, accounts).includes('Bybit Testnet'),
    'Bybit market context display should accept wire shape',
  )
  const unknownModeAccount = bybitAccountWithMetadata({
    account_mode: 'Unknown account mode',
    margin_mode: 'REGULAR_MARGIN',
  })
  assertSmoke(
    !isBybitMetadataVerified(unknownModeAccount),
    'Bybit account metadata with unknown account mode should not verify',
  )
  assertSmoke(
    accountMetadataStatus(unknownModeAccount)?.includes('unvalidated'),
    'Bybit unknown account mode should render unvalidated status',
  )
  assertSmoke(
    accountMetadataChips(unknownModeAccount).includes('Mode unvalidated'),
    'Bybit unknown account mode should render unvalidated chip',
  )
  const blankMarginAccount = bybitAccountWithMetadata({
    account_mode: 'UTA 2.0',
    margin_mode: '  ',
  })
  assertSmoke(
    !isBybitMetadataVerified(blankMarginAccount),
    'Bybit account metadata with blank margin mode should not verify',
  )
  const missingProductAccount = bybitAccountWithMetadata({
    product: null,
    account_mode: 'UTA 2.0',
    margin_mode: 'REGULAR_MARGIN',
  })
  assertSmoke(
    !isBybitMetadataVerified(missingProductAccount),
    'Bybit account metadata without USDT perp product should not verify',
  )
  const nonHedgeAccount = bybitAccountWithMetadata({
    hedge_mode_only: false,
    account_mode: 'UTA 2.0',
    margin_mode: 'REGULAR_MARGIN',
  })
  assertSmoke(
    !isBybitMetadataVerified(nonHedgeAccount),
    'Bybit account metadata without hedge-only marker should not verify',
  )
  const verifiedMetadataAccount = bybitAccountWithMetadata({
    account_mode: 'UTA 2.0',
    margin_mode: 'REGULAR_MARGIN',
  })
  assertSmoke(
    isBybitMetadataVerified(verifiedMetadataAccount),
    'Bybit account metadata with concrete account and margin modes should verify',
  )
  assertSmoke(
    bybitTrailingEntryExitLevelError(PositionSide.Long, 65_000, 62_000, 68_000) === null,
    'Bybit long TE should allow TP above activation and SL below activation',
  )
  assertSmoke(
    bybitTrailingEntryExitLevelError(PositionSide.Long, 65_000, 62_000, 64_000)?.includes(
      'above activation',
    ),
    'Bybit long TE should reject TP below activation',
  )
  assertSmoke(
    bybitTrailingEntryExitLevelError(PositionSide.Short, 65_000, 68_000, 62_000) === null,
    'Bybit short TE should allow TP below activation and SL above activation',
  )
  assertSmoke(
    bybitTrailingEntryExitLevelError(PositionSide.Short, 65_000, 68_000, 66_000)?.includes(
      'below activation',
    ),
    'Bybit short TE should reject TP above activation',
  )
  assertSmoke(
    bybitMarketOrderExitLevelError(PositionSide.Long, 68_000, 62_000) === null,
    'Bybit long market order should allow TP above SL',
  )
  assertSmoke(
    bybitMarketOrderExitLevelError(PositionSide.Long, 62_000, 68_000)?.includes('above stop loss'),
    'Bybit long market order should reject TP below SL',
  )
  assertSmoke(
    bybitMarketOrderExitLevelError(PositionSide.Short, 62_000, 68_000) === null,
    'Bybit short market order should allow TP below SL',
  )
  assertSmoke(
    bybitMarketOrderExitLevelError(PositionSide.Short, 68_000, 62_000)?.includes('below stop loss'),
    'Bybit short market order should reject TP above SL',
  )
  assertSmoke(
    normalizeBybitUsdtSymbol(' btc ') === 'BTCUSDT',
    'Bybit symbol normalizer should trim, uppercase, and append USDT',
  )
  assertSmoke(
    normalizeBybitUsdtSymbol('ethusdt') === 'ETHUSDT',
    'Bybit symbol normalizer should preserve existing USDT suffix',
  )
  assertSmoke(
    normalizeBybitUsdtSymbol('   ') === '',
    'Bybit symbol normalizer should not turn blank input into USDT',
  )
  assertSmoke(
    normalizeBybitUsdtSymbol('usdt') === '',
    'Bybit symbol normalizer should not accept bare USDT as a market symbol',
  )
  assertSmoke(
    !isValidBybitUsdtSymbol('usdt') && isValidBybitUsdtSymbol('btc'),
    'Bybit symbol validator should reject bare USDT and accept base coin shorthand',
  )
  const bybitLauncherCommands = commandRegistry.map((command) =>
    commandWithMarketAvailability(command, bybitProtocolFixtures.bybitCapabilities),
  )
  const pendingLauncherCommands = commandRegistry.map((command) =>
    commandWithMarketAvailability(command, null, { capabilitiesPending: true }),
  )
  assertSmoke(
    pendingLauncherCommands.find((command) => command.kind === 'MarketOrder')?.disabled === true,
    'launcher should disable market orders while selected market capabilities are pending',
  )
  assertSmoke(
    pendingLauncherCommands.find((command) => command.kind === 'LimitOrder')?.disabled === true,
    'launcher should disable limit orders while selected market capabilities are pending',
  )
  assertSmoke(
    pendingLauncherCommands.find((command) => command.kind === 'TrailingEntryOrder')?.disabled ===
      true,
    'launcher should disable trailing entry while selected market capabilities are pending',
  )
  assertSmoke(
    bybitLauncherCommands.find((command) => command.kind === 'MarketOrder')?.disabled !== true,
    'Bybit launcher should keep market orders available',
  )
  assertSmoke(
    bybitLauncherCommands.find((command) => command.kind === 'TrailingEntryOrder')?.disabled !==
      true,
    'Bybit launcher should keep trailing entry available',
  )
  assertSmoke(
    bybitLauncherCommands.find((command) => command.kind === 'LimitOrder')?.disabled === true,
    'Bybit launcher should disable unsupported limit orders',
  )

  const commands = [binanceCommand, bybitProtocolFixtures.bybitCommandHistoryItem]
  const commandFacets = commandMarketFacets(commands)

  assertSmoke(
    uniqueFacetValues(commandFacets.values(), 'exchange').join(',') === 'binance,bybit',
    'command exchange facets should include Binance and Bybit',
  )
  assertSmoke(
    uniqueFacetValues(commandFacets.values(), 'product').join(',') === 'usd_m_futures,usdt_perp',
    'command product facets should preserve Binance futures and Bybit USDT perp products',
  )

  const bybitCommands = commands.filter((cmd) =>
    marketFacetMatchesFilters(commandFacets.get(cmd.command_id), {
      exchange: [ExchangeType.Bybit],
      account: [bybitProtocolFixtures.bybitAccountId],
      symbol: ['BTCUSDT'],
    }),
  )
  assertSmoke(
    bybitCommands.length === 1 &&
      bybitCommands[0].command_id === bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
    'Bybit command filter should hide Binance commands',
  )

  const bybitProtection = bybitNativeProtectionDevice()
  const bybitParent = bybitSplitParent(bybitProtection.id)
  bybitProtection.parent_device = bybitParent.id
  const devices = [binanceOrderDevice(), bybitParent, bybitProtection]
  const deviceFacets = deviceMarketFacets(devices, accounts)

  assertSmoke(
    deviceFacets.get(bybitParent.id)?.exchange === ExchangeType.Bybit,
    'parent split device should inherit Bybit market facet from child protection device',
  )
  assertSmoke(
    deviceFacets.get(bybitParent.id)?.account === bybitProtocolFixtures.bybitAccountId,
    'parent split device should inherit Bybit account facet from child protection device',
  )

  const bybitDevices = devices.filter((device) =>
    marketFacetMatchesFilters(deviceFacets.get(device.id), {
      exchange: [ExchangeType.Bybit],
      product: ['usdt_perp'],
      account: [bybitProtocolFixtures.bybitAccountId],
    }),
  )
  assertSmoke(
    sorted(bybitDevices.map((device) => device.id)).join(',') ===
      'device-bybit-native-protection,device-bybit-split-parent',
    'Bybit device filters should include the native protection device and inherited parent only',
  )

  const binanceDevices = devices.filter((device) =>
    marketFacetMatchesFilters(deviceFacets.get(device.id), {
      exchange: [ExchangeType.Binance],
      account: [binanceAccountId],
    }),
  )
  assertSmoke(
    binanceDevices.length === 1 && binanceDevices[0].id === 'device-binance-mo',
    'Binance device filter should not include Bybit native-protection devices',
  )

  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDeviceStore()
  const snapshotMessage = {
    device_id: 'device-bybit-np-snapshot',
    owner_user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    associated_command_id: bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
    created_at: '2026-06-19T00:00:00.000Z',
    complete: false,
    failed: false,
    canceled: false,
    awaiting_children: false,
    snapshot: {
      kind: 'NativeProtection',
      data: bybitProtocolFixtures.bybitNativeProtectionSnapshot,
    },
  } satisfies DeviceSnapshotLiteData
  store.handleDeviceSnapshotLite(snapshotMessage)
  const hydrated = store.devices.find((device) => device.id === snapshotMessage.device_id)
  assertSmoke(
    hydrated?.kind === 'NativeProtection',
    'Bybit NativeProtection snapshot should hydrate',
  )
  const hydratedState = hydrated.state as NativeProtectionState
  assertSmoke(
    hydratedState.observed_entry_order_ids.includes('mo-parent-1'),
    'Bybit NativeProtection snapshot should preserve observed entry order ids',
  )
  assertSmoke(
    hydratedState.observed_protection_order_ids.includes('child-sl-1'),
    'Bybit NativeProtection snapshot should preserve observed protection order ids',
  )

  const orderSnapshot = {
    device_id: 'device-bybit-mo',
    owner_user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    associated_command_id: bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
    created_at: '2026-06-19T00:00:00.000Z',
    complete: false,
    failed: false,
    canceled: false,
    awaiting_children: false,
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
        throttle: false,
        status: OrderStatus.NotYetSent,
        filled_qty: null,
        remote_id: null,
        remote_order_id: null,
        client_order_id: null,
        sent_at: null,
        last_status_check_at: null,
        last_update_seen_at: null,
      },
    },
  } satisfies DeviceSnapshotLiteData
  store.handleDeviceSnapshotLite(orderSnapshot)
  const orderDevice = store.devices.find((device) => device.id === orderSnapshot.device_id)
  assertSmoke(orderDevice?.kind === 'Order', 'Bybit Order snapshot should hydrate')
  store.handleDeviceUpdate('DeviceOrderDelta', {
    device_id: orderDevice.id,
    ts: '2026-06-19T00:00:01.000Z',
    seq: 1,
    delta: {
      kind: 'Submitted',
      data: {
        client_order_id: 'bybit-entry-live-1',
        remote_order_id: 'remote-bybit-entry-live-1',
        sent_at: '2026-06-19T00:00:01.000Z',
      },
    },
  } satisfies DeviceOrderDeltaEvent)
  const orderState = orderDevice.state as OrderState
  assertSmoke(
    orderState.client_order_id === 'bybit-entry-live-1',
    'Bybit MarketOrder Submitted delta should preserve client order id',
  )
  assertSmoke(
    orderState.remote_order_id === 'remote-bybit-entry-live-1',
    'Bybit MarketOrder Submitted delta should preserve remote order id',
  )

  const teSnapshot = {
    device_id: 'device-bybit-te',
    owner_user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    associated_command_id: bybitProtocolFixtures.bybitCommandHistoryItem.command_id,
    created_at: '2026-06-19T00:00:00.000Z',
    complete: false,
    failed: false,
    canceled: false,
    awaiting_children: false,
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
        risk_amount: 10,
        split_settings: null,
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
        lifecycle: TrailingEntryLifecycle.Running,
      },
    },
  } satisfies DeviceSnapshotLiteData
  store.handleDeviceSnapshotLite(teSnapshot)
  store.handleDeviceUpdate('DeviceTeDelta', {
    device_id: teSnapshot.device_id,
    ts: '2026-06-19T00:00:02.000Z',
    seq: 2,
    delta: {
      kind: 'OrderUpdate',
      data: {
        order_id: 'remote-bybit-entry-live-1',
        status: 'PARTIALLY_FILLED',
        cum_qty: 0.0005,
        price: 65_001.5,
      },
    },
  } satisfies DeviceTeDeltaEvent)
  assertSmoke(
    orderState.status === OrderStatus.PartiallyFilled,
    'Bybit TE OrderUpdate should apply matched MarketOrder status',
  )
  assertSmoke(
    orderState.filled_qty === 0.0005 && orderState.price === 65_001.5,
    'Bybit TE OrderUpdate should apply matched MarketOrder fill details',
  )
}

export async function runBybitNativeProtectionRenderSmoke(): Promise<void> {
  Object.assign(globalThis, {
    window: globalThis.window ?? { location: { origin: 'http://localhost:5173' } },
  })
  const { default: NativeProtectionDevice } = await import(
    '@/components/terminal/devices/NativeProtectionDevice.vue'
  )
  const bybitProtection = bybitNativeProtectionDevice()
  const nativeProtectionState = bybitProtection.state as NativeProtectionState
  const protectionState = {
    strategy: ProtectionStrategy.NativeAttachedTpsl,
    lifecycle: ProtectionLifecycle.Active,
    parent_client_order_id: 'bybit-entry-1',
    parent_remote_order_id: 'remote-bybit-entry-1',
    take_profit_trigger_price: 68_000,
    stop_loss_trigger_price: 62_000,
    protected_qty: 0.001,
    filled_qty: 0,
    last_reconciled_at: '2026-06-19T00:00:00.000Z',
  } satisfies ProtectionState

  const renderNativeProtection = async (
    device: NativeProtectionState,
    state: ProtectionState,
    failureReason?: string,
  ): Promise<string> => {
    const app = createSSRApp({
      render: () =>
        h(NativeProtectionDevice, {
          device,
          marketRef: bybitProtection.market_ref,
          protectionState: state,
          failureReason,
        }),
    })
    app.use(createPinia())
    return renderToString(app)
  }

  const html = await renderNativeProtection(nativeProtectionState, protectionState)
  const expectedNativeLabels = [
    'Native Protection',
    'Attached TP/SL',
    'Protection Summary',
    'Native TP/SL',
    'Take Profit',
    'Stop Loss',
    'Entry Updates',
    'Protection Updates',
    'Protection Filled',
    'Observed Order IDs',
    'bybit-sl-1',
    'Exchange TP',
    'Exchange SL',
    'TP/SL Mode',
    'Partial',
    'Parent Client',
    'Parent Remote',
    'bybit-entry-1',
    'remote-bybit-entry-1',
    'Bybit Testnet',
  ]
  for (const label of expectedNativeLabels) {
    assertSmoke(html.includes(label), `NativeProtection render should include "${label}"`)
  }

  const managedGuardLabels = [
    'Stop Guard Device',
    'Target Coverage',
    'Topup Seq',
    'Last Replacement',
  ]
  for (const label of managedGuardLabels) {
    assertSmoke(
      !html.includes(label),
      `NativeProtection render should not include managed StopGuard field "${label}"`,
    )
  }

  const rejectedNativeProtectionState = {
    ...nativeProtectionState,
    observed_entries: 1,
    observed_protection_orders: 1,
    status: NativeProtectionStatus.Rejected,
    last_order_status: 'Rejected',
    last_order_reason: 'native_protection_missing: observed 1 linked TP/SL orders, expected 2',
    last_update_seen_at: new Date('2026-06-19T00:00:05.000Z'),
  } satisfies NativeProtectionState
  const rejectedProtectionState = {
    ...protectionState,
    lifecycle: ProtectionLifecycle.Rejected,
    protected_qty: null,
    last_reconciled_at: '2026-06-19T00:00:05.000Z',
  } satisfies ProtectionState
  const failureReason =
    'Native Bybit TP/SL protection missing: observed 1 linked protection order, expected 2.'
  const rejectedHtml = await renderNativeProtection(
    rejectedNativeProtectionState,
    rejectedProtectionState,
    failureReason,
  )
  const expectedRejectedLabels = [
    'Rejected',
    'Order Status',
    'Order Reason',
    'native_protection_missing',
    'observed 1 linked TP/SL orders, expected 2',
    'Native Bybit TP/SL protection missing',
  ]
  for (const label of expectedRejectedLabels) {
    assertSmoke(
      rejectedHtml.includes(label),
      `Rejected NativeProtection render should include "${label}"`,
    )
  }

  const hyperliquidAccountId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const hyperliquidProtectionState = {
    ...nativeProtectionState,
    symbol: 'BTC',
    market_context: hyperliquidMarketContext(hyperliquidAccountId),
    execution_fills: [
      {
        exchange: ExchangeType.Hyperliquid,
        symbol: 'BTC',
        remote_order_id: '12347',
        client_order_id: '0xhl-tp-cloid',
        execution_id: '987654321',
        side: 'A',
        direction: 'Close Long',
        price: '51000',
        quantity: '0.001',
        execution_time_ms: 1_750_291_205_000,
        is_maker: false,
        fee: '0.02',
        fee_token: 'USDC',
        builder_fee: '0.005',
        closed_pnl: '1.23',
        start_position: '0.001',
        transaction_hash: '0xabcdef',
      },
    ],
    expected_entries: 1,
    observed_entries: 1,
    observed_protection_orders: 2,
    observed_entry_order_ids: ['0xhl-parent-cloid'],
    observed_protection_order_ids: ['0xhl-sl-cloid', '0xhl-tp-cloid'],
    tracked_parent_client_order_ids: ['trad-hl-open-1'],
    tracked_parent_remote_order_ids: ['12345'],
    last_client_order_id: '0xhl-tp-cloid',
    last_parent_client_order_id: 'trad-hl-open-1',
    last_remote_order_id: '12347',
    last_order_status: 'open',
    last_order_reason: null,
    last_take_profit: null,
    last_stop_loss: null,
    last_tpsl_mode: null,
  } satisfies NativeProtectionState
  const hyperliquidMarketRef = {
    exchange: ExchangeType.Hyperliquid,
    network: NetworkType.Testnet,
    product: 'usdc_perp' as const,
    trading_account_id: hyperliquidAccountId,
    trading_account_label: 'Hyperliquid Testnet',
    symbol: 'BTC',
  }
  const hyperliquidApp = createSSRApp({
    render: () =>
      h(NativeProtectionDevice, {
        device: hyperliquidProtectionState,
        marketRef: hyperliquidMarketRef,
        protectionState,
      }),
  })
  hyperliquidApp.use(createPinia())
  const hyperliquidHtml = await renderToString(hyperliquidApp)
  for (const label of [
    'Order Grouping',
    'normalTpsl',
    'Trigger Execution',
    'Reduce only',
    '0xhl-sl-cloid',
    '0xhl-tp-cloid',
    'Hyperliquid Testnet',
    'Execution',
    'Total Fee',
    '0.02 USDC',
    'Builder Component',
    '0.005 USDC',
    'Exchange Component',
    '0.015 USDC',
    'Reported Closed PnL',
    '1.23 USDC',
    'Fills (1)',
  ]) {
    assertSmoke(
      hyperliquidHtml.includes(label),
      `Hyperliquid NativeProtection render should include "${label}"`,
    )
  }
  for (const bybitOnlyLabel of ['Exchange TP', 'Exchange SL', 'TP/SL Mode']) {
    assertSmoke(
      !hyperliquidHtml.includes(bybitOnlyLabel),
      `Hyperliquid NativeProtection render should omit Bybit field "${bybitOnlyLabel}"`,
    )
  }

  const hyperliquidFlatApp = createSSRApp({
    render: () =>
      h(NativeProtectionDevice, {
        device: {
          ...hyperliquidProtectionState,
          status: NativeProtectionStatus.Flat,
          protection_filled_qty: 0.001,
          last_order_status: 'FILLED',
          last_order_reason: 'Exchange SL filled',
        },
        marketRef: hyperliquidMarketRef,
        protectionState: {
          ...protectionState,
          lifecycle: ProtectionLifecycle.Complete,
          filled_qty: 0.001,
        },
      }),
  })
  hyperliquidFlatApp.use(createPinia())
  const hyperliquidFlatHtml = await renderToString(hyperliquidFlatApp)
  for (const label of ['Flat', 'Complete', 'Exchange SL filled', '0.001000']) {
    assertSmoke(
      hyperliquidFlatHtml.includes(label),
      `completed Hyperliquid NativeProtection render should include "${label}"`,
    )
  }
}
