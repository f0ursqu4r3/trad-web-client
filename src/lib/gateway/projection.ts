import type { BrowserCommandIntent, ExactDecimal, Uuid } from './intent.ts'

export type TimestampMillis = number
export type ProjectionRevision = number
export type Exchange = 'bifake' | 'binance' | 'bybit' | 'hyperliquid'
export type Network = 'simulation' | 'testnet' | 'mainnet'
export type PositionSide = 'long' | 'short'
export type OrderSide = 'buy' | 'sell'

export interface AccountRouteKey {
  exchange: Exchange
  network: Network
  account_id: Uuid
}

export interface AccountProjectionSummary {
  private_stream_generation: number | null
  private_stream_status: string
  reconciliation_cycle_id: Uuid | null
  reconciliation_generation: number | null
  reconciliation_status: string
  reconciliation_ready: boolean
  position_inventory_ready: boolean
  commands: number
  execution_groups: number
  active_execution_groups: number
  chases: number
  active_chases: number
  trailing_entries: number
  active_trailing_entries: number
  close_workflows: number
  active_close_workflows: number
  flatten_workflows: number
  active_flatten_workflows: number
  entry_cancellations: number
  active_entry_cancellations: number
  account_controls: number
  active_account_controls: number
  protection_amendments: number
  active_protection_amendments: number
  orders: number
  active_orders: number
  positions: number
  executions: number
  unmatched_executions: number
  unresolved_legacy_entities: number
  unresolved_external_orders: number
  system_external_orders: number
  unscoped_external_orders: number
  balances: number
  protections: number
  active_protections: number
  external_protections: number
  unresolved_protection_inventory: number
  protection_inventory_blocking_readiness: number
  operations: number
  unresolved_operations: number
  reconciliation_required: boolean
}

export interface ProjectionCheckpoint {
  schema_version: number
  shard: AccountRouteKey
  account_revision: number
  projection_revision: ProjectionRevision
  summary: AccountProjectionSummary
  legacy_migration?: LegacyMigrationProjection
}

export interface LegacyMigrationProjection {
  run_id: Uuid
  source_fingerprint: string
  commands: number
  devices: number
  active_unresolved: number
  forensic_audit_events: number
  unscoped_audit_events: number
  blocks_new_risk: boolean
}

export type LegacyLifecycle = 'active' | 'succeeded' | 'failed' | 'canceled' | 'unknown'

export type LegacyDeviceKind =
  | 'trailing_entry'
  | 'execution_group'
  | 'order'
  | 'native_protection'
  | 'stop_guard'

export type LegacyNumericOrigin = 'sqlite_real_json' | 'sqlite_integer_json'

export type LegacyRelationshipConfidence = 'proven' | 'ambiguous' | 'unresolved'

export interface LegacyCommandEvidence {
  command_id: Uuid
  kind: string
  owner_user_id: Uuid | null
  created_at: TimestampMillis | null
  lifecycle: LegacyLifecycle
  payload_sha256: string
  redacted: boolean
}

export interface LegacyFinancialValue {
  value: ExactDecimal
  source_text: string
  origin: LegacyNumericOrigin
}

export interface LegacyDeviceEvidence {
  device_id: Uuid
  command_id: Uuid | null
  parent_id: Uuid | null
  kind: LegacyDeviceKind
  symbol: string | null
  position_side: PositionSide | null
  started_at: TimestampMillis
  completed_at: TimestampMillis | null
  lifecycle: LegacyLifecycle
  failure_reason: string | null
  client_order_ids: string[]
  remote_order_ids: string[]
  financial_values: Record<string, LegacyFinancialValue>
  device_payload_sha256: string
  state_payload_sha256: string
}

export interface LegacyRelationshipEvidence {
  parent_kind: string
  parent_id: Uuid
  child_kind: string
  child_id: Uuid
  relationship_kind: string
  confidence: LegacyRelationshipConfidence
}

export interface LegacyHistoryCursor {
  accepted_at: TimestampMillis
  command_id: Uuid
}

export interface LegacyCommandPage {
  run_id: Uuid
  source_fingerprint: string
  root_command_ids: Uuid[]
  commands: LegacyCommandEvidence[]
  devices: LegacyDeviceEvidence[]
  relationships: LegacyRelationshipEvidence[]
  unresolved_active_entities: Uuid[]
  next_cursor: LegacyHistoryCursor | null
}

