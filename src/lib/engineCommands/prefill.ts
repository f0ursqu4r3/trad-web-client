import { multiplyExact, sumExact } from '../exactDecimalMath.ts'
import type {
  BrowserCommandIntent,
  OrderSizingIntent,
  PositionSideIntent,
  ProtectionIntent,
  TimeInForceIntent,
} from '../gateway/intent.ts'
import type { CommandProjection } from '../gateway/projection.ts'
import type {
  ProtectionFormState,
  ShapeMode,
  StopLossFormState,
  TakeProfitFormState,
} from './form.ts'
import type { ChaseCommandDraft, OrderCommandDraft, TrailingEntryCommandDraft } from './intents.ts'

export type EngineCommandModalName =
  | 'EngineMarketOrder'
  | 'EngineLimitOrder'
  | 'EngineChaseOrder'
  | 'EngineTrailingEntry'

export type EngineCommandPrefill =
  | {
      modal: 'EngineMarketOrder' | 'EngineLimitOrder'
      values: OrderCommandPrefill
    }
  | { modal: 'EngineChaseOrder'; values: ChaseCommandPrefill }
  | { modal: 'EngineTrailingEntry'; values: TrailingEntryCommandPrefill }

export interface OrderCommandPrefill extends OrderCommandDraft {
  accountId: string
}

export interface ChaseCommandPrefill extends ChaseCommandDraft {
  accountId: string
}

export interface TrailingEntryCommandPrefill extends TrailingEntryCommandDraft {
  accountId: string
}

export function duplicateCommandPrefill(
  command: CommandProjection,
  accountId: string,
): EngineCommandPrefill | null {
  try {
    const authored = command.planning?.authored_intent
    if (authored) return authoredIntentPrefill(authored, accountId)
    switch (command.accepted.kind) {
      case 'place_order':
        return orderPrefill(command.accepted.parameters, accountId, false)
      case 'place_execution_group':
        return orderPrefill(command.accepted.parameters, accountId, true)
      case 'place_chase':
        return chasePrefill(command, accountId)
      case 'place_trailing_entry':
        return trailingEntryPrefill(command.accepted.parameters, accountId)
      default:
        return null
    }
  } catch {
    return null
  }
}

function authoredIntentPrefill(
  intent: BrowserCommandIntent,
  accountId: string,
): EngineCommandPrefill | null {
  switch (intent.kind) {
    case 'place_order': {
      const value = intent.parameters
      const sizing = authoredSizing(value.sizing)
      const split = value.shape.kind === 'split'
      return {
        modal: value.execution.kind === 'market' ? 'EngineMarketOrder' : 'EngineLimitOrder',
        values: {
          accountId,
          executionKind: value.execution.kind,
          symbol: value.symbol,
          positionSide: value.position_side,
          ...sizing,
          limitPrice: value.execution.kind === 'limit' ? value.execution.price : '',
          timeInForce:
            value.execution.kind === 'limit' ? value.execution.time_in_force : 'good_til_canceled',
          shapeMode: split ? 'split' : 'single',
          targetChildNotional:
            value.shape.kind === 'split' ? (value.shape.target_child_notional ?? '') : '',
          maxChildren: value.shape.kind === 'split' ? String(value.shape.max_children) : '20',
          protection: authoredProtection(value.protection),
        },
      }
    }
    case 'place_chase': {
      const value = intent.parameters
      const boundary = value.adverse_boundary
      return {
        modal: 'EngineChaseOrder',
        values: {
          accountId,
          symbol: value.symbol,
          positionSide: value.position_side,
          ...authoredSizing(value.sizing),
          boundaryKind: boundary?.kind ?? 'none',
          boundaryValue: boundary?.value ?? '',
          expirySeconds:
            value.expires_after_ms === undefined ? '' : String(value.expires_after_ms / 1_000),
          remainder: value.remainder,
          protection: authoredProtection(value.protection),
        },
      }
    }
    case 'place_trailing_entry': {
      const value = intent.parameters
      const split = value.shape.kind === 'split'
      return {
        modal: 'EngineTrailingEntry',
        values: {
          accountId,
          symbol: value.symbol,
          positionSide: value.position_side,
          activationPrice: value.activation_price,
          jumpBasisPoints: value.jump_basis_points,
          stopLossPrice: value.stop_loss_price,
          takeProfitPrice: value.take_profit_price ?? '',
          riskAmount: value.risk_amount,
          shapeMode: split ? 'split' : 'single',
          targetChildNotional:
            value.shape.kind === 'split' ? (value.shape.target_child_notional ?? '') : '',
          maxChildren: value.shape.kind === 'split' ? String(value.shape.max_children) : '20',
          oneWaySemantics: value.one_way_semantics,
        },
      }
    }
    default:
      return null
  }
}

