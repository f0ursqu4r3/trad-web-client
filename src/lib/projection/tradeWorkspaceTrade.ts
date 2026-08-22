import type {
  BrowserAccountSnapshot,
  CommandProjection,
  ExecutionProjection,
  NativeProtectionProjection,
  OrderProjection,
  OwnedExposureProjection,
  PositionProjection,
  PositionSide,
} from '../gateway/index.ts'
import { isExactZero, multiplyExact, sumExact } from '../exactDecimalMath.ts'
import { commandNativeProtection } from '../engineCommands/protectionAmendment.ts'
import { summarizeProjectionExecutions } from './executionEconomics.ts'
import { commandKindLabel } from './presentation.ts'
import { descendantOrderIds, relatedCommandIds } from './tradeWorkspaceRelationships.ts'
import type { ManagedTradeLifecycle, ManagedTradeView, TradeSeed } from './tradeWorkspaceTypes.ts'
import {
  compareCommands,
  divideExact,
  nestedString,
  objectValue,
  stringValue,
  terminalLifecycle,
  title,
} from './tradeWorkspaceValues.ts'

type LocatedExposure = { position: PositionProjection; exposure: OwnedExposureProjection }

export function buildManagedTrade(
  snapshot: BrowserAccountSnapshot,
  seed: TradeSeed,
  positionsByScope: Map<string, LocatedExposure>,
): ManagedTradeView {
  const commandIds = relatedCommandIds(snapshot, seed)
  const commands = snapshot.commands
    .filter((row) => commandIds.has(row.command_id))
    .sort(compareCommands)
  const orderIds = descendantOrderIds(snapshot, commandIds)
  const orders = snapshot.orders.filter(
    (row) => orderIds.has(row.order_id) || commandIds.has(row.command_id),
  )
  const closeOrderIds = new Set(
    snapshot.close_workflows
      .filter((workflow) =>
        workflow.requested_reductions.some((row) => row.scope_id === seed.scopeId),
      )
      .map((workflow) => workflow.close_order_id),
  )
  const closeOrders = orders.filter((row) => closeOrderIds.has(row.order_id))
  const entryOrders = orders.filter((row) => !closeOrderIds.has(row.order_id))
  const executions = snapshot.executions.filter(
    (row) => row.order !== null && orderIds.has(row.order.order_id),
  )
  const entryOrderIds = new Set(entryOrders.map((row) => row.order_id))
  const entryExecutions = executions.filter(
    (row) => row.order !== null && entryOrderIds.has(row.order.order_id),
  )
  const located = positionsByScope.get(seed.scopeId) ?? null
  const protection = commandNativeProtection(seed.primaryCommand, snapshot.native_protections)
  const attentionReason = tradeAttention(commands, orders, protection, located?.position ?? null)
  const economics = summarizeProjectionExecutions(executions)

  return {
    tradeId: `scope:${seed.scopeId}`,
    scopeId: seed.scopeId,
    symbol: tradeSymbol(snapshot, seed.primaryCommand, orders, located?.position ?? null),
    side: tradeSide(snapshot, seed.primaryCommand, orders, located?.exposure ?? null),
    entryLabel: entryLabel(seed.primaryCommand),
    lifecycle: tradeLifecycle(
      seed.primaryCommand,
      orders,
      located?.exposure ?? null,
      attentionReason,
      isClosing(snapshot, seed.scopeId),
    ),
    attentionReason,
    createdAt: seed.primaryCommand.accepted_at,
    primaryCommand: seed.primaryCommand,
    commands,
    position: located?.position ?? null,
    exposure: located?.exposure ?? null,
    orders,
    entryOrders,
    closeOrders,
    executions,
    protection,
    plannedRisk: plannedRisk(seed.primaryCommand),
    requestedQuantity:
      entryOrders.length === 0
        ? plannedQuantity(seed.primaryCommand)
        : sumExact(entryOrders.map((row) => row.target_quantity)),
    filledQuantity: sumExact(entryOrders.map((row) => row.filled_quantity)),
    remainingQuantity: located?.exposure.remaining_quantity ?? '0',
    averageEntryPrice: weightedAverage(entryExecutions),
    realizedPnl: economics.realizedPnl,
    netAfterFees: economics.netAfterFees,
    totalFees: economics.totalFees,
    builderFees: economics.builderFees,
  }
}

function isClosing(snapshot: BrowserAccountSnapshot, scopeId: string): boolean {
  return snapshot.close_workflows.some(
    (workflow) =>
      workflow.requested_reductions.some((row) => row.scope_id === scopeId) &&
      !terminalLifecycle(workflow.lifecycle),
  )
}

function tradeSymbol(
  snapshot: BrowserAccountSnapshot,
  command: CommandProjection,
  orders: OrderProjection[],
  position: PositionProjection | null,
): string {
  if (position !== null) return position.symbol
  if (orders[0] !== undefined) return orders[0].current_request.symbol
  if (command.root.kind === 'trailing_entry') {
    return (
      snapshot.trailing_entries.find((row) => row.trailing_entry_id === command.root.id)?.plan
        .symbol ?? '-'
    )
  }
  if (command.root.kind === 'chase') {
    return (
      stringValue(snapshot.chases.find((row) => row.chase_id === command.root.id)?.plan.symbol) ??
      '-'
    )
  }
  return nestedString(command.accepted.parameters, ['request', 'symbol']) ?? '-'
}