export type ProjectionNodeKind =
  | 'command'
  | 'order'
  | 'execution_group'
  | 'chase'
  | 'trailing_entry'
  | 'close_workflow'
  | 'flatten_workflow'
  | 'entry_cancellation'
  | 'account_control'
  | 'protection_amendment'

export interface ProjectionNodeId {
  kind: ProjectionNodeKind
  id: Uuid
}

export type RelationshipKind =
  | 'command_root'
  | 'execution_child'
  | 'chase_order'
  | 'trailing_entry_execution'
  | 'trailing_entry_close'
  | 'close_execution'
  | 'flatten_close'
  | 'flatten_affected_command'
  | 'entry_cancellation_affected_command'

export interface PresentationRelationship {
  parent: ProjectionNodeId
  child: ProjectionNodeId
  relationship: RelationshipKind
}

export type CommandLifecycle =
  | 'running'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'canceled'
  | 'reconciliation_required'

export interface TaggedParameters {
  kind: string
  parameters: Record<string, unknown>
}

export interface CommandProjection {
  command_id: Uuid
  accepted_at: TimestampMillis
  accepted: TaggedParameters
  execution_policy?: {
    all_in_target_tenths_bps: number
    source_kind: string
    source_id: string
    policy_version: number
    builder_address: string | null
    approved_builder_ceiling_tenths_bps: number | null
  }
  planning?: {
    authored_intent?: BrowserCommandIntent
    sizing_mode: string
    requested_risk_budget: ExactDecimal | null
    decision_price: ExactDecimal
    decision_price_source: string
    market_observed_at_ms: number | null
    initial_stop_price: ExactDecimal | null
    raw_base_quantity: ExactDecimal
    normalized_base_quantity: ExactDecimal
    normalized_quote_notional: ExactDecimal
    quantity_step: ExactDecimal
    minimum_order_quantity: ExactDecimal
    minimum_order_notional: ExactDecimal | null
  }
  root: ProjectionNodeId
  operation_ids: Uuid[]
  lifecycle: CommandLifecycle
  failure_reason: string | null
}

export interface ExecutionGroupProjection {
  group_id: Uuid
  command_id: Uuid
  purpose: string
  child_order_ids: Uuid[]
  accepted_quantity: ExactDecimal
  target_quantity: ExactDecimal
  filled_quantity: ExactDecimal
  lifecycle: string
  working_children: number
  filled_children: number
  canceled_children: number
  rejected_children: number
  reconciliation_children: number
}

export interface ChaseProjection {
  chase_id: Uuid
  command_id: Uuid
  order_id: Uuid
  plan: Record<string, unknown>
  lifecycle: string
  order_started: boolean
  desired_price: ExactDecimal | null
  resolved_boundary_price: ExactDecimal | null
  latest_bid: ExactDecimal | null
  latest_ask: ExactDecimal | null
  market_generation: number | null
  market_stale: boolean
  reprice_sequence: number
  reprice_ready: boolean
  consecutive_reprice_failures: number
  post_only_retry_pending: boolean
  last_reprice_result_operation_id: Uuid | null
  last_reason: string | null
}

export interface TrailingEntryPlanProjection {
  symbol: string
  position_side: PositionSide
  activation_price: ExactDecimal
  jump_threshold: ExactDecimal
  stop_loss: ExactDecimal
  take_profit?: ExactDecimal | null
  risk_amount: ExactDecimal
  instrument: Record<string, unknown>
  execution: Record<string, unknown>
  one_way?: Record<string, unknown> | null
}

export interface TrailingEntryTradeProjection {
  generation: number
  exchange_time: TimestampMillis
  trade_id: string
  price: ExactDecimal
}

export interface TrailingEntryTriggerProjection {
  decision_trade: TrailingEntryTradeProjection
  point_index: number
  entry_price: ExactDecimal
  risk_distance: ExactDecimal
  raw_quantity: ExactDecimal
  normalized_quantity: ExactDecimal
  execution: Record<string, unknown>
}