function authoredSizing(sizing: OrderSizingIntent): {
  sizingMode: 'base' | 'quote_notional' | 'risk_at_stop'
  amount: string
} {
  switch (sizing.kind) {
    case 'base':
      return { sizingMode: 'base', amount: sizing.quantity }
    case 'quote_notional':
      return { sizingMode: 'quote_notional', amount: sizing.amount }
    case 'risk_at_stop':
      return { sizingMode: 'risk_at_stop', amount: sizing.loss_amount }
  }
}

function authoredProtection(protection: ProtectionIntent | undefined): ProtectionFormState {
  if (!protection) return emptyProtection()
  return {
    takeProfits: protection.take_profits.map((takeProfit, index) => ({
      id: `duplicate-tp-${index}`,
      triggerPrice: takeProfit.trigger_price,
      triggerSource: takeProfit.trigger_source,
      executionKind: takeProfit.execution.kind,
      executionPrice: takeProfit.execution.kind === 'limit' ? takeProfit.execution.price : '',
      allocationKind: takeProfit.allocation.kind,
      allocationValue:
        takeProfit.allocation.kind === 'fraction'
          ? multiplyExact(takeProfit.allocation.fraction, '100')
          : takeProfit.allocation.kind === 'exact_base'
            ? takeProfit.allocation.quantity
            : '',
    })),
    stopLoss: protection.stop_loss
      ? {
          enabled: true,
          triggerPrice: protection.stop_loss.trigger_price,
          triggerSource: protection.stop_loss.trigger_source,
          executionKind: protection.stop_loss.execution.kind,
          executionPrice:
            protection.stop_loss.execution.kind === 'limit'
              ? protection.stop_loss.execution.price
              : '',
        }
      : emptyProtection().stopLoss,
  }
}

function orderPrefill(
  parameters: Record<string, unknown>,
  accountId: string,
  split: boolean,
): Extract<EngineCommandPrefill, { modal: 'EngineMarketOrder' | 'EngineLimitOrder' }> {
  const requests = split
    ? requiredArray(parameters.children, 'execution children').map((child) =>
        requiredRecord(requiredRecord(child, 'execution child').request, 'order request'),
      )
    : [requiredRecord(parameters.request, 'order request')]
  if (split && parameters.purpose !== 'split') throw new Error('group is not a split order')
  if (requests.length === 0) throw new Error('split order has no children')

  const first = requests[0]!
  const symbol = requiredString(first.symbol, 'symbol')
  const positionSide = positionSideValue(first.position_side)
  const execution = requiredRecord(first.execution, 'execution')
  const executionKind = executionKindValue(execution.kind)
  for (const request of requests.slice(1)) {
    if (
      requiredString(request.symbol, 'symbol') !== symbol ||
      positionSideValue(request.position_side) !== positionSide ||
      executionKindValue(requiredRecord(request.execution, 'execution').kind) !== executionKind
    ) {
      throw new Error('split order children do not share one duplicable shape')
    }
  }

  const quantity = sumExact(requests.map((request) => exactString(request.quantity, 'quantity')))
  const shape = shapeFields(split ? requests.length : 1)
  const protection = protectionForm(parameters.protection)
  const draft: OrderCommandPrefill = {
    accountId,
    executionKind,
    symbol,
    positionSide,
    sizingMode: 'base',
    amount: quantity,
    limitPrice: executionKind === 'limit' ? exactString(execution.price, 'limit price') : '',
    timeInForce:
      executionKind === 'limit' ? timeInForceValue(execution.time_in_force) : 'good_til_canceled',
    ...shape,
    protection,
  }
  return {
    modal: executionKind === 'market' ? 'EngineMarketOrder' : 'EngineLimitOrder',
    values: draft,
  }
}

