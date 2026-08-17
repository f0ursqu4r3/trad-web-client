import type {
  AccountProjectionSummary,
  BrowserAccountSnapshot,
  ClientCommandPage,
  CommandProjection,
  OrderGenerationProjection,
  OrderProjection,
  ProjectionCheckpoint,
} from '@/lib/gateway'

export const ENGINE_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001'
export const ENGINE_SUBSCRIPTION_ID = '10000000-0000-4000-8000-000000000002'

const CHASE_COMMAND_ID = '20000000-0000-4000-8000-000000000001'
const CHASE_ID = '20000000-0000-4000-8000-000000000002'
const CHASE_ORDER_ID = '20000000-0000-4000-8000-000000000003'
const FILLED_COMMAND_ID = '30000000-0000-4000-8000-000000000001'
const FILLED_ORDER_ID = '30000000-0000-4000-8000-000000000002'
const PROTECTION_ID = '30000000-0000-4000-8000-000000000003'
const TAKE_PROFIT_ID = '30000000-0000-4000-8000-000000000004'
const STOP_LOSS_ID = '30000000-0000-4000-8000-000000000005'
const TRAILING_COMMAND_ID = '35000000-0000-4000-8000-000000000001'
const TRAILING_ENTRY_ID = '35000000-0000-4000-8000-000000000002'
const HISTORY_COMMAND_ID = '40000000-0000-4000-8000-000000000001'
const HISTORY_ORDER_ID = '40000000-0000-4000-8000-000000000002'
export const ACCEPTED_AT = 1_786_200_000_000