export interface TrailingEntryProjection {
  trailing_entry_id: Uuid
  command_id: Uuid
  state_revision: number
  mutation_command_ids: Uuid[]
  plan: TrailingEntryPlanProjection
  phase: string
  lifecycle: string
  market_generation: number | null
  market_stale: boolean
  cursor: Record<string, unknown> | null
  latest_trade: TrailingEntryTradeProjection | null
  latest_trade_received_at: TimestampMillis | null
  point_count: number
  actual_activation_price: ExactDecimal | null
  activation_point_index: number | null
  peak: ExactDecimal | null
  peak_point_index: number | null
  trigger: TrailingEntryTriggerProjection | null
  one_way_transition?: Record<string, unknown>
  continuations: Record<string, unknown>[]
  entry_cancel_requested: boolean
  close_workflow_id: Uuid | null
  last_reason: string | null
  created_at: TimestampMillis
}

export interface OwnedReduction {
  scope_id: Uuid
  quantity: ExactDecimal
}

export type CloseExecutionPlan =
  | { kind: 'market' }
  | { kind: 'limit'; price: ExactDecimal; time_in_force: string }
  | {
      kind: 'chase'
      chase_id: Uuid
      adverse_boundary?: Record<string, unknown>
      expires_at?: TimestampMillis
      remainder_policy: string
    }

export type CloseExecutionRoot =
  | { kind: 'order'; order_id: Uuid }
  | { kind: 'chase'; chase_id: Uuid }

export interface CloseWorkflowProjection {
  close_workflow_id: Uuid
  command_id: Uuid
  source_command_ids: Uuid[]
  symbol: string
  position_side: PositionSide
  requested_reductions: OwnedReduction[]
  close_all: boolean
  authoritative_side: boolean
  requested_external_quantity: ExactDecimal
  submitted_reductions: OwnedReduction[] | null
  submitted_external_quantity: ExactDecimal
  requested_quantity: ExactDecimal
  source_order_ids: Uuid[]
  execution: CloseExecutionPlan
  execution_root: CloseExecutionRoot
  close_order_id: Uuid
  submission_operation_id: Uuid
  client_order_id: string
  lifecycle: string
  last_reason: string | null
  created_at: TimestampMillis
}

export interface FlattenWorkflowProjection {
  flatten_workflow_id: Uuid
  command_id: Uuid
  target: Record<string, unknown>
  source_order_ids: Uuid[]
  affected_command_ids: Uuid[]
  close_workflow_ids: Uuid[]
  lifecycle: string
  last_reason: string | null
  created_at: TimestampMillis
}

export interface EntryCancellationProjection {
  cancellation_id: Uuid
  command_id: Uuid
  target: Record<string, unknown>
  source_order_ids: Uuid[]
  affected_command_ids: Uuid[]
  mode?: 'preserve_exposure' | 'take_over'
  takeover_exposure_scope_ids?: Uuid[]
  takeover_protection_scope_ids?: Uuid[]
  lifecycle: string
  last_reason: string | null
  created_at: TimestampMillis
}

export interface AccountControlProjection {
  control_id: Uuid
  command_id: Uuid
  operation_id: Uuid
  request:
    | {
        kind: 'set_leverage'
        symbol: string
        leverage: number
        margin_mode?: 'cross' | 'isolated'
      }
    | { kind: 'set_position_mode'; mode: 'hedge' | 'one_way' }
  lifecycle: 'applying' | 'succeeded' | 'failed' | 'reconciliation_required'
  last_reason: string | null
}

export type ProtectionAmendmentLifecycle =
  | 'applying'
  | 'stopping'
  | 'succeeded'
  | 'failed'
  | 'reconciliation_required'

export type ProtectionAmendmentStep =
  | { kind: 'install'; child: NativeProtectionChildPlan; operation_id: Uuid }
  | {
      kind: 'modify'
      prior: NativeProtectionChildPlan
      desired: NativeProtectionChildPlan
      operation_id: Uuid
    }
  | { kind: 'cancel'; child: NativeProtectionChildPlan; operation_id: Uuid }

export interface ProtectionAmendmentProjection {
  amendment_id: Uuid
  command_id: Uuid
  protection_id: Uuid
  expected_plan_revision: number
  prior_plan: NativeProtectionPlan
  desired_plan: NativeProtectionPlan
  steps: ProtectionAmendmentStep[]
  completed_steps: number
  active_operation_id: Uuid | null
  lifecycle: ProtectionAmendmentLifecycle
  last_reason: string | null
  created_at: TimestampMillis
}

export interface OrderRequestProjection {
  symbol: string
  side: OrderSide
  position_side: PositionSide
  quantity: ExactDecimal
  execution: Record<string, unknown>
  reduce_only: boolean
}

