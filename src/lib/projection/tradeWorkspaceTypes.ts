import type {
  CommandProjection,
  ExecutionProjection,
  ExternalOrderProjection,
  NativeProtectionProjection,
  OrderProjection,
  OwnedExposureProjection,
  PositionProjection,
  PositionSide,
} from '../gateway/index.ts'

export type ManagedTradeLifecycle =
  | 'entering'
  | 'active'
  | 'closing'
  | 'attention'
  | 'taken_over'
  | 'closed'

export interface ManagedTradeView {
  tradeId: string
  scopeId: string
  symbol: string
  side: PositionSide
  entryLabel: string
  lifecycle: ManagedTradeLifecycle
  attentionReason: string | null
  createdAt: number
  primaryCommand: CommandProjection
  commands: CommandProjection[]
  position: PositionProjection | null
  exposure: OwnedExposureProjection | null
  orders: OrderProjection[]
  entryOrders: OrderProjection[]
  closeOrders: OrderProjection[]
  executions: ExecutionProjection[]
  protection: NativeProtectionProjection | null
  plannedRisk: string | null
  initialPlannedLoss: string | null
  currentStopExposure: string | null
  requestedQuantity: string | null
  filledQuantity: string
  remainingQuantity: string
  averageEntryPrice: string | null
  realizedPnl: Map<string, string>
  venueRealizedPnl: Map<string, string>
  netAfterFees: Map<string, string>
  totalFees: Map<string, string>
  builderFees: Map<string, string>
  pinnedAllInTargetTenthsBps: number | null
  pinnedFeeSource: string | null
  pinnedFeePolicyVersion: number | null
}

export interface WorkspacePositionView {
  position: PositionProjection
  tradeIds: string[]
}

export interface WorkspaceOrderView {
  id: string
  symbol: string
  side: string
  purpose: string
  execution: string
  remainingQuantity: string
  price: string | null
  lifecycle: string
  tradeId: string | null
  managed: boolean
  order: OrderProjection | null
  externalOrder: ExternalOrderProjection | null
}

export interface TradeWorkspaceProjection {
  activeTrades: ManagedTradeView[]
  closedTrades: ManagedTradeView[]
  positions: WorkspacePositionView[]
  openOrders: WorkspaceOrderView[]
}

export interface TradeSeed {
  scopeId: string
  primaryCommand: CommandProjection
}