export function engineProjectionSnapshot(): BrowserAccountSnapshot {
  const chaseCommand = command(
    CHASE_COMMAND_ID,
    ACCEPTED_AT + 2_000,
    'place_chase',
    'running',
    { kind: 'chase', id: CHASE_ID },
    {
      plan: {
        symbol: 'BTC',
        order_side: 'buy',
        position_side: 'long',
        quantity: '0.125',
        reduce_only: false,
        position_intent: { kind: 'open', scope_id: 'scope-chase' },
        protection: null,
        adverse_boundary: { kind: 'basis_points', value: '25.125' },
        expires_at: ACCEPTED_AT + 62_000,
        remainder_policy: 'cancel',
      },
    },
  )
  const filledCommand = command(
    FILLED_COMMAND_ID,
    ACCEPTED_AT + 1_000,
    'place_order',
    'succeeded',
    { kind: 'order', id: FILLED_ORDER_ID },
    {
      request: {
        symbol: 'ETH',
        side: 'buy',
        position_side: 'long',
        quantity: '0.00420001',
        execution: { kind: 'market' },
        reduce_only: false,
      },
      position_intent: { kind: 'open', scope_id: 'scope-filled' },
      protection: {
        scope_id: 'protection-scope-filled',
        controller: {
          kind: 'native',
          children: [
            {
              protection_kind: 'take_profit',
              trigger_price: '2100.125',
              trigger_source: 'mark_price',
              execution: { kind: 'bounded_market', worst_price: '2090.125' },
              allocation: { kind: 'fraction', value: '0.5' },
            },
            {
              protection_kind: 'stop_loss',
              trigger_price: '1800.125',
              trigger_source: 'mark_price',
              execution: { kind: 'bounded_market', worst_price: '1790.125' },
              allocation: { kind: 'full_remaining' },
            },
          ],
        },
      },
    },
  )
  const trailingCommand = command(
    TRAILING_COMMAND_ID,
    ACCEPTED_AT + 1_500,
    'place_trailing_entry',
    'running',
    { kind: 'trailing_entry', id: TRAILING_ENTRY_ID },
    {
      plan: {
        symbol: 'SOL',
        position_side: 'long',
        activation_price: '145.25',
        jump_threshold: '10',
        stop_loss: '140',
        take_profit: '155',
        risk_amount: '25',
        instrument: {
          quantity_step: '0.01',
          minimum_order_quantity: '0.01',
          minimum_order_notional: '10',
        },
        execution: {
          exposure_scope_id: 'scope-trailing',
          children: [
            {
              order_id: '35000000-0000-4000-8000-000000000010',
              submission_operation_id: '35000000-0000-4000-8000-000000000011',
              client_order_id: 'te-child-1',
            },
          ],
        },
        one_way: {
          semantics: 'target_side_exposure',
          close_workflow_id: '35000000-0000-4000-8000-000000000012',
          close_order_id: '35000000-0000-4000-8000-000000000013',
          close_submission_operation_id: '35000000-0000-4000-8000-000000000014',
          close_client_order_id: 'te-close-1',
        },
      },
    },
  )
  const chaseOrder = order(CHASE_ORDER_ID, CHASE_COMMAND_ID, '0.125', '0.025', '0.1', 'working')
  const filledOrder = order(
    FILLED_ORDER_ID,
    FILLED_COMMAND_ID,
    '0.00420001',
    '0.00420001',
    '0',
    'filled',
  )

  return {
    checkpoint: checkpoint(42, 3, { trailing_entries: 1, active_trailing_entries: 1 }),
    window: {
      total_commands: 4,
      included_commands: 3,
      terminal_command_limit: 1,
      older_terminal_commands_available: true,
    },
    commands: [filledCommand, trailingCommand, chaseCommand],
    execution_groups: [],
    chases: [
      {
        chase_id: CHASE_ID,
        command_id: CHASE_COMMAND_ID,
        order_id: CHASE_ORDER_ID,
        plan: {
          symbol: 'BTC',
          position_side: 'long',
          quantity: '0.125',
          mode: 'join_top',
        },
        lifecycle: 'working',
        order_started: true,
        desired_price: '64231.125',
        resolved_boundary_price: '65000',
        latest_bid: '64231.125',
        latest_ask: '64231.25',
        market_generation: 19,
        market_stale: false,
        reprice_sequence: 7,
        reprice_ready: true,
        consecutive_reprice_failures: 0,
        post_only_retry_pending: false,
        last_reprice_result_operation_id: null,
        last_reason: 'resting at best bid',
      },
    ],
    trailing_entries: [
      {
        trailing_entry_id: TRAILING_ENTRY_ID,
        command_id: TRAILING_COMMAND_ID,
        state_revision: 12,
        mutation_command_ids: [],
        plan: {
          symbol: 'SOL',
          position_side: 'long',
          activation_price: '145.25',
          jump_threshold: '10',
          stop_loss: '140',
          take_profit: '155',
          risk_amount: '25',
          instrument: {},
          execution: {},
        },
        phase: 'tracking',
        lifecycle: 'running',
        market_generation: 31,
        market_stale: false,
        cursor: { generation: 31, exchange_time: ACCEPTED_AT + 2_000, trade_ids: ['sol-trade-31'] },
        latest_trade: {
          generation: 31,
          exchange_time: ACCEPTED_AT + 2_000,
          trade_id: 'sol-trade-31',
          price: '144.8',
        },
        latest_trade_received_at: ACCEPTED_AT + 2_500,
        point_count: 128,
        actual_activation_price: '145.2',
        activation_point_index: 12,
        peak: '143.9',
        peak_point_index: 119,
        trigger: null,
        continuations: [],
        entry_cancel_requested: false,
        close_workflow_id: null,
        last_reason: 'tracking rebound from peak',
        created_at: ACCEPTED_AT + 1_500,
      },
    ],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    native_protections: [
      {
        protection_id: PROTECTION_ID,
        scope_id: 'protection-scope-filled',
        symbol: 'ETH',
        position_side: 'long',
        scope_revision: 3,
        plan_revision: 4,
        plan: {
          protection_id: PROTECTION_ID,
          children: [
            {
              child_id: TAKE_PROFIT_ID,
              client_order_id: 'trad-native-take-profit',
              protection_kind: 'take_profit',
              trigger_price: '2100.125',
              trigger_source: 'mark_price',
              execution: { kind: 'bounded_market', worst_price: '2090.125' },
              allocation: { kind: 'fraction', value: '0.5' },
            },
            {
              child_id: STOP_LOSS_ID,
              client_order_id: 'trad-native-stop-loss',
              protection_kind: 'stop_loss',
              trigger_price: '1800.125',
              trigger_source: 'mark_price',
              execution: { kind: 'bounded_market', worst_price: '1790.125' },
              allocation: { kind: 'full_remaining' },
            },
          ],
        },
        target_quantity: '0.00420001',
        covered_quantity: '0.00420001',
        status: 'tracking',
        failure_reason: null,
        children: {
          [TAKE_PROFIT_ID]: {
            child_id: TAKE_PROFIT_ID,
            target_quantity: '0.002100005',
            confirmed_quantity: '0.002100005',
            cumulative_filled_quantity: '0',
            remote_order_ids: ['native-take-profit-remote'],
            pending_operation_id: null,
            failure_reason: null,
          },
          [STOP_LOSS_ID]: {
            child_id: STOP_LOSS_ID,
            target_quantity: '0.00420001',
            confirmed_quantity: '0.00420001',
            cumulative_filled_quantity: '0',
            remote_order_ids: ['native-stop-loss-remote'],
            pending_operation_id: null,
            failure_reason: null,
          },
        },
      },
    ],
    orders: [chaseOrder, filledOrder],
    positions: [
      {
        symbol: 'ETH',
        mode: 'one_way',
        status: 'consistent',
        reconciliation_required: false,
        exchange_quantity: { long: '0.00420001', short: '0' },
        owned_quantity: { long: '0.00420001', short: '0' },
        external_quantity: { long: '0', short: '0' },
        deficit_quantity: { long: '0', short: '0' },
        latest_exchange_event_id: 'fixture-eth-position',
        latest_exchange_revision: 77,
        latest_long_exchange_revision: 77,
        latest_short_exchange_revision: 77,
        latest_external_flatten: null,
        owned_exposure: {
          'scope-filled': {
            scope_id: 'scope-filled',
            side: 'long',
            opened_quantity: '0.00420001',
            reduced_quantity: '0',
            remaining_quantity: '0.00420001',
          },
        },
        unallocated_fills: {},
      },
      {
        symbol: 'BTC',
        mode: 'one_way',
        status: 'consistent',
        reconciliation_required: false,
        exchange_quantity: { long: '0.025', short: '0' },
        owned_quantity: { long: '0.025', short: '0' },
        external_quantity: { long: '0', short: '0' },
        deficit_quantity: { long: '0', short: '0' },
        latest_exchange_event_id: 'fixture-btc-position',
        latest_exchange_revision: 78,
        latest_long_exchange_revision: 78,
        latest_short_exchange_revision: 78,
        latest_external_flatten: null,
        owned_exposure: {
          'scope-chase': {
            scope_id: 'scope-chase',
            side: 'long',
            opened_quantity: '0.025',
            reduced_quantity: '0',
            remaining_quantity: '0.025',
          },
        },
        unallocated_fills: {},
      },
    ],
    executions: [
      {
        event_id: 'fill-eth-1',
        fill: {
          event_id: 'fill-eth-1',
          execution_id: 'exec-eth-1',
          symbol: 'ETH',
          client_order_id: generation(FILLED_ORDER_ID, '0.00420001').client_order_id,
          remote_order_id: '987654321',
          side: 'buy',
          position_side: 'long',
          price: '1918.90000001',
          quantity: '0.00420001',
          occurred_at: ACCEPTED_AT + 1_150,
          is_maker: false,
          fee: { asset: 'USDC', amount: '0.003223456789' },
          builder_fee: { asset: 'USDC', amount: '0.001111111111' },
          realized_pnl: null,
          start_position: '0',
          transaction_hash: '0xabc123',
        },
        order: { order_id: FILLED_ORDER_ID, generation: 0 },
        reconciliation_required: false,
      },
    ],
    balances: [
      {
        asset: 'USDC',
        latest_event_id: 'balance-1',
        latest_revision: 77,
        wallet: '1000.123456789',
        equity: '1001.223456789',
        available: '980.123456789',
      },
    ],
    protections: [
      {
        remote_order_id: 'protection-eth-stop',
        client_order_id: 'trad-protection-eth-stop',
        parent_client_order_id: null,
        symbol: 'ETH',
        order_side: 'sell',
        position_side: 'long',
        protection_kind: 'stop_loss',
        trigger_price: '1800.125',
        trigger_source: 'mark_price',
        execution: { kind: 'market' },
        original_quantity: '0.00420001',
        cumulative_filled_quantity: '0',
        reduce_only: true,
        close_on_trigger: true,
        position_wide: false,
        status: 'working',
        failure_reason: null,
        present_on_exchange: true,
        inventory_classification: {
          kind: 'owned',
          owner: { scope_id: 'protection-scope-filled' },
        },
        latest_event_id: 'protection-event-1',
        latest_revision: 77,
      },
    ],
    external_orders: [
      {
        identity: { kind: 'remote', value: 'external-order-eth-1' },
        classification: 'system_external',
        observation: {
          event_id: 'external-order-evidence-1',
          client_order_id: 'manual-eth-entry',
          remote_order_id: 'external-order-eth-1',
          status: 'working',
          cumulative_filled_quantity: '0',
          average_price: null,
          working_price: '1850.125',
          working_total_quantity: '0.125',
          reject_reason: null,
        },
        terms: {
          symbol: 'ETH',
          order_side: 'buy',
          position_side: 'long',
          remaining_quantity: '0.125',
          reduce_only: false,
          conditional: false,
        },
      },
    ],
    relationships: [
      {
        parent: { kind: 'command', id: CHASE_COMMAND_ID },
        child: { kind: 'chase', id: CHASE_ID },
        relationship: 'command_root',
      },
      {
        parent: { kind: 'chase', id: CHASE_ID },
        child: { kind: 'order', id: CHASE_ORDER_ID },
        relationship: 'chase_order',
      },
      {
        parent: { kind: 'command', id: FILLED_COMMAND_ID },
        child: { kind: 'order', id: FILLED_ORDER_ID },
        relationship: 'command_root',
      },
      {
        parent: { kind: 'command', id: TRAILING_COMMAND_ID },
        child: { kind: 'trailing_entry', id: TRAILING_ENTRY_ID },
        relationship: 'command_root',
      },
    ],
  }
}

