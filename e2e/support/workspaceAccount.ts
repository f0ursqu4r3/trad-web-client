// The scripted workspace account (workspaceWire.ts): the busy variant and
// the deltas the engine streams while trades work.

import { engineProjectionSnapshot } from '../../src/views/e2e/engineProjectionFixtureData'
import type { Json } from './workspaceWire'

// Three more trades on a copy of the fixture account: BTC, ETH and ZEC each
// carry two cards.
export function busySnapshot(): Json {
  const base = JSON.parse(JSON.stringify(engineProjectionSnapshot()).replaceAll('"SOL"', '"ZEC"'))
  const copy = JSON.parse(
    JSON.stringify(engineProjectionSnapshot())
      .replace(/"([2-9]\d{7}-0000-4000-8000-)0/g, '"$11')
      .replaceAll('scope-', 'scope-b-')
      .replaceAll('"BTC"', '"@ETH"')
      .replaceAll('"ETH"', '"@ZEC"')
      .replaceAll('"SOL"', '"@BTC"')
      .replaceAll('"@', '"'),
  )
  for (const key of [
    'commands',
    'execution_groups',
    'chases',
    'trailing_entries',
    'close_workflows',
    'flatten_workflows',
    'entry_cancellations',
    'account_controls',
    'protection_amendments',
    'native_protections',
    'orders',
    'executions',
    'relationships',
  ]) {
    base[key] = [...base[key], ...copy[key]]
  }
  for (const position of copy.positions) {
    const existing = base.positions.find((row: Json) => row.symbol === position.symbol)
    if (existing === undefined) base.positions.push(position)
    else existing.owned_exposure = { ...existing.owned_exposure, ...position.owned_exposure }
  }
  const summary = base.checkpoint.summary
  for (const key of Object.keys(summary)) {
    if (Array.isArray(base[key]) && typeof summary[key] === 'number') {
      summary[key] = base[key].length
    }
    if (key.startsWith('active_') && typeof summary[key] === 'number') summary[key] *= 2
  }
  base.window.total_commands = base.commands.length + 1
  base.window.included_commands = base.commands.length
  return base
}

// What the engine streams while trades work: chase quotes, trailing-entry
// tracking and the settlement balance.
export function liveDelta(snapshot: Json, revision: number, tick: number): Json {
  const drift = Math.sin(tick / 7)
  return {
    checkpoint: { ...snapshot.checkpoint, projection_revision: revision },
    commands: [],
    execution_groups: [],
    chases: snapshot.chases.map((chase: Json) => ({
      ...chase,
      latest_bid: (Number(chase.latest_bid) + drift).toFixed(3),
      latest_ask: (Number(chase.latest_ask) + drift).toFixed(3),
      market_generation: chase.market_generation + tick,
    })),
    trailing_entries: snapshot.trailing_entries.map((entry: Json) => ({
      ...entry,
      market_generation: entry.market_generation + tick,
      latest_trade: {
        ...entry.latest_trade,
        generation: entry.latest_trade.generation + tick,
        price: (Number(entry.latest_trade.price) + drift * 0.1).toFixed(3),
      },
    })),
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    orders: [],
    executions: [],
    relationships: [],
    native_protections: [],
    positions: [],
    balances: snapshot.balances.map((balance: Json) => ({
      ...balance,
      available: (Number(balance.available) + drift).toFixed(6),
    })),
    protections: [],
  }
}
