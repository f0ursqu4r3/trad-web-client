// ==============================================================================================
// TypeScript mapping of Rust protocol (serde JSON) — client/server must match PROTOCOL_VERSION
// ==============================================================================================

export type Uuid = string

// Keep protocol version in sync with server (Rust constant)
export const PROTOCOL_VERSION = 5

export const NULL_UUID = '00000000-0000-0000-0000-000000000000'

// ==============================================================================================
// External/shared domain types (placeholders — align with server definitions)
// ==============================================================================================

export type OrderSide = 'Buy' | 'Sell'
export type PositionSide = 'Long' | 'Short'
export type MarketAction = 'Buy' | 'Sell' | 'Close' | 'CloseAll' | string

export enum NetworkType {
  Testnet = 'testnet',
  Mainnet = 'mainnet',
}
export enum ExchangeType {
  Binance = 'binance',
}

export type DeviceKind =
  | 'TrailingEntry'
  | 'MarketOrder'
  | 'Split'
  | 'StopGuard'
  | 'Unknown'
  | string

export interface MarketContext {
  name?: string
  network?: NetworkType
  [k: string]: unknown
}

export interface Market {
  symbol?: string
  [k: string]: unknown
}

export interface DeviceMarketInfo {
  symbol?: string
  description?: string
  [k: string]: unknown
}

export type TrailingEntryPhase =
  | 'Idle'
  | 'Arming'
  | 'Armed'
  | 'Triggered'
  | 'Completed'
  | 'Failed'
  | string
export type TrailingEntryLifecycle = unknown
export type MarketOrderStatus =
  | 'Unsent'
  | 'Pending'
  | 'Running'
  | 'Filled'
  | 'Cancelled'
  | 'Failed'
  | string
export type StopGuardStatus = 'Idle' | 'Placing' | 'Active' | 'Cancelled' | 'Failed' | string

// ==============================================================================================
// Protocol-specific enums (match Rust variant names)
// ==============================================================================================

export type TestType = 'ServerError' | 'ServerMessage'

export type DeviceFilter = 'All' | 'Complete' | 'Incomplete'

export enum CommandStatus {
  Unsent = 'Unsent',
  Pending = 'Pending',
  Malformed = 'Malformed',
  Running = 'Running',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}

export type SimMarketAction =
  | 'Reset'
  | 'Restart'
  | 'Stop'
  | 'Start'
  | 'SetSpeed'
  | 'ResetSpeed'
  | 'FastForward'

export function parseSimMarketAction(input: string): SimMarketAction | undefined {
  const s = input.trim().toUpperCase()
  switch (s) {
    case 'RESET':
      return 'Reset'
    case 'RESTART':
      return 'Restart'
    case 'STOP':
      return 'Stop'
    case 'START':
      return 'Start'
    case 'SET_SPEED':
      return 'SetSpeed'
    case 'RESET_SPEED':
      return 'ResetSpeed'
    case 'FAST_FORWARD':
      return 'FastForward'
    default:
      return undefined
  }
}

// ==============================================================================================
// Client → Server
// ==============================================================================================

export type ClientToServerMessage = {
  client_id: Uuid
  command_id: Uuid
  payload: ClientToServerMessagePayload
}

export type ClientToServerMessagePayload =
  | {
      kind: 'UserCommand'
      data: {
        raw_text: string
        command: UserCommandPayload
      }
    }
  | { kind: 'System'; data: SystemMessagePayload }

// System/internal messages
export type SystemMessagePayload =
  | { kind: 'Ping'; data: PingData }
  | { kind: 'GetDeviceMarketInfo'; data: GetDeviceMarketInfoRequest }
  | { kind: 'SyncDevice'; data: SyncDeviceRequest }
  | { kind: 'TePointsPageRequest'; data: TePointsPageRequest }
  | { kind: 'ListCommandDevicesRequest'; data: ListCommandDevicesRequest }
  | { kind: 'InspectStart'; data: InspectStartRequest }
  | { kind: 'InspectReadyAck'; data: InspectReadyAckData }
  | { kind: 'ResyncDevice'; data: ResyncDeviceRequest }
  | { kind: 'CancelCommand'; data: CancelCommandRequest }
  | { kind: 'RefreshAccountKeys'; data: RefreshAccountKeysMessage }
  | { kind: 'GetBalance'; data: GetBalanceRequest }
  | { kind: 'ListPositions'; data: ListPositionsRequest }
  | { kind: 'ListDevices'; data: ListDevicesCommand }
  | { kind: 'GetDeviceTree'; data: GetDeviceTreeCommand }
  | { kind: 'Hello'; data: HelloData }