function chasePrefill(command: CommandProjection, accountId: string): EngineCommandPrefill {
  const plan = requiredRecord(command.accepted.parameters.plan, 'Chase plan')
  const boundary = optionalRecord(plan.adverse_boundary)
  const expiresAt = optionalSafeInteger(plan.expires_at)
  const expiry = expiresAt === null ? '' : durationSeconds(expiresAt - command.accepted_at)
  const boundaryKind =
    boundary === null ? 'none' : boundary.kind === 'price' ? 'price' : 'basis_points'
  const values: ChaseCommandPrefill = {
    accountId,
    symbol: requiredString(plan.symbol, 'symbol'),
    positionSide: positionSideValue(plan.position_side),
    sizingMode: 'base',
    amount: exactString(plan.quantity, 'quantity'),
    boundaryKind,
    boundaryValue: boundary === null ? '' : exactString(boundary.value, 'boundary'),
    expirySeconds: expiry,
    remainder: plan.remainder_policy === 'market_fill' ? 'market_fill' : 'cancel',
    protection: protectionForm(plan.protection),
  }
  return { modal: 'EngineChaseOrder', values }
}

function trailingEntryPrefill(
  parameters: Record<string, unknown>,
  accountId: string,
): EngineCommandPrefill {
  const plan = requiredRecord(parameters.plan, 'Trailing Entry plan')
  const execution = requiredRecord(plan.execution, 'Trailing Entry execution')
  const children = requiredArray(execution.children, 'Trailing Entry children')
  if (children.length === 0) throw new Error('Trailing Entry has no execution children')
  const oneWay = optionalRecord(plan.one_way)
  const values: TrailingEntryCommandPrefill = {
    accountId,
    symbol: requiredString(plan.symbol, 'symbol'),
    positionSide: positionSideValue(plan.position_side),
    activationPrice: exactString(plan.activation_price, 'activation price'),
    jumpBasisPoints: exactString(plan.jump_threshold, 'jump threshold'),
    stopLossPrice: exactString(plan.stop_loss, 'stop loss'),
    takeProfitPrice: optionalExactString(plan.take_profit),
    riskAmount: exactString(plan.risk_amount, 'risk amount'),
    ...shapeFields(children.length),
    oneWaySemantics:
      oneWay?.semantics === 'target_side_exposure' ? 'target_side_exposure' : 'delta',
  }
  return { modal: 'EngineTrailingEntry', values }
}

function protectionForm(value: unknown): ProtectionFormState {
  const plan = optionalRecord(value)
  if (plan === null) return emptyProtection()
  const controller = requiredRecord(plan.controller, 'protection controller')
  const children =
    controller.kind === 'native'
      ? requiredArray(controller.children, 'protection children')
      : controller.kind === 'stop_guard'
        ? [controller]
        : (() => {
            throw new Error('unsupported protection controller')
          })()
  const takeProfits: TakeProfitFormState[] = []
  let stopLoss: StopLossFormState = emptyProtection().stopLoss

  for (const [index, value] of children.entries()) {
    const child = requiredRecord(value, 'protection child')
    const execution = protectionExecution(child.execution)
    const common = {
      triggerPrice: exactString(child.trigger_price, 'protection trigger'),
      triggerSource: triggerSourceValue(child.trigger_source),
      executionKind: execution.kind,
      executionPrice: execution.price,
    }
    if (child.protection_kind === 'take_profit') {
      const allocation = protectionAllocation(child.allocation)
      takeProfits.push({ id: `duplicate-tp-${index}`, ...common, ...allocation })
    } else if (child.protection_kind === 'stop_loss') {
      if (stopLoss.enabled) throw new Error('multiple stop losses cannot be prefilled')
      stopLoss = { enabled: true, ...common }
    } else {
      throw new Error('trailing-stop protection cannot be prefilled')
    }
  }
  return { takeProfits, stopLoss }
}

