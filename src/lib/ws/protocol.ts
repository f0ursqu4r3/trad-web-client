// ==============================================================================================
// TypeScript mapping of Rust protocol (serde JSON) — client/server must match PROTOCOL_VERSION
// ==============================================================================================

export type Uuid = string

// Keep protocol version in sync with server (Rust constant)
export const PROTOCOL_VERSION = 2

export const NULL_UUID = '00000000-0000-0000-0000-000000000000'

// ==============================================================================================
// External/shared domain types (placeholders — align with server definitions)
// ==============================================================================================

// If your server uses specific string values, adjust these literal unions accordingly.
export type OrderSide = 'Buy' | 'Sell'
export type PositionSide = 'Long' | 'Short'
export type MarketAction = 'Buy' | 'Sell' | 'Close' | 'CloseAll' | string
export type NetworkType = 'Binance' | 'Sim' | string

export type DeviceKind =
  | 'TrailingEntry'
  | 'MarketOrder'
  | 'Split'
  | 'StopGuard'
  | 'Unknown'
  | string

// Market/MarketContext/DeviceMarketInfo are placeholders; extend to match server JSON
export interface MarketContext {
  name?: string
  network?: NetworkType
  // ... add fields as needed
  [k: string]: unknown
}

export interface Market {
  symbol?: string
  // ... add fields as needed
  [k: string]: unknown
}

export interface DeviceMarketInfo {
  symbol?: string
  description?: string
  // ... add fields as needed
  [k: string]: unknown
}

// Device-specific status enums — define as string unions for forward-compatibility
export type TrailingEntryPhase =
  | 'Idle'
  | 'Arming'
  | 'Armed'
  | 'Triggered'
  | 'Completed'
  | 'Failed'
  | string
export type MarketOrderStatus = 'Unsent' | 'Pending' | 'Filled' | 'Cancelled' | 'Failed' | string
export type StopGuardStatus = 'Idle' | 'Placing' | 'Active' | 'Cancelled' | 'Failed' | string

// ==============================================================================================
// Protocol-specific enums (match Rust variant names)
// ==============================================================================================

export type TestType = 'ServerError' | 'ServerMessage'

export type DeviceFilter = 'All' | 'Complete' | 'Incomplete'

export type CommandStatus = 'Unsent' | 'Pending' | 'Malformed' | 'Running' | 'Succeeded' | 'Failed'

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
  | { kind: 'InspectCommand'; data: InspectCommandRequest }
  | { kind: 'SyncDevice'; data: SyncDeviceRequest }
  | { kind: 'TePointsPageRequest'; data: TePointsPageRequest }
  | { kind: 'ListCommandDevicesRequest'; data: ListCommandDevicesRequest }
  | { kind: 'CancelCommand'; data: CancelCommandRequest }
  | { kind: 'Hello'; data: HelloData }

export type CancelCommandRequest = {
  command_id: Uuid
}

export type HelloData = {
  protocol_version: number
  client_name: string
  build?: string | null
}

// Command structs (anonymous + authenticated)
export type PingData = { client_send_time: number }
export type EchoCommand = { message: string }
export type CreateUserCommand = { username: string; password: string }
export type LoginCommand = { username: string; password: string }
export type TestCommand = { test_type: TestType }
export type GetPriceCommand = { symbol: string }
export type LogoutCommand = { all_sessions: boolean }
export type CreateTradeWatchCommand = { symbol: string }
export type SetLeverageCommand = { symbol: string; leverage: number }
export type MarketOrderCommand = {
  action: MarketAction
  symbol: string
  quantity_usd: number
  position_side: PositionSide
}
export type SplitMarketOrderCommand = {
  num_splits: number
  action: MarketAction
  symbol: string
  quantity_usd: number
  position_side: PositionSide
}
export type LimitOrderCommand = {
  side: OrderSide
  symbol: string
  quantity: number
  price: number
  position_side: PositionSide
}
export type TrailingEntryOrderCommand = {
  position_side: PositionSide
  symbol: string
  activation_price: number
  jump_frac_threshold: number
  stop_loss: number
  risk_amount: number
}
export type ListAccountsCommand = { show_connections: boolean }
export type CreateAccountCommand = {
  network: NetworkType
  name: string
  api_key: string
  secret_key: string
}
export type DeleteAccountCommand = { name: string }
export type UseBinanceCommand = { account_name: string }
export type UseSimMarketCommand = { sim_market_name: string }
export type ListDevicesCommand = { filter: DeviceFilter }
export type GetDeviceTreeCommand = { device_id: Uuid }
export type CancelDeviceCommand = { device_id: Uuid }
export type SetHedgeModeCommand = { enabled: boolean }
export type CancelPositionCommand = { symbol: string }
export type GetSymbolPrecisionCommand = { symbol: string }
export type CreateHistoricSimMarketCommand = { scenario_name: string; nickname: string }
export type SimMarketCoinSettings = { coin_name: string; center: number; variance: number }
export type CreateSimMarketCommand = {
  scenario_type: string
  name: string
  coin_settings: SimMarketCoinSettings[]
}
export type SetActiveMarketCommand = { name: string }
export type ControlSimMarketCommand = {
  action: SimMarketAction
  identifier: string
  value?: number | null
}
export type DeleteSimMarketCommand = { identifier: string }

export type GetDeviceMarketInfoRequest = { device_id: Uuid }
export type InspectCommandRequest = { command_id: Uuid; command_box_id: Uuid }
export type SyncDeviceRequest = { device_id: Uuid }
export type TePointsPageRequest = { device_id: Uuid; since_index: number; max_points: number }
export type ListCommandDevicesRequest = { command_id: Uuid }