export function engineProjectionHistoryPage(): ClientCommandPage {
  const oldCommand = command(
    HISTORY_COMMAND_ID,
    ACCEPTED_AT,
    'place_order',
    'failed',
    { kind: 'order', id: HISTORY_ORDER_ID },
    { request: { execution: { kind: 'market' } } },
  )
  oldCommand.failure_reason = 'insufficient margin'
  const oldOrder = order(HISTORY_ORDER_ID, HISTORY_COMMAND_ID, '1.25', '0', '1.25', 'rejected')
  oldOrder.failure_reason = 'insufficient margin'
  return {
    checkpoint: checkpoint(42, 2),
    root_command_ids: [HISTORY_COMMAND_ID],
    commands: [oldCommand],
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    orders: [oldOrder],
    executions: [],
    relationships: [
      {
        parent: { kind: 'command', id: HISTORY_COMMAND_ID },
        child: { kind: 'order', id: HISTORY_ORDER_ID },
        relationship: 'command_root',
      },
    ],
    next_cursor: null,
  }
}

function command(
  commandId: string,
  acceptedAt: number,
  kind: string,
  lifecycle: CommandProjection['lifecycle'],
  root: CommandProjection['root'],
  parameters: Record<string, unknown>,
): CommandProjection {
  return {
    command_id: commandId,
    accepted_at: acceptedAt,
    accepted: { kind, parameters },
    root,
    operation_ids: [],
    lifecycle,
    failure_reason: null,
  }
}

