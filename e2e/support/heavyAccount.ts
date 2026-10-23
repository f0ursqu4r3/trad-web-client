import {
  engineProjectionHistoryPage,
  engineProjectionSnapshot,
} from '../../src/views/e2e/engineProjectionFixtureData'
import type { Json } from './workspaceWire'

// A synthetic heavy account for the network budgets: the fixture account's
// three active trades (BTC, ETH, SOL cards) plus `terminalCommands` failed
// orders and `executions` order-less fills (protection, manual and external
// fills are the ones the live snapshot never trims today). Nothing here comes
// from production; the shapes are the fixture's.

const HISTORY_COINS = ['AVAX', 'DOGE', 'ARB', 'LINK', 'OP', 'SUI', 'APT', 'TIA', 'WIF', 'PEPE']
const EPOCH = 1_786_000_000_000

export function heavyAccountSnapshot(terminalCommands: number, executions: number): Json {
  const snapshot = engineProjectionSnapshot() as unknown as Json
  const history = engineProjectionHistoryPage() as unknown as Json
  const commandTemplate = history.commands[0]
  const orderTemplate = history.orders[0]

  for (let index = 0; index < terminalCommands; index += 1) {
    const commandId = syntheticUuid(7, index)
    const orderId = syntheticUuid(8, index)
    const coin = HISTORY_COINS[index % HISTORY_COINS.length]!
    const order = structuredClone(orderTemplate)
    order.order_id = orderId
    order.command_id = commandId
    order.accepted_request.symbol = coin
    order.current_request.symbol = coin
    for (const generation of Object.values(order.generations) as Json[]) {
      generation.working_request.symbol = coin
      generation.client_order_id = `trad-${orderId}-0`
      generation.remote_order_ids = [`remote-${orderId}-0`]
      generation.submission_operation_id = `operation-${orderId}-0`
    }
    snapshot.orders.push(order)
    snapshot.commands.push({
      ...structuredClone(commandTemplate),
      command_id: commandId,
      accepted_at: EPOCH + index * 60_000,
      root: { kind: 'order', id: orderId },
      accepted: {
        kind: 'place_order',
        parameters: { request: { symbol: coin, execution: { kind: 'market' } } },
      },
    })
    snapshot.relationships.push({
      parent: { kind: 'command', id: commandId },
      child: { kind: 'order', id: orderId },
      relationship: 'command_root',
    })
  }

  for (let index = 0; index < executions; index += 1) snapshot.executions.push(syntheticFill(index))

  const summary = snapshot.checkpoint.summary
  for (const key of Object.keys(summary)) {
    if (Array.isArray(snapshot[key]) && typeof summary[key] === 'number') {
      summary[key] = snapshot[key].length
    }
  }
  snapshot.window.total_commands = snapshot.commands.length
  snapshot.window.included_commands = snapshot.commands.length
  // The live window holds all of them, so the first delta does not prune the
  // account back to the fixture's one terminal command.
  snapshot.window.terminal_command_limit = snapshot.commands.length
  snapshot.window.older_terminal_commands_available = false
  return snapshot
}

// An order-less fill on a history coin; it never touches the active cards.
export function syntheticFill(index: number): Json {
  const coin = HISTORY_COINS[index % HISTORY_COINS.length]!
  const eventId = `synthetic-fill-${index}`
  return {
    event_id: eventId,
    fill: {
      event_id: eventId,
      execution_id: `synthetic-exec-${index}`,
      symbol: coin,
      client_order_id: null,
      remote_order_id: String(9_000_000_000 + index),
      side: index % 2 === 0 ? 'buy' : 'sell',
      position_side: 'long',
      price: (10 + (index % 997) / 100).toFixed(4),
      quantity: (1 + (index % 13)).toFixed(2),
      occurred_at: EPOCH + index * 1_000,
      is_maker: index % 3 === 0,
      fee: { asset: 'USDC', amount: '0.001234567891' },
      builder_fee: { asset: 'USDC', amount: '0.000555555555' },
      realized_pnl: index % 2 === 0 ? null : { asset: 'USDC', amount: '-0.123456' },
      start_position: '0',
      transaction_hash: `0x${index.toString(16).padStart(64, '0')}`,
    },
    order: null,
    reconciliation_required: false,
  }
}

function syntheticUuid(prefix: number, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}