export type CancelCommandRequest = {
  command_id: Uuid
}

export type HelloData = {
  protocol_version: number
  client_name: string
  build?: string | null
}

export type RefreshAccountKeysMessage = {
  account_id: Uuid
  user_token: string
  label?: string | null
}

export type GetBalanceRequest = {
  market_context: MarketContext
}

export type ListPositionsRequest = {
  market_context: MarketContext
}

// Command structs (anonymous + authenticated)
export type PingData = { client_send_time: number }
export type EchoCommand = { message: string }
export type TokenLoginCommand = { token: string }
export type TestCommand = { test_type: TestType }
export type GetPriceCommand = { symbol: string; market_context: MarketContext }
export type LogoutCommand = { all_sessions: boolean }
export type CreateTradeWatchCommand = { symbol: string; market_context: MarketContext }
export type SetLeverageCommand = {
  symbol: string
  leverage: number
  market_context: MarketContext
}
export type MarketOrderCommand = {
  action: MarketAction
  symbol: string
  quantity_usd: number
  position_side: PositionSide
  market_context: MarketContext
}
export type SplitMarketOrderCommand = {
  num_splits: number
  action: MarketAction
  symbol: string
  quantity_usd: number
  position_side: PositionSide
  market_context: MarketContext
}
export type LimitOrderCommand = {
  side: OrderSide
  symbol: string
  quantity: number
  price: number
  position_side: PositionSide
  market_context: MarketContext
}
export type TrailingEntryOrderCommand = {
  position_side: PositionSide
  symbol: string
  activation_price: number
  jump_frac_threshold: number
  stop_loss: number
  risk_amount: number
  market_context: MarketContext
}
export type ListDevicesCommand = { filter: DeviceFilter }
export type GetDeviceTreeCommand = { device_id: Uuid }
export type CancelDeviceCommand = { device_id: Uuid }
export type SetHedgeModeCommand = { enabled: boolean; market_context: MarketContext }
export type CancelPositionCommand = { symbol: string; market_context: MarketContext }
export type GetSymbolPrecisionCommand = { symbol: string; market_context: MarketContext }
export type CreateHistoricSimMarketCommand = { scenario_name: string; nickname: string }
export type SimMarketCoinSettings = { coin_name: string; center: number; variance: number }
export type CreateSimMarketCommand = {
  scenario_type: string
  name: string
  coin_settings: SimMarketCoinSettings[]
}
export type ControlSimMarketCommand = {
  action: SimMarketAction
  identifier: string
  value?: number | null
}
export type DeleteSimMarketCommand = { identifier: string }

export type GetDeviceMarketInfoRequest = { device_id: Uuid }
export type SyncDeviceRequest = { device_id: Uuid }
export type InspectStartRequest = { command_id: Uuid }
export type InspectReadyAckData = { command_id: Uuid }
export type ResyncDeviceRequest = {
  device_id: Uuid
  since_seq?: number | null
  since_ts?: string | null // ISO timestamp
}
export type TePointsPageRequest = { device_id: Uuid; since_index: number; max_points: number }
export type ListCommandDevicesRequest = { command_id: Uuid }

export type UserCommandPayload =
  | { kind: 'Echo'; data: EchoCommand }
  | { kind: 'ListUsers'; data?: undefined }
  | { kind: 'TokenLogin'; data: TokenLoginCommand }
  | { kind: 'Test'; data: TestCommand }
  | { kind: 'GetPrice'; data: GetPriceCommand }
  | { kind: 'Logout'; data: LogoutCommand }
  | { kind: 'CreateTradeWatch'; data: CreateTradeWatchCommand }
  | { kind: 'SetLeverage'; data: SetLeverageCommand }
  | { kind: 'MarketOrder'; data: MarketOrderCommand }
  | { kind: 'SplitMarketOrder'; data: SplitMarketOrderCommand }
  | { kind: 'LimitOrder'; data: LimitOrderCommand }
  | { kind: 'TrailingEntryOrder'; data: TrailingEntryOrderCommand }
  | { kind: 'CreateTestDeviceA'; data?: undefined }
  | { kind: 'CancelDevice'; data: CancelDeviceCommand }
  | { kind: 'SetHedgeMode'; data: SetHedgeModeCommand }
  | { kind: 'CancelPosition'; data: CancelPositionCommand }
  | { kind: 'GetSymbolPrecision'; data: GetSymbolPrecisionCommand }
  | { kind: 'ListHistoricMarkets'; data?: undefined }
  | { kind: 'CreateHistoricSimMarket'; data: CreateHistoricSimMarketCommand }
  | { kind: 'ListSimMarkets'; data?: undefined }
  | { kind: 'CreateSimMarket'; data: CreateSimMarketCommand }
  | { kind: 'ControlSimMarket'; data: ControlSimMarketCommand }
  | { kind: 'DeleteSimMarket'; data: DeleteSimMarketCommand }
  | { kind: 'CancelAllDevicesCommand'; data?: undefined }
  | { kind: 'ListDevices'; data: ListDevicesCommand }
  | { kind: 'GetDeviceTree'; data: GetDeviceTreeCommand }