function order(
  orderId: string,
  commandId: string,
  target: string,
  filled: string,
  remaining: string,
  lifecycle: string,
): OrderProjection {
  const request = {
    symbol: orderId === FILLED_ORDER_ID ? 'ETH' : 'BTC',
    side: 'buy' as const,
    position_side: 'long' as const,
    quantity: target,
    execution: { kind: orderId === CHASE_ORDER_ID ? 'limit' : 'market', price: '64231.125' },
    reduce_only: false,
  }
  return {
    order_id: orderId,
    command_id: commandId,
    accepted_request: request,
    current_request: request,
    lifecycle,
    terminal: lifecycle !== 'working',
    reconciliation_required: false,
    target_quantity: target,
    filled_quantity: filled,
    remaining_quantity: remaining,
    overfill_quantity: '0',
    active_generation: 0,
    generations: { '0': generation(orderId, filled) },
    failure_reason: null,
  }
}

function generation(orderId: string, filled: string): OrderGenerationProjection {
  return {
    generation: 0,
    predecessor_generation: null,
    successor_generation: null,
    lifecycle: filled === '0' ? 'working' : 'filled',
    working_request: {
      symbol: orderId === FILLED_ORDER_ID ? 'ETH' : 'BTC',
      side: 'buy',
      position_side: 'long',
      quantity: filled === '0' ? '1.25' : filled,
      execution: { kind: 'limit', price: '64231.125' },
      reduce_only: false,
    },
    filled_quantity: filled,
    client_order_id: `trad-${orderId}`,
    active_remote_order_id: filled === '0' ? `remote-${orderId}` : null,
    remote_order_ids: [`remote-${orderId}`],
    submission_operation_id: `operation-${orderId}`,
    modify_operation_ids: [],
    cancel_operation_id: null,
    reconciliation_operation_id: null,
  }
}