// User-submitted commands
export type UserCommandPayload =
  | { kind: 'CancelAllDevicesCommand'; data?: undefined }
  | { kind: 'CancelDevice'; data: CancelDeviceCommand }
  | { kind: 'CancelPosition'; data: CancelPositionCommand }
  | { kind: 'ControlSimMarket'; data: ControlSimMarketCommand }
  | { kind: 'CreateAccount'; data: CreateAccountCommand }
  | { kind: 'CreateHistoricSimMarket'; data: CreateHistoricSimMarketCommand }
  | { kind: 'CreateSimMarket'; data: CreateSimMarketCommand }
  | { kind: 'CreateTestDeviceA'; data?: undefined }
  | { kind: 'CreateTradeWatch'; data: CreateTradeWatchCommand }
  | { kind: 'CreateUser'; data: CreateUserCommand }
  | { kind: 'DeleteAccount'; data: DeleteAccountCommand }
  | { kind: 'DeleteSimMarket'; data: DeleteSimMarketCommand }
  | { kind: 'Echo'; data: EchoCommand }
  | { kind: 'GetBalance'; data?: undefined }
  | { kind: 'GetDeviceTree'; data: GetDeviceTreeCommand }
  | { kind: 'GetPrice'; data: GetPriceCommand }
  | { kind: 'GetSymbolPrecision'; data: GetSymbolPrecisionCommand }
  | { kind: 'GetUserInfo'; data?: undefined }
  | { kind: 'LimitOrder'; data: LimitOrderCommand }
  | { kind: 'ListAccounts'; data: ListAccountsCommand }
  | { kind: 'ListDevices'; data: ListDevicesCommand }
  | { kind: 'ListHistoricMarkets'; data?: undefined }
  | { kind: 'ListPositions'; data?: undefined }
  | { kind: 'ListSimMarkets'; data?: undefined }
  | { kind: 'ListUsers'; data?: undefined }
  | { kind: 'Login'; data: LoginCommand }
  | { kind: 'Logout'; data: LogoutCommand }
  | { kind: 'MarketOrder'; data: MarketOrderCommand }
  | { kind: 'SetHedgeMode'; data: SetHedgeModeCommand }
  | { kind: 'SetLeverage'; data: SetLeverageCommand }
  | { kind: 'SplitMarketOrder'; data: SplitMarketOrderCommand }
  | { kind: 'Test'; data: TestCommand }
  | { kind: 'TrailingEntryOrder'; data: TrailingEntryOrderCommand }
  | { kind: 'UseBinance'; data: UseBinanceCommand }
  | { kind: 'UseSimMarket'; data: UseSimMarketCommand }

// ==============================================================================================
// Server → Client
// ==============================================================================================

export type ServerToClientMessage = {
  uuid: Uuid
  payload: ServerToClientPayload
}

export type ServerToClientPayload =
  | { kind: 'Alert'; data: AlertData }
  | { kind: 'ChatMessage'; data: ChatMessageData }
  | { kind: 'ClientIdAssignment'; data: ClientIdAssignmentData }
  | { kind: 'ClientJoined'; data: ClientJoinedData }
  | { kind: 'ClientLeft'; data: ClientLeftData }
  | { kind: 'CommandDevicesList'; data: CommandDevicesListData }
  | { kind: 'CommandHistory'; data: CommandHistoryData }
  | { kind: 'CommandResponse'; data: CommandResponseData }
  | { kind: 'DeviceMarketInfoResponse'; data: DeviceMarketInfoResponseData }
  | { kind: 'DeviceSnapshotLite'; data: DeviceSnapshotLiteData }
  | { kind: 'FatalServerError'; data: FatalServerErrorData }
  | { kind: 'InspectCommandResponse'; data: InspectCommandResponseData }
  | { kind: 'Message'; data: MessageData }
  | { kind: 'Pong'; data: PongData }
  | { kind: 'ServerError'; data: ServerErrorData }
  | { kind: 'ServerHello'; data: ServerHelloData }
  | { kind: 'SetActiveMarketContext'; data: SetActiveMarketContextData }
  | { kind: 'SetCommandStatus'; data: SetCommandStatusData }
  | { kind: 'SetUser'; data: SetUserData }
  | { kind: 'TePointsPage'; data: TePointsPageData }
  | { kind: 'UnsetUser'; data: UnsetUserData }
  | { kind: 'Welcome'; data: WelcomeData }

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
export type PongData = { client_send_time: number }
export type SetUserData = { user_id: Uuid; username: string }
export type UnsetUserData = Record<string, never>
export type SetActiveMarketContextData = {
  market_context: MarketContext
  market?: Market | null
  description: string
}
export type DeviceMarketInfoResponseData = {
  device_id: Uuid
  market_context: MarketContext
  description: string
}
export type InspectCommandResponseData = {
  command_id: Uuid
  command_box_id: Uuid
  initial_inspected_device_type: DeviceKind
  initial_inspected_device: Uuid
  initial_inspected_device_market_info: DeviceMarketInfo
  device_ids: Uuid[]
  device_market_infos: Record<Uuid, DeviceMarketInfo>
  device_kinds: Record<Uuid, DeviceKind>
}

// Lite device snapshot types
export type DeviceSnapshotLiteData = {
  device_id: Uuid
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
  current_stop_client_id?: string | null
  status: StopGuardStatus
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
