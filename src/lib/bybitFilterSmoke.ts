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
  type CommandHistoryItem,
  type DeviceSnapshotLiteData,
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
  marketContextAccountId,
  type AccountDisplayRecord,
} from '@/lib/marketContext'
import {
  commandMarketFacets,
  deviceMarketFacets,
  marketFacetMatchesFilters,
  uniqueFacetValues,
} from '@/lib/marketFilterFacets'
import { bybitTrailingEntryExitLevelError } from '@/lib/bybitOrderValidation'
import { commandWithMarketAvailability } from '@/lib/commandAvailability'
import { commandRegistry } from '@/components/terminal/commands/commandRegistry'
import {
  accountMetadataChips,
  accountMetadataStatus,
  isBybitMetadataVerified,
  type AccountMetadataLike,
} from '@/lib/accountMetadata'
import {
  useDeviceStore,
  type Device,
  type MarketOrderState,
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

const binanceAccountId = '11111111-1111-1111-1111-111111111111'
const binanceContext = binanceMarketContext(binanceAccountId)

const binancePayload = {
  kind: 'MarketOrder',
  data: {
    action: MarketAction.Open,
    symbol: 'ETHUSDT',
    quantity_usd: 100,
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
  metadata: Pick<
    NonNullable<AccountMetadataLike['exchange_metadata']>,
    'account_mode' | 'margin_mode'
  >,
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

function binanceMarketOrderDevice(): Device {
  return baseDevice('device-binance-mo', 'MarketOrder', binanceCommand.command_id, {
    market_context: binanceContext,
    market_action: MarketAction.Open,
    symbol: 'ETHUSDT',
    order_side: OrderSide.Sell,
    quantity: 0.1,
    position_side: PositionSide.Short,
    price: 3500,
    throttle: false,
    status: MarketOrderStatus.AlreadySentAndAwaitingFilling,
    filled_qty: null,
    remote_id: null,
    remote_order_id: null,
    client_order_id: 'binance-entry-1',
    sent_at: null,
    last_status_check_at: null,
    last_update_seen_at: null,
  } satisfies MarketOrderState)
}

function bybitNativeProtectionDevice(): Device {
  const state = {
    symbol: 'BTCUSDT',
    market_context: bybitProtocolFixtures.bybitContext,
    position_side: PositionSide.Long,
    take_profit: 68_000,
    stop_loss: 62_000,
    expected_entries: 2,
    observed_entries: 1,
    observed_protection_orders: 1,
    observed_entry_order_ids: ['bybit-entry-1'],
    observed_protection_order_ids: ['bybit-sl-1'],
    tracked_parent_client_order_ids: ['bybit-entry-1'],
    tracked_parent_remote_order_ids: ['remote-bybit-entry-1'],
    entry_filled_qty: 0.001,
    protection_filled_qty: 0,
    status: NativeProtectionStatus.Tracking,
    last_client_order_id: 'bybit-entry-1',
    last_parent_client_order_id: null,
    last_remote_order_id: null,
    last_order_status: 'PARTIALLY_FILLED',
    last_order_reason: null,
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
  const devices = [binanceMarketOrderDevice(), bybitParent, bybitProtection]
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
  assertSmoke(hydrated?.kind === 'NativeProtection', 'Bybit NativeProtection snapshot should hydrate')
  const hydratedState = hydrated.state as NativeProtectionState
  assertSmoke(
    hydratedState.observed_entry_order_ids.includes('mo-parent-1'),
    'Bybit NativeProtection snapshot should preserve observed entry order ids',
  )
  assertSmoke(
    hydratedState.observed_protection_order_ids.includes('child-sl-1'),
    'Bybit NativeProtection snapshot should preserve observed protection order ids',
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

  const app = createSSRApp({
    render: () =>
      h(NativeProtectionDevice, {
        device: nativeProtectionState,
        marketRef: bybitProtection.market_ref,
        protectionState,
      }),
  })
  app.use(createPinia())

  const html = await renderToString(app)
  const expectedNativeLabels = [
    'Native Protection',
    'Attached TP/SL',
    'Protection Summary',
    'Native TP/SL',
    'Take Profit',
    'Stop Loss',
    'Entry Updates',
    'Protection Updates',
    'Observed Order IDs',
    'bybit-sl-1',
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
}
