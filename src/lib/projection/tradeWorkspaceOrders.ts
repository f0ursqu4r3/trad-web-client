import type { BrowserAccountSnapshot } from '../gateway/index.ts'
import type { WorkspaceOrderView } from './tradeWorkspaceTypes.ts'
import { stringValue, title } from './tradeWorkspaceValues.ts'

export function workspaceOpenOrders(
  snapshot: BrowserAccountSnapshot,
  tradeByOrder: Map<string, string>,
): WorkspaceOrderView[] {
  const managed = snapshot.orders
    .filter((order) => !order.terminal)
    .map((order): WorkspaceOrderView => {
      const execution = order.current_request.execution
      return {
        id: order.order_id,
        symbol: order.current_request.symbol,
        side: order.current_request.side,
        purpose: order.current_request.reduce_only ? 'Close' : 'Entry',
        execution: title(stringValue(execution.kind) ?? 'order'),
        remainingQuantity: order.remaining_quantity,
        price: stringValue(execution.price) ?? stringValue(execution.worst_price),
        lifecycle: order.lifecycle,
        tradeId: tradeByOrder.get(order.order_id) ?? null,
        managed: true,
        order,
        externalOrder: null,
      }
    })
  const external = (snapshot.external_orders ?? [])
    .filter((order) => order.observation.status === 'working' && order.terms !== null)
    .map(
      (order): WorkspaceOrderView => ({
        id: `${order.identity.kind}:${order.identity.value}`,
        symbol: order.terms?.symbol ?? '-',
        side: order.terms?.order_side ?? '-',
        purpose: order.terms?.conditional ? 'Conditional' : 'External',
        execution: order.terms?.conditional ? 'Trigger' : 'Order',
        remainingQuantity: order.terms?.remaining_quantity ?? '0',
        price: order.observation.working_price,
        lifecycle: order.observation.status,
        tradeId: null,
        managed: false,
        order: null,
        externalOrder: order,
      }),
    )
  return [...managed, ...external].sort(
    (left, right) => left.symbol.localeCompare(right.symbol) || left.id.localeCompare(right.id),
  )
}