export interface OrderGenerationProjection {
  generation: number
  predecessor_generation: number | null
  successor_generation: number | null
  lifecycle: string
  working_request: OrderRequestProjection
  filled_quantity: ExactDecimal
  client_order_id: string
  active_remote_order_id: string | null
  remote_order_ids: string[]
  submission_operation_id: Uuid
  modify_operation_ids: Uuid[]
  cancel_operation_id: Uuid | null
  reconciliation_operation_id: Uuid | null
}

export interface OrderProjection {
  order_id: Uuid
  command_id: Uuid
  accepted_request: OrderRequestProjection
  current_request: OrderRequestProjection
  lifecycle: string
  terminal: boolean
  reconciliation_required: boolean
  target_quantity: ExactDecimal
  filled_quantity: ExactDecimal
  remaining_quantity: ExactDecimal
  overfill_quantity: ExactDecimal
  active_generation: number
  generations: Record<string, OrderGenerationProjection>
  failure_reason: string | null
  blocking_reason?: string | null
}

export interface PositionQuantityProjection {
  long: ExactDecimal
  short: ExactDecimal
}

export interface OwnedExposureProjection {
  scope_id: Uuid
  side: PositionSide
  opened_quantity: ExactDecimal
  reduced_quantity: ExactDecimal
  remaining_quantity: ExactDecimal
  detached?: boolean
}

export interface PositionProjection {
  symbol: string
  mode: string
  status: string
  reconciliation_required: boolean
  exchange_quantity: PositionQuantityProjection
  owned_quantity: PositionQuantityProjection
  external_quantity: PositionQuantityProjection
  deficit_quantity: PositionQuantityProjection
  latest_exchange_event_id: string | null
  latest_exchange_revision: number | null
  latest_long_exchange_revision: number | null
  latest_short_exchange_revision: number | null
  latest_external_flatten: {
    cycle_id: Uuid
    generation: number
    symbol: string
    side: PositionSide
    expected_exchange_revision: number
    reductions: OwnedReduction[]
  } | null
  owned_exposure: Record<Uuid, OwnedExposureProjection>
  unallocated_fills: Record<Uuid, ExactDecimal>
}

export type ExternalOrderIdentity =
  | { kind: 'remote'; value: string }
  | { kind: 'client'; value: string }

export type ExternalOrderClassification =
  | 'unresolved'
  | 'system_external'
  | 'manual_external'
  | 'legacy_bound'

export interface ExternalOrderTerms {
  symbol: string
  order_side: OrderSide
  position_side: PositionSide | null
  remaining_quantity: ExactDecimal
  reduce_only: boolean
  conditional: boolean
}

export interface ExternalOrderObservation {
  event_id: string
  client_order_id: string | null
  remote_order_id: string | null
  status: string
  cumulative_filled_quantity: ExactDecimal | null
  average_price: ExactDecimal | null
  working_price: ExactDecimal | null
  working_total_quantity: ExactDecimal | null
  reject_reason: string | null
}

export interface ExternalOrderProjection {
  identity: ExternalOrderIdentity
  classification: ExternalOrderClassification
  observation: ExternalOrderObservation
  terms: ExternalOrderTerms | null
}

export interface AssetAmountProjection {
  asset: string
  amount: ExactDecimal
}

export interface ExecutionFillProjection {
  event_id: string
  execution_id: string | null
  symbol: string
  client_order_id: string | null
  remote_order_id: string | null
  side: OrderSide
  position_side: PositionSide | null
  price: ExactDecimal
  quantity: ExactDecimal
  occurred_at: TimestampMillis
  is_maker: boolean | null
  fee: AssetAmountProjection | null
  builder_fee: AssetAmountProjection | null
  realized_pnl: AssetAmountProjection | null
  start_position: ExactDecimal | null
  transaction_hash: string | null
}

export interface OrderGenerationRef {
  order_id: Uuid
  generation: number
}

export interface ExecutionProjection {
  event_id: string
  fill: ExecutionFillProjection
  order: OrderGenerationRef | null
  protection_owner?: {
    scope_id: Uuid
    scope_revision: number
    controller: unknown
    child_id: Uuid
  } | null
  reconciliation_required: boolean
}

export interface BalanceProjection {
  asset: string
  latest_event_id: string
  latest_revision: number
  wallet: ExactDecimal | null
  equity: ExactDecimal | null
  available: ExactDecimal | null
}