function tradeSide(
  snapshot: BrowserAccountSnapshot,
  command: CommandProjection,
  orders: OrderProjection[],
  exposure: OwnedExposureProjection | null,
): PositionSide {
  if (exposure !== null) return exposure.side
  if (orders[0] !== undefined) return orders[0].current_request.position_side
  if (command.root.kind === 'trailing_entry') {
    return (
      snapshot.trailing_entries.find((row) => row.trailing_entry_id === command.root.id)?.plan
        .position_side ?? 'long'
    )
  }
  if (command.root.kind === 'chase') {
    return stringValue(
      snapshot.chases.find((row) => row.chase_id === command.root.id)?.plan.position_side,
    ) === 'short'
      ? 'short'
      : 'long'
  }
  return nestedString(command.accepted.parameters, ['request', 'position_side']) === 'short'
    ? 'short'
    : 'long'
}

function plannedQuantity(command: CommandProjection): string | null {
  const parameters = command.accepted.parameters
  if (command.accepted.kind === 'place_chase') {
    return stringValue(objectValue(parameters.plan)?.quantity)
  }
  if (command.accepted.kind === 'place_order') {
    return stringValue(objectValue(parameters.request)?.quantity)
  }
  return null
}

function plannedRisk(command: CommandProjection): string | null {
  const parameters = command.accepted.parameters
  if (command.accepted.kind === 'place_trailing_entry') {
    return (
      stringValue(parameters.risk_amount) ?? stringValue(objectValue(parameters.plan)?.risk_amount)
    )
  }
  const sizing =
    objectValue(parameters.sizing) ?? objectValue(objectValue(parameters.request)?.sizing)
  return sizing?.kind === 'risk_at_stop' ? stringValue(sizing.loss_amount) : null
}

function entryLabel(command: CommandProjection): string {
  if (command.accepted.kind === 'place_order') {
    const kind = nestedString(command.accepted.parameters, ['request', 'execution', 'kind'])
    return kind === null ? 'Order' : `${title(kind)} order`
  }
  if (command.accepted.kind === 'place_execution_group') return 'Split order'
  return commandKindLabel(command.accepted.kind).replace(/ Order$/, '')
}

function tradeAttention(
  commands: CommandProjection[],
  orders: OrderProjection[],
  protection: NativeProtectionProjection | null,
  position: PositionProjection | null,
): string | null {
  if (position?.reconciliation_required) return 'Position reconciliation is required.'
  const failedCommand = commands.find(
    (row) => row.lifecycle === 'failed' || row.lifecycle === 'reconciliation_required',
  )
  if (failedCommand !== undefined) {
    return (
      failedCommand.failure_reason ?? `${commandKindLabel(failedCommand.accepted.kind)} failed.`
    )
  }
  const blockedOrder = orders.find(
    (row) => row.reconciliation_required || row.failure_reason !== null,
  )
  if (blockedOrder !== undefined) {
    return (
      blockedOrder.blocking_reason ?? blockedOrder.failure_reason ?? 'Order requires attention.'
    )
  }
  if (
    protection?.status === 'failed_unprotected' ||
    protection?.status === 'reconciliation_required'
  ) {
    return protection.failure_reason ?? 'Protection requires attention.'
  }
  return null
}

function tradeLifecycle(
  command: CommandProjection,
  orders: OrderProjection[],
  exposure: OwnedExposureProjection | null,
  attention: string | null,
  closing: boolean,
): ManagedTradeLifecycle {
  if (exposure?.detached) return 'taken_over'
  if (closing) return 'closing'
  const terminal =
    exposure !== null &&
    isExactZero(exposure.remaining_quantity) &&
    orders.every((row) => row.terminal)
  if (terminal) return 'closed'
  const failedWithoutExposure =
    exposure === null &&
    terminalLifecycle(command.lifecycle) &&
    orders.every(
      (row) =>
        row.terminal ||
        (isExactZero(row.target_quantity) && isExactZero(row.filled_quantity)),
    )
  if (failedWithoutExposure) return 'closed'
  if (attention !== null) return 'attention'
  if (exposure !== null && !isExactZero(exposure.remaining_quantity)) return 'active'
  if (
    command.lifecycle === 'running' ||
    command.lifecycle === 'partially_succeeded' ||
    orders.some((row) => !row.terminal)
  ) {
    return 'entering'
  }
  return 'closed'
}

function weightedAverage(executions: ExecutionProjection[]): string | null {
  if (executions.length === 0) return null
  const quantity = sumExact(executions.map((row) => row.fill.quantity))
  if (isExactZero(quantity)) return null
  const notional = sumExact(
    executions.map((row) => multiplyExact(row.fill.price, row.fill.quantity)),
  )
  return divideExact(notional, quantity, 8)
}