// ==============================================================================================
// Server → Client
// ==============================================================================================

export type ServerToClientMessage = {
  uuid: Uuid
  payload: ServerToClientPayload
}

export type ServerToClientPayload =
  | { kind: 'ClientIdAssignment'; data: ClientIdAssignmentData }
  | { kind: 'Welcome'; data: WelcomeData }
  | { kind: 'ClientJoined'; data: ClientJoinedData }
  | { kind: 'ClientLeft'; data: ClientLeftData }
  | { kind: 'CommandResponse'; data: CommandResponseData }
  | { kind: 'Message'; data: MessageData }
  | { kind: 'Alert'; data: AlertData }
  | { kind: 'ChatMessage'; data: ChatMessageData }
  | { kind: 'ServerError'; data: ServerErrorData }
  | { kind: 'FatalServerError'; data: FatalServerErrorData }
  | { kind: 'Pong'; data: PongData }
  | { kind: 'ServerHello'; data: ServerHelloData }
  | { kind: 'SetUser'; data: SetUserData }
  | { kind: 'UnsetUser'; data: UnsetUserData }
  | { kind: 'DeviceMarketInfoResponse'; data: DeviceMarketInfoResponseData }
  | { kind: 'DeviceSnapshotLite'; data: DeviceSnapshotLiteData }
  | { kind: 'TePointsPage'; data: TePointsPageData }
  | { kind: 'CommandDevicesList'; data: CommandDevicesListData }
  | { kind: 'SetCommandStatus'; data: SetCommandStatusData }
  | { kind: 'CommandHistory'; data: CommandHistoryData }
  | { kind: 'InspectReady'; data: InspectReadyData }
  | { kind: 'DeviceLifecycle'; data: DeviceLifecycleEvent }
  | { kind: 'DeviceTeDelta'; data: DeviceTeDeltaEvent }
  | { kind: 'DeviceMoDelta'; data: DeviceMoDeltaEvent }
  | { kind: 'DeviceSgDelta'; data: DeviceSgDeltaEvent }
  | { kind: 'DeviceSplitDelta'; data: DeviceSplitDeltaEvent }
  | { kind: 'AccountBalanceSnapshot'; data: AccountBalanceData }
  | { kind: 'PositionsSnapshot'; data: PositionsSnapshotData }
  | { kind: 'DevicesList'; data: DevicesListData }
  | { kind: 'DeviceTree'; data: DeviceTreeData }
  | { kind: 'UserInfo'; data: UserInfoData }

// Payload structs (Server → Client)
export type ClientIdAssignmentData = { new_client_id: Uuid }
export type WelcomeData = { server_message: string }
export type ClientJoinedData = { client_id: Uuid }
export type ClientLeftData = { username?: string | null; client_id: Uuid }
export type CommandResponseData = { request_uuid: Uuid; message: string }
export type MessageData = { message: string }
export type AlertData = { message: string }
export type ChatMessageData = { from: string; message: string }
export type ServerErrorData = { request_uuid?: Uuid | null; error: string }
export type FatalServerErrorData = { error: string }
export type ServerHelloData = {
  protocol_version: number
  server_name: string
  build?: string | null
}
export type InspectReadyData = { command_id: Uuid; barrier_ts: string }
export type PongData = { client_send_time: number }
export type SetUserData = { user_id: Uuid; username: string }
export type UnsetUserData = Record<string, never>

export type DeviceMarketInfoResponseData = {
  device_id: Uuid
  market_context: MarketContext
  description: string
}

export type AccountBalanceAsset = {
  asset: string
  free: number
  locked: number
}

