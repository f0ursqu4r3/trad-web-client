import type {
  CommandProjection,
  NativeProtectionChildPlan,
  NativeProtectionPlan,
  NativeProtectionProjection,
  ProtectionAllocation,
  ProtectionAmendmentProjection,
  ProtectionExecution,
} from '../gateway/index.ts'
import { commandProtectionScopeId } from '../projection/presentation.ts'
import {
  newProtectionState,
  newTakeProfit,
  type ProtectionFormState,
  type StopLossFormState,
  type TakeProfitFormState,
} from './form.ts'

export function protectionForm(plan: NativeProtectionPlan): ProtectionFormState {
  const state = newProtectionState()
  state.takeProfits = plan.children
    .filter((child) => child.protection_kind === 'take_profit')
    .map(takeProfitForm)
  const stop = plan.children.find(
    (child) => child.protection_kind === 'stop_loss' || child.protection_kind === 'trailing_stop',
  )
  if (stop !== undefined) state.stopLoss = stopLossForm(stop)
  return state
}

export function commandNativeProtection(
  command: CommandProjection,
  protections: NativeProtectionProjection[],
): NativeProtectionProjection | null {
  const explicitId =
    command.accepted.kind === 'amend_protection'
      ? primitiveString(command.accepted.parameters.protection_id)
      : null
  const scopeId = commandProtectionScopeId(command)
  return (
    protections.find(
      (protection) =>
        (explicitId !== null && protection.protection_id === explicitId) ||
        (scopeId !== null && protection.scope_id === scopeId),
    ) ?? null
  )
}

export function activeProtectionAmendment(
  protection: NativeProtectionProjection | null,
  amendments: ProtectionAmendmentProjection[],
): ProtectionAmendmentProjection | null {
  if (protection === null) return null
  return (
    amendments.find(
      (amendment) =>
        amendment.protection_id === protection.protection_id &&
        (amendment.lifecycle === 'applying' || amendment.lifecycle === 'stopping'),
    ) ?? null
  )
}

function takeProfitForm(child: NativeProtectionChildPlan): TakeProfitFormState {
  const form = newTakeProfit(child.child_id)
  form.childId = child.child_id
  form.triggerPrice = child.trigger_price
  form.triggerSource = child.trigger_source
  applyExecution(form, child.execution)
  applyAllocation(form, child.allocation)
  return form
}

function stopLossForm(child: NativeProtectionChildPlan): StopLossFormState {
  const form: StopLossFormState = {
    childId: child.child_id,
    enabled: true,
    triggerPrice: child.trigger_price,
    triggerSource: child.trigger_source,
    executionKind: 'market',
    executionPrice: '',
  }
  applyExecution(form, child.execution)
  return form
}

function applyExecution(
  form: { executionKind: 'market' | 'limit'; executionPrice: string },
  execution: ProtectionExecution,
): void {
  if (execution.kind === 'limit') {
    form.executionKind = 'limit'
    form.executionPrice = execution.price
    return
  }
  form.executionKind = 'market'
  form.executionPrice = ''
}

function applyAllocation(form: TakeProfitFormState, allocation: ProtectionAllocation): void {
  switch (allocation.kind) {
    case 'full_remaining':
      form.allocationKind = 'full_remaining'
      form.allocationValue = ''
      return
    case 'fraction':
      form.allocationKind = 'fraction'
      form.allocationValue = decimalShift(allocation.value, 2)
      return
    case 'pro_rata':
      form.allocationKind = 'fraction'
      form.allocationValue = decimalShift(allocation.fraction, 2)
      return
    case 'exact':
      form.allocationKind = 'exact_base'
      form.allocationValue = allocation.value
  }
}

function decimalShift(value: string, places: number): string {
  const [whole = '0', fraction = ''] = value.split('.')
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  const scale = fraction.length - places
  const raw =
    scale <= 0
      ? `${digits}${'0'.repeat(-scale)}`
      : digits.length <= scale
        ? `0.${'0'.repeat(scale - digits.length)}${digits}`
        : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`
  return (
    raw
      .replace(/^0+(?=\d)/, '')
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?)0+$/, '$1') || '0'
  )
}

function primitiveString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}
