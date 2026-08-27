import type { BrowserAccountSnapshot, ProjectionGraph } from '../gateway/index.ts'
import { workspaceOpenOrders } from './tradeWorkspaceOrders.ts'
import { indexPositions, tradeSeeds } from './tradeWorkspaceRelationships.ts'
import { buildManagedTrade } from './tradeWorkspaceTrade.ts'
import type { TradeWorkspaceProjection } from './tradeWorkspaceTypes.ts'

export { activeCloseWorkflowsForTrade } from './tradeWorkspaceClose.ts'

export type {
  ManagedTradeLifecycle,
  ManagedTradeView,
  TradeWorkspaceProjection,
  WorkspaceOrderView,
  WorkspacePositionView,
} from './tradeWorkspaceTypes.ts'

export function tradeWorkspaceProjection(
  snapshot: BrowserAccountSnapshot,
): TradeWorkspaceProjection {
  const graph: ProjectionGraph = snapshot
  const positionsByScope = indexPositions(snapshot.positions)
  const trades = tradeSeeds(graph.commands).map((seed) =>
    buildManagedTrade(snapshot, seed, positionsByScope),
  )
  const tradeByOrder = new Map<string, string>()
  for (const trade of trades) {
    for (const order of trade.orders) tradeByOrder.set(order.order_id, trade.tradeId)
  }
  const ordered = [...trades].sort(
    (left, right) => right.createdAt - left.createdAt || left.tradeId.localeCompare(right.tradeId),
  )

  return {
    activeTrades: ordered.filter(
      (trade) => trade.lifecycle !== 'closed' && trade.lifecycle !== 'taken_over',
    ),
    closedTrades: ordered.filter(
      (trade) => trade.lifecycle === 'closed' || trade.lifecycle === 'taken_over',
    ),
    positions: snapshot.positions
      .map((position) => ({
        position,
        tradeIds: Object.keys(position.owned_exposure)
          .map((scopeId) => `scope:${scopeId}`)
          .filter((tradeId) => trades.some((trade) => trade.tradeId === tradeId)),
      }))
      .sort((left, right) => left.position.symbol.localeCompare(right.position.symbol)),
    openOrders: workspaceOpenOrders(snapshot, tradeByOrder),
  }
}