function checkpoint(
  revision: number,
  commands: number,
  overrides: Partial<AccountProjectionSummary> = {},
): ProjectionCheckpoint {
  return {
    schema_version: 28,
    shard: { exchange: 'hyperliquid', network: 'testnet', account_id: ENGINE_ACCOUNT_ID },
    account_revision: revision,
    projection_revision: revision,
    summary: { ...summary(commands), ...overrides },
  }
}

function summary(commands: number): AccountProjectionSummary {
  return {
    private_stream_generation: 2,
    private_stream_status: 'connected',
    reconciliation_cycle_id: null,
    reconciliation_generation: 2,
    reconciliation_status: 'ready',
    reconciliation_ready: true,
    position_inventory_ready: true,
    commands,
    execution_groups: 0,
    active_execution_groups: 0,
    chases: 1,
    active_chases: 1,
    trailing_entries: 0,
    active_trailing_entries: 0,
    close_workflows: 0,
    active_close_workflows: 0,
    flatten_workflows: 0,
    active_flatten_workflows: 0,
    entry_cancellations: 0,
    active_entry_cancellations: 0,
    account_controls: 0,
    active_account_controls: 0,
    protection_amendments: 0,
    active_protection_amendments: 0,
    orders: 2,
    active_orders: 1,
    positions: 1,
    executions: 1,
    unmatched_executions: 0,
    unresolved_legacy_entities: 0,
    unresolved_external_orders: 0,
    system_external_orders: 1,
    unscoped_external_orders: 0,
    balances: 1,
    protections: 1,
    active_protections: 1,
    external_protections: 0,
    unresolved_protection_inventory: 0,
    protection_inventory_blocking_readiness: 0,
    operations: 0,
    unresolved_operations: 0,
    reconciliation_required: false,
  }
}
