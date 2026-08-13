import type {
  BrowserCommandIntent,
  AmendProtectionIntent,
  ExecutionShapeIntent,
  OrderSizingIntent,
  ProtectionExecutionIntent,
  ProtectionIntent,
  TakeProfitAllocationIntent,
  TriggerSourceIntent,
  Uuid,
} from '@/lib/gateway'

export type SizingMode = 'quote_notional' | 'base' | 'risk_at_stop'
export type PersistedSizingMode = 'notional' | 'base' | 'risk'
export type ShapeMode = 'single' | 'split'
export type AllocationMode = 'full_remaining' | 'fraction' | 'exact_base'

export function sizingModeFromPreference(mode: PersistedSizingMode): SizingMode {
  switch (mode) {
    case 'notional':
      return 'quote_notional'
    case 'base':
      return 'base'
    case 'risk':
      return 'risk_at_stop'
  }
}

export function sizingModePreference(mode: SizingMode): PersistedSizingMode {
  switch (mode) {
    case 'quote_notional':
      return 'notional'
    case 'base':
      return 'base'
    case 'risk_at_stop':
      return 'risk'
  }
}

export interface EngineCommandSubmission {
  accountId: Uuid
  intent: BrowserCommandIntent
}

export interface ProtectionFormState {
  takeProfits: TakeProfitFormState[]
  stopLoss: StopLossFormState
}

export interface TakeProfitFormState {
  id: string
  childId?: Uuid
  triggerPrice: string
  triggerSource: TriggerSourceIntent
  executionKind: 'market' | 'limit'
  executionPrice: string
  allocationKind: AllocationMode
  allocationValue: string
}

export interface StopLossFormState {
  childId?: Uuid
  enabled: boolean
  triggerPrice: string
  triggerSource: TriggerSourceIntent
  executionKind: 'market' | 'limit'
  executionPrice: string
}

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

export function exactDecimal(value: string, label: string, allowZero = false): string {
  const normalized = value.trim()
  if (!DECIMAL.test(normalized)) {
    throw new Error(`${label} must be a plain decimal number`)
  }
  if (!allowZero && decimalIsZero(normalized)) {
    throw new Error(`${label} must be greater than zero`)
  }
  return normalized
}

export function optionalExactDecimal(value: string, label: string): string | null {
  return value.trim() === '' ? null : exactDecimal(value, label)
}

export function normalizedSymbol(value: string): string {
  const symbol = value.trim().toUpperCase()
  if (symbol.length === 0) throw new Error('symbol is required')
  if (symbol.length > 32 || !/^[A-Z0-9._:-]+$/.test(symbol)) {
    throw new Error('symbol contains unsupported characters')
  }
  return symbol
}

export function sizingIntent(mode: SizingMode, value: string): OrderSizingIntent {
  switch (mode) {
    case 'base':
      return { kind: 'base', quantity: exactDecimal(value, 'base quantity') }
    case 'quote_notional':
      return { kind: 'quote_notional', amount: exactDecimal(value, 'quote notional') }
    case 'risk_at_stop':
      return { kind: 'risk_at_stop', loss_amount: exactDecimal(value, 'risk amount') }
  }
}

export function shapeIntent(
  mode: ShapeMode,
  targetChildNotional: string,
  maxChildren: string,
): ExecutionShapeIntent {
  if (mode === 'single') return { kind: 'single' }
  const parsedMax = Number(maxChildren)
  if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 50) {
    throw new Error('split max children must be between 1 and 50')
  }
  const target = optionalExactDecimal(targetChildNotional, 'target child notional')
  return {
    kind: 'split',
    ...(target === null ? {} : { target_child_notional: target }),
    max_children: parsedMax,
  }
}

export function protectionIntent(state: ProtectionFormState): ProtectionIntent | undefined {
  const takeProfits = state.takeProfits.map((takeProfit, index) => ({
    trigger_price: exactDecimal(takeProfit.triggerPrice, `take-profit ${index + 1} trigger`),
    trigger_source: takeProfit.triggerSource,
    execution: protectionExecution(takeProfit, `take-profit ${index + 1}`),
    allocation: takeProfitAllocation(takeProfit, index),
  }))
  const stopLoss = state.stopLoss.enabled
    ? {
        trigger_price: exactDecimal(state.stopLoss.triggerPrice, 'stop-loss trigger'),
        trigger_source: state.stopLoss.triggerSource,
        execution: protectionExecution(state.stopLoss, 'stop loss'),
      }
    : undefined
  if (takeProfits.length === 0 && stopLoss === undefined) return undefined
  return { take_profits: takeProfits, ...(stopLoss === undefined ? {} : { stop_loss: stopLoss }) }
}