export interface ProtectionProjection {
  remote_order_id: string
  client_order_id: string | null
  parent_client_order_id: string | null
  symbol: string
  order_side: OrderSide
  position_side: PositionSide | null
  protection_kind: string
  trigger_price: ExactDecimal
  trigger_source: string
  execution: Record<string, unknown>
  original_quantity: ExactDecimal
  cumulative_filled_quantity: ExactDecimal
  reduce_only: boolean
  close_on_trigger: boolean
  position_wide: boolean
  status: string
  failure_reason: string | null
  present_on_exchange: boolean
  inventory_classification: Record<string, unknown> | string
  latest_event_id: string
  latest_revision: number
}

export type NativeProtectionStatus =
  | 'pending'
  | 'installing'
  | 'resizing'
  | 'canceling'
  | 'tracking'
  | 'triggered'
  | 'flat'
  | 'reconciliation_required'
  | 'failed_unprotected'
  | 'canceled'
  | 'rejected'

export type ProtectionKind = 'take_profit' | 'stop_loss' | 'trailing_stop'
export type ProtectionTriggerSource = 'last_price' | 'mark_price' | 'index_price'

export type ProtectionExecution =
  | { kind: 'market' }
  | { kind: 'bounded_market'; worst_price: ExactDecimal }
  | { kind: 'limit'; price: ExactDecimal }

export type ProtectionAllocation =
  | { kind: 'full_remaining' }
  | { kind: 'fraction'; value: ExactDecimal }
  | { kind: 'exact'; value: ExactDecimal }
  | {
      kind: 'pro_rata'
      fraction: ExactDecimal
      terminal: ExactDecimal
      terminal_basis: ExactDecimal
      quantity_step: ExactDecimal
    }

export interface NativeProtectionChildPlan {
  child_id: Uuid
  client_order_id: string | null
  protection_kind: ProtectionKind
  trigger_price: ExactDecimal
  trigger_source: ProtectionTriggerSource
  execution: ProtectionExecution
  allocation: ProtectionAllocation
}

export interface NativeProtectionPlan {
  protection_id: Uuid
  children: NativeProtectionChildPlan[]
}

export interface NativeProtectionChildProjection {
  child_id: Uuid
  target_quantity: ExactDecimal
  confirmed_quantity: ExactDecimal
  cumulative_filled_quantity: ExactDecimal
  remote_order_ids: string[]
  pending_operation_id: Uuid | null
  pending_target_quantity?: ExactDecimal | null
  failure_reason: string | null
}

export interface NativeProtectionProjection {
  protection_id: Uuid
  scope_id: Uuid
  symbol: string
  position_side: PositionSide
  scope_revision: number
  plan_revision: number
  plan: NativeProtectionPlan
  target_quantity: ExactDecimal
  covered_quantity: ExactDecimal
  status: NativeProtectionStatus
  failure_reason: string | null
  children: Record<Uuid, NativeProtectionChildProjection>
}

export interface BrowserProjectionWindow {
  total_commands: number
  included_commands: number
  terminal_command_limit: number
  older_terminal_commands_available: boolean
}

export interface ProjectionGraph {
  commands: CommandProjection[]
  execution_groups: ExecutionGroupProjection[]
  chases: ChaseProjection[]
  trailing_entries: TrailingEntryProjection[]
  close_workflows: CloseWorkflowProjection[]
  flatten_workflows: FlattenWorkflowProjection[]
  entry_cancellations: EntryCancellationProjection[]
  account_controls: AccountControlProjection[]
  protection_amendments: ProtectionAmendmentProjection[]
  orders: OrderProjection[]
  executions: ExecutionProjection[]
  relationships: PresentationRelationship[]
}

export interface BrowserAccountDelta extends ProjectionGraph {
  checkpoint: ProjectionCheckpoint
  native_protections: NativeProtectionProjection[]
  positions: PositionProjection[]
  balances: BalanceProjection[]
  protections: ProtectionProjection[]
  external_orders?: ExternalOrderProjection[]
  replace_external_order_inventory?: boolean
}

export interface BrowserAccountSnapshot extends BrowserAccountDelta {
  window: BrowserProjectionWindow
}

export interface CommandHistoryCursor {
  accepted_at: TimestampMillis
  command_id: Uuid
}

export interface ClientCommandPage extends ProjectionGraph {
  checkpoint: ProjectionCheckpoint
  root_command_ids: Uuid[]
  next_cursor: CommandHistoryCursor | null
}