export type AccountBalanceData = {
  market_context: MarketContext
  assets: AccountBalanceAsset[]
}

export type PositionSummary = {
  symbol: string
  position_side: PositionSide
  amount: number
  entry_price: number
  unrealized_pnl: number
}

export type PositionsSnapshotData = {
  market_context: MarketContext
  positions: PositionSummary[]
}

export type DeviceRunState =
  | 'Running'
  | 'CompletedOk'
  | 'CompletedFailed'
  | 'CompletedCanceled'
  | string

export type DevicesListItem = {
  device_id: Uuid
  kind?: string | null
  symbol?: string | null
  state: DeviceRunState
}

export type DevicesListData = {
  devices: DevicesListItem[]
}

export type DeviceTreeNode = {
  device_id: Uuid
  parent_device_id?: Uuid | null
  kind?: string | null
  symbol?: string | null
  state: DeviceRunState
}

export type DeviceTreeData = {
  root_device_id: Uuid
  nodes: DeviceTreeNode[]
}

export type UserInfoData = {
  user_id: Uuid
  username: string
}

export type TePointsPageData = {
  device_id: Uuid
  start_index: number
  next_index: number
  total_len: number
  points: number[]
}

export type CommandDevicesListData = {
  command_id: Uuid
  device_ids: Uuid[]
  device_kinds: Record<Uuid, DeviceKind>
}

export type CommandHistoryItem = {
  command_id: Uuid
  name: string
  text: string
  status: CommandStatus
}

export type CommandHistoryData = {
  items: CommandHistoryItem[]
}

export type SetCommandStatusData = {
  command_id: Uuid
  status: CommandStatus
}

// Lite device snapshot types
export type DeviceSnapshotLiteData = {
  device_id: Uuid
  owner_user_id: Uuid
  associated_command_id: Uuid
  parent_device?: Uuid | null
  children_devices?: Uuid[] | null
  complete: boolean
  failed: boolean
  canceled: boolean
  awaiting_children: boolean
  snapshot: DeviceSnapshotLite
}

export type DeviceSnapshotLite =
  | { kind: 'TrailingEntry'; data: TrailingEntrySnapshot }
  | { kind: 'MarketOrder'; data: MarketOrderSnapshot }
  | { kind: 'Split'; data: SplitSnapshot }
  | { kind: 'StopGuard'; data: StopGuardSnapshot }

export type TrailingEntrySnapshot = {
  // parameters
  symbol: string
  market_context: MarketContext
  position_side: PositionSide
  activation_price: number
  jump_frac_threshold: number
  stop_loss: number
  risk_amount: number
  // state
  phase: TrailingEntryPhase
  peak: number
  peak_index: number
  // result
  position_size: number
  actual_activation_price: number
  buy_or_sell_price: number
  completed: boolean
  cancelled: boolean
  succeeded: boolean
  stop_loss_hit: boolean
  // review/meta
  base_index: number
  total_points: number
  start_trigger_index?: number | null
  end_trigger_index?: number | null
  lifecycle?: TrailingEntryLifecycle
}

export type MarketOrderSnapshot = {
  market_context: MarketContext
  symbol: string
  order_side: OrderSide
  quantity: number
  position_side: PositionSide
  price: number
  status: MarketOrderStatus
  remote_id?: number | null
  client_order_id?: string | null
}

export type SplitSnapshot = {
  symbol: string
  quantity: number
  price: number
}

export type StopGuardSnapshot = {
  symbol: string
  market_context: MarketContext
  position_side: PositionSide
  stop_price: number
  covered_qty: number
  target_coverage: number
  client_order_id?: string | null
  remote_order_id?: number | null
  topup_seq: number
  sent_at?: string | null
  last_update_seen_at?: string | null
  last_status_check_at?: string | null
  last_replacement_at?: string | null
  status: StopGuardStatus
  pending_replacement_from?: string | null
}

// ==============================================================================================
// Generic device lifecycle events
// ==============================================================================================

export type DeviceLifecycle =
  | { kind: 'Created' }
  | { kind: 'Running' }
  | { kind: 'AwaitingFill' }
  | { kind: 'Completed'; data: { ok: boolean; canceled: boolean } }
  | { kind: 'Error'; data: { code: string; msg: string } }

export type DeviceLifecycleEvent = {
  device_id: Uuid
  ts: string // ISO timestamp
  seq: number
  event: DeviceLifecycle
}

// ==============================================================================================
// Typed device delta streams
// ==============================================================================================