function protectionExecution(value: unknown): {
  kind: 'market' | 'limit'
  price: string
} {
  const execution = requiredRecord(value, 'protection execution')
  if (execution.kind === 'limit') {
    return { kind: 'limit', price: exactString(execution.price, 'protection limit') }
  }
  if (execution.kind === 'market' || execution.kind === 'bounded_market') {
    return { kind: 'market', price: '' }
  }
  throw new Error('unsupported protection execution')
}

function protectionAllocation(
  value: unknown,
): Pick<TakeProfitFormState, 'allocationKind' | 'allocationValue'> {
  const allocation = requiredRecord(value, 'protection allocation')
  switch (allocation.kind) {
    case 'full_remaining':
      return { allocationKind: 'full_remaining', allocationValue: '' }
    case 'fraction':
      return {
        allocationKind: 'fraction',
        allocationValue: multiplyExact(exactString(allocation.value, 'allocation'), '100'),
      }
    case 'pro_rata':
      return {
        allocationKind: 'fraction',
        allocationValue: multiplyExact(exactString(allocation.fraction, 'allocation'), '100'),
      }
    case 'exact':
      return {
        allocationKind: 'exact_base',
        allocationValue: exactString(allocation.value, 'allocation'),
      }
    default:
      throw new Error('unsupported protection allocation')
  }
}

function shapeFields(children: number): {
  shapeMode: ShapeMode
  targetChildNotional: string
  maxChildren: string
} {
  return {
    shapeMode: children > 1 ? 'split' : 'single',
    targetChildNotional: '',
    maxChildren: String(children > 1 ? children : 20),
  }
}

function emptyProtection(): ProtectionFormState {
  return {
    takeProfits: [],
    stopLoss: {
      enabled: false,
      triggerPrice: '',
      triggerSource: 'mark_price',
      executionKind: 'market',
      executionPrice: '',
    },
  }
}

function durationSeconds(milliseconds: number): string {
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds % 1_000 !== 0) {
    throw new Error('Chase expiry cannot be represented as whole seconds')
  }
  return String(milliseconds / 1_000)
}

function executionKindValue(value: unknown): 'market' | 'limit' {
  if (value === 'market' || value === 'limit') return value
  throw new Error('unsupported order execution')
}

function positionSideValue(value: unknown): PositionSideIntent {
  if (value === 'long' || value === 'short') return value
  throw new Error('invalid position side')
}

function timeInForceValue(value: unknown): TimeInForceIntent {
  if (value === 'good_til_canceled' || value === 'post_only') return value
  throw new Error('unsupported time in force')
}

function triggerSourceValue(value: unknown): 'last_price' | 'mark_price' | 'index_price' {
  if (value === 'last_price' || value === 'mark_price' || value === 'index_price') return value
  throw new Error('unsupported trigger source')
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`${label} is not an exact decimal`)
  }
  return value
}

function optionalExactString(value: unknown): string {
  return value === undefined || value === null ? '' : exactString(value, 'optional price')
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${label} is missing`)
  return value
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value)
  if (record === null) throw new Error(`${label} is missing`)
  return record
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is missing`)
  return value
}

function optionalSafeInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isSafeInteger(value)) throw new Error('timestamp is invalid')
  return value as number
}