export function protectionAmendmentIntent(
  protectionId: Uuid,
  expectedPlanRevision: number,
  state: ProtectionFormState,
): BrowserCommandIntent {
  if (!Number.isInteger(expectedPlanRevision) || expectedPlanRevision < 1) {
    throw new Error('protection plan revision is invalid')
  }
  const protection = protectionIntent(state)
  if (protection === undefined) throw new Error('at least one protection leg is required')
  const parameters: AmendProtectionIntent = {
    protection_id: protectionId,
    expected_plan_revision: expectedPlanRevision,
    take_profits: protection.take_profits.map((takeProfit, index) => ({
      ...(state.takeProfits[index]?.childId === undefined
        ? {}
        : { child_id: state.takeProfits[index]!.childId }),
      ...takeProfit,
    })),
    ...(protection.stop_loss === undefined
      ? {}
      : {
          stop_loss: {
            ...(state.stopLoss.childId === undefined ? {} : { child_id: state.stopLoss.childId }),
            ...protection.stop_loss,
          },
        }),
  }
  return { kind: 'amend_protection', parameters }
}

export function newTakeProfit(id: string = crypto.randomUUID()): TakeProfitFormState {
  return {
    id,
    triggerPrice: '',
    triggerSource: 'mark_price',
    executionKind: 'market',
    executionPrice: '',
    allocationKind: 'full_remaining',
    allocationValue: '',
  }
}

export function newProtectionState(): ProtectionFormState {
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

export function copyProtectionState(state: ProtectionFormState): ProtectionFormState {
  return {
    takeProfits: state.takeProfits.map((takeProfit) => ({ ...takeProfit })),
    stopLoss: { ...state.stopLoss },
  }
}

function protectionExecution(
  state: { executionKind: 'market' | 'limit'; executionPrice: string },
  label: string,
): ProtectionExecutionIntent {
  return state.executionKind === 'market'
    ? { kind: 'market' }
    : { kind: 'limit', price: exactDecimal(state.executionPrice, `${label} limit price`) }
}

function takeProfitAllocation(
  state: TakeProfitFormState,
  index: number,
): TakeProfitAllocationIntent {
  switch (state.allocationKind) {
    case 'full_remaining':
      return { kind: 'full_remaining' }
    case 'fraction':
      return {
        kind: 'fraction',
        fraction: percentToFraction(state.allocationValue, `take-profit ${index + 1} allocation`),
      }
    case 'exact_base':
      return {
        kind: 'exact_base',
        quantity: exactDecimal(state.allocationValue, `take-profit ${index + 1} base allocation`),
      }
  }
}

export function percentToFraction(value: string, label: string): string {
  const percent = exactDecimal(value, label)
  const [whole = '0', fraction = ''] = percent.split('.')
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '')
  const scale = fraction.length + 2
  const padded = digits.padStart(scale + 1, '0')
  const split = padded.length - scale
  const result = `${padded.slice(0, split)}.${padded.slice(split)}`
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
  if (compareDecimal(result, '1') > 0) throw new Error(`${label} cannot exceed 100%`)
  return result
}

function decimalIsZero(value: string): boolean {
  return value.replace(/[0.]/g, '').length === 0
}

function compareDecimal(left: string, right: string): number {
  const [leftWhole, leftFraction = ''] = left.split('.')
  const [rightWhole, rightFraction = ''] = right.split('.')
  if (leftWhole!.length !== rightWhole!.length) return leftWhole!.length - rightWhole!.length
  const whole = leftWhole!.localeCompare(rightWhole!)
  if (whole !== 0) return whole
  const size = Math.max(leftFraction.length, rightFraction.length)
  return leftFraction.padEnd(size, '0').localeCompare(rightFraction.padEnd(size, '0'))
}