export type DeviceTeDelta =
  | {
      kind: 'Init'
      data: {
        command_id: Uuid
        symbol: string
        market_context: MarketContext
        position_side: PositionSide
        activation_price: number
        jump_frac_threshold: number
        stop_loss: number
        risk_amount: number
        phase: TrailingEntryPhase
        peak: number
        peak_index: number
        base_index: number
        total_points: number
        lifecycle: TrailingEntryLifecycle
      }
    }
  | { kind: 'PointsInit'; data: { start_idx: number; points: number[]; total_len: number } }
  | { kind: 'Point'; data: { idx: number; price: number } }
  | { kind: 'Peak'; data: { price: number } }
  | { kind: 'Phase'; data: { from: string; to: string } }
  | { kind: 'Lifecycle'; data: { status: TrailingEntryLifecycle } }
  | { kind: 'TrailingStop'; data: { price: number } }
  | {
      kind: 'Review'
      data: { start_trigger_index?: number | null; end_trigger_index?: number | null }
    }
  | {
      kind: 'OrderUpdate'
      data: { order_id: number; status: string; cum_qty?: number | null; price?: number | null }
    }

export type DeviceTeDeltaEvent = {
  device_id: Uuid
  ts: string // ISO timestamp
  seq: number
  delta: DeviceTeDelta
}

export type DeviceMoDelta =
  | {
      kind: 'Init'
      data: {
        parent_device?: Uuid | null
        command_id: Uuid
        market_context: MarketContext
        symbol: string
        order_side: OrderSide
        position_side: PositionSide
        quantity: number
        price: number
        status: MarketOrderStatus
        client_order_id?: string | null
      }
    }
  | { kind: 'Submitted'; data: { qty?: number | null; price?: number | null } }
  | {
      kind: 'PartiallyFilled'
      data: { cum_qty?: number | null; last_qty?: number | null; price?: number | null }
    }
  | { kind: 'Filled'; data: { cum_qty?: number | null; price?: number | null } }
  | { kind: 'Canceled' }
  | { kind: 'Rejected'; data: { order_id?: string | null; reason?: string | null } }

export type DeviceMoDeltaEvent = {
  device_id: Uuid
  ts: string // ISO timestamp
  seq: number
  delta: DeviceMoDelta
}

export type DeviceSgDelta =
  | {
      kind: 'Init'
      data: {
        parent_device?: Uuid | null
        command_id: Uuid
        symbol: string
        market_context: MarketContext
        position_side: PositionSide
        stop_price: number
        covered_qty: number
        target_coverage: number
        client_order_id?: string | null
        remote_order_id?: number | null
        topup_seq: number
        sent_at?: string | null
        last_update_seen_at?: string | null
        last_status_check_at?: string | null
        last_replacement_at?: string | null
        status: StopGuardStatus
      }
    }
  | { kind: 'Submitted'; data: { order_id: string; quantity: number; topup_seq: number } }
  | {
      kind: 'Replaced'
      data: {
        old_order_id: string
        new_order_id: string
        new_quantity: number
        reason: string
        topup_seq: number
      }
    }
  | {
      kind: 'PartiallyFilled'
      data: { order_id: string; cum_qty?: number | null; last_qty?: number | null }
    }
  | { kind: 'Filled'; data: { order_id: string; cum_qty?: number | null } }
  | { kind: 'Canceled'; data: { order_id: string; reason: string } }
  | { kind: 'Rejected'; data: { order_id?: string | null; reason?: string | null } }
  | { kind: 'Threshold'; data: { price: number } }
  | { kind: 'Triggered'; data: { at_price: number } }
  | { kind: 'OrderUpdate'; data: { status: string } }
  | {
      kind: 'Coverage'
      data: { covered_qty: number; target_coverage: number; topup_seq: number }
    }

export type DeviceSgDeltaEvent = {
  device_id: Uuid
  ts: string // ISO timestamp
  seq: number
  delta: DeviceSgDelta
}

export type DeviceSplitDelta =
  | {
      kind: 'Init'
      data: {
        parent_device?: Uuid | null
        command_id: Uuid
        symbol: string
        price: number
        quantity: number
        expected_children: number
      }
    }
  | { kind: 'ChildAdded'; data: { child_id: Uuid } }
  | { kind: 'ChildState'; data: { child_id: Uuid; state: string } }

export type DeviceSplitDeltaEvent = {
  device_id: Uuid
  ts: string // ISO timestamp
  seq: number
  delta: DeviceSplitDelta
}
