import type {
  BrowserCommandIntent,
  CommandProjection,
  PositionProjection,
  ProjectionGraph,
  TrailingEntryExpectedIntent,
} from '../gateway/index.ts'
import { nodeKey } from '../projection/index.ts'
import { projectionEntities, type ProjectionEntity } from '../projection/presentation.ts'
import { exactDecimal } from './form.ts'

export type LifecycleActionKind =
  | 'cancel_order'
  | 'modify_order'
  | 'cancel_chase'
  | 'cancel_trailing_entry'
  | 'amend_trailing_entry'
  | 'activate_trailing_entry'
  | 'enter_trailing_entry'
  | 'continue_trailing_entry'
  | 'close_trailing_entry'
  | 'close_exposure'

export interface LifecycleAction {
  kind: LifecycleActionKind
  label: string
  danger: boolean
  command: CommandProjection
  target: ProjectionEntity
}

export interface TrailingEntryAmendmentDraft {
  activationPrice: string
  jumpBasisPoints: string
  stopLossPrice: string
  takeProfitMode: 'unchanged' | 'set' | 'clear'
  takeProfitPrice: string
  riskAmount: string
}

export function lifecycleActions(
  selected: ProjectionEntity | null,
  graph: ProjectionGraph | null,
  positions: PositionProjection[] = [],
): LifecycleAction[] {
  if (selected === null || graph === null) return []
  const command = commandFor(selected, graph)
  const target = command === null ? null : actionTarget(selected, command, graph)
  if (command === null || target === null) return []
  const actions: LifecycleAction[] = []

  switch (target.kind) {
    case 'order':
      if (!target.row.terminal) {
        actions.push(action('cancel_order', 'Cancel Order', false, command, target))
        if (target.row.current_request.execution.kind === 'limit') {
          actions.push(action('modify_order', 'Modify Order', false, command, target))
        }
      }
      break
    case 'chase':
      if (command.lifecycle === 'running') {
        actions.push(action('cancel_chase', 'Cancel Chase', false, command, target))
      }
      break
    case 'trailing_entry':
      addTrailingEntryActions(actions, command, target)
      break
    default:
      break
  }

  if (sourceHasExposure(command, positions)) {
    const isTrailingEntry = target.kind === 'trailing_entry'
    const alreadyHasClose =
      target.kind === 'trailing_entry' && target.row.close_workflow_id !== null
    if (!alreadyHasClose && (!isTrailingEntry || target.row.trigger !== null)) {
      actions.push(
        action(
          isTrailingEntry ? 'close_trailing_entry' : 'close_exposure',
          isTrailingEntry ? 'Close Position' : 'Close Exposure',
          true,
          command,
          target,
        ),
      )
    }
  }
  return dedupe(actions)
}

export function lifecycleIntent(
  action: LifecycleAction,
  fields: {
    closeMode?: 'full' | 'base'
    closeQuantity?: string
    targetPrice?: string
    targetQuantity?: string
    trailingEntry?: TrailingEntryAmendmentDraft
    closeExecutionMode?: 'market' | 'limit' | 'chase'
    closeLimitPrice?: string
    closeLimitTimeInForce?: 'good_til_canceled' | 'post_only'
    closeChaseBoundaryMode?: 'basis_points' | 'price'
    closeChaseBoundaryValue?: string
    closeChaseBoundaryEnabled?: boolean
    closeChaseUntilCanceled?: boolean
    closeChaseExpiryMinutes?: string
  } = {},
): BrowserCommandIntent {
  switch (action.kind) {
    case 'cancel_order':
      return { kind: 'cancel_order', parameters: { order_id: requireTarget(action, 'order').id } }
    case 'modify_order':
      return {
        kind: 'modify_order',
        parameters: {
          order_id: requireTarget(action, 'order').id,
          target_price: exactDecimal(fields.targetPrice ?? '', 'target price'),
          target_base_quantity: exactDecimal(fields.targetQuantity ?? '', 'target base quantity'),
        },
      }
    case 'cancel_chase':
      return { kind: 'cancel_chase', parameters: { chase_id: requireTarget(action, 'chase').id } }
    case 'cancel_trailing_entry':
      return {
        kind: 'cancel_trailing_entry',
        parameters: { trailing_entry_id: requireTarget(action, 'trailing_entry').id },
      }
    case 'continue_trailing_entry':
      return {
        kind: 'continue_trailing_entry',
        parameters: { trailing_entry_id: requireTarget(action, 'trailing_entry').id },
      }
    case 'close_trailing_entry':
      return {
        kind: 'close_trailing_entry',
        parameters: { trailing_entry_id: requireTarget(action, 'trailing_entry').id },
      }
    case 'activate_trailing_entry':
    case 'enter_trailing_entry': {
      const entry = requireTarget(action, 'trailing_entry')
      return {
        kind: action.kind,
        parameters: { trailing_entry_id: entry.id, expected: expectedTrailingEntry(entry) },
      }
    }
    case 'amend_trailing_entry': {
      const entry = requireTarget(action, 'trailing_entry')
      const draft = fields.trailingEntry
      if (draft === undefined) throw new Error('Trailing Entry amendment fields are missing')
      const takeProfit =
        draft.takeProfitMode === 'unchanged'
          ? undefined
          : draft.takeProfitMode === 'clear'
            ? { kind: 'clear' as const }
            : {
                kind: 'set' as const,
                price: exactDecimal(draft.takeProfitPrice, 'take-profit price'),
              }
      return {
        kind: 'amend_trailing_entry',
        parameters: {
          trailing_entry_id: entry.id,
          expected: expectedTrailingEntry(entry),
          activation_price: exactDecimal(draft.activationPrice, 'activation price'),
          jump_basis_points: exactDecimal(draft.jumpBasisPoints, 'jump basis points'),
          stop_loss_price: exactDecimal(draft.stopLossPrice, 'stop-loss price'),
          ...(takeProfit === undefined ? {} : { take_profit: takeProfit }),
          risk_amount: exactDecimal(draft.riskAmount, 'risk amount'),
        },
      }
    }
    case 'close_exposure':
      return {
        kind: 'close_exposure',
        parameters: {
          source_command_id: action.command.command_id,
          quantity:
            fields.closeMode === 'base'
              ? {
                  kind: 'base',
                  quantity: exactDecimal(fields.closeQuantity ?? '', 'close quantity'),
                }
              : { kind: 'full' },
          execution: closeExecutionIntent(fields),
        },
      }
  }
}

function closeExecutionIntent(fields: {
  closeExecutionMode?: 'market' | 'limit' | 'chase'
  closeLimitPrice?: string
  closeLimitTimeInForce?: 'good_til_canceled' | 'post_only'
  closeChaseBoundaryMode?: 'basis_points' | 'price'
  closeChaseBoundaryValue?: string
  closeChaseBoundaryEnabled?: boolean
  closeChaseUntilCanceled?: boolean
  closeChaseExpiryMinutes?: string
}): Extract<
  BrowserCommandIntent,
  { kind: 'close_exposure' }
>['parameters']['execution'] {
  switch (fields.closeExecutionMode ?? 'market') {
    case 'market':
      return { kind: 'market' }
    case 'limit':
      return {
        kind: 'limit',
        price: exactDecimal(fields.closeLimitPrice ?? '', 'close limit price'),
        time_in_force: fields.closeLimitTimeInForce ?? 'post_only',
      }
    case 'chase': {
      const adverseBoundary =
        fields.closeChaseBoundaryEnabled === false
          ? undefined
          : {
              kind: fields.closeChaseBoundaryMode ?? 'basis_points',
              value: exactDecimal(
                fields.closeChaseBoundaryValue ?? '',
                'close Chase adverse boundary',
              ),
            }
      const expiresAfterMs = fields.closeChaseUntilCanceled
        ? undefined
        : durationMillis(fields.closeChaseExpiryMinutes ?? '', 'close Chase expiry')
      return {
        kind: 'chase',
        ...(adverseBoundary === undefined ? {} : { adverse_boundary: adverseBoundary }),
        ...(expiresAfterMs === undefined ? {} : { expires_after_ms: expiresAfterMs }),
      }
    }
  }
}

function durationMillis(minutes: string, label: string): number {
  const value = Number(exactDecimal(minutes, label))
  const milliseconds = value * 60_000
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error(`${label} must resolve to a positive whole millisecond duration`)
  }
  return milliseconds
}

function addTrailingEntryActions(
  actions: LifecycleAction[],
  command: CommandProjection,
  target: Extract<ProjectionEntity, { kind: 'trailing_entry' }>,
): void {
  if (target.row.lifecycle === 'running') {
    actions.push(action('amend_trailing_entry', 'Edit', false, command, target))
    if (target.row.phase === 'waiting_for_activation') {
      actions.push(action('activate_trailing_entry', 'Activate Now', false, command, target))
    }
    actions.push(action('enter_trailing_entry', 'Enter Now', true, command, target))
  }
  if (target.row.lifecycle === 'entry_paused') {
    actions.push(action('continue_trailing_entry', 'Continue Entry', true, command, target))
  }
  if (
    ![
      'position_open',
      'closing',
      'completed',
      'reduced_opposite',
      'stop_hit',
      'canceled',
      'failed',
    ].includes(target.row.lifecycle)
  ) {
    actions.push(action('cancel_trailing_entry', 'Cancel Entry', false, command, target))
  }
}

function action(
  kind: LifecycleActionKind,
  label: string,
  danger: boolean,
  command: CommandProjection,
  target: ProjectionEntity,
): LifecycleAction {
  return { kind, label, danger, command, target }
}

function commandFor(selected: ProjectionEntity, graph: ProjectionGraph): CommandProjection | null {
  const commandId = selected.kind === 'command' ? selected.id : selected.row.command_id
  return graph.commands.find((command) => command.command_id === commandId) ?? null
}

function actionTarget(
  selected: ProjectionEntity,
  command: CommandProjection,
  graph: ProjectionGraph,
): ProjectionEntity | null {
  if (
    selected.kind !== 'command' &&
    !['place_chase', 'place_trailing_entry'].includes(command.accepted.kind)
  ) {
    return selected
  }
  return projectionEntities(graph).get(nodeKey(command.root)) ?? null
}

function sourceHasExposure(command: CommandProjection, positions: PositionProjection[]): boolean {
  const scopeId = sourceScopeId(command)
  if (scopeId === null) return false
  return positions.some((position) => {
    const exposure = position.owned_exposure[scopeId]
    return exposure !== undefined && decimalIsNonZero(exposure.remaining_quantity)
  })
}

function sourceScopeId(command: CommandProjection): string | null {
  const parameters = command.accepted.parameters
  switch (command.accepted.kind) {
    case 'place_order':
      return positionIntentScope(parameters.position_intent)
    case 'place_execution_group': {
      const children = Array.isArray(parameters.children) ? parameters.children : []
      const child = objectValue(children[0])
      return positionIntentScope(child?.position_intent)
    }
    case 'place_chase': {
      const plan = objectValue(parameters.plan)
      return positionIntentScope(plan?.position_intent)
    }
    case 'place_trailing_entry': {
      const plan = objectValue(parameters.plan)
      const execution = objectValue(plan?.execution)
      return stringValue(execution?.exposure_scope_id)
    }
    default:
      return null
  }
}

function positionIntentScope(value: unknown): string | null {
  const intent = objectValue(value)
  if (intent === null || intent.kind !== 'open') return null
  return stringValue(intent.scope_id)
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function decimalIsNonZero(value: string): boolean {
  return value.replace(/[0.]/g, '').length > 0
}

function expectedTrailingEntry(
  entry: Extract<ProjectionEntity, { kind: 'trailing_entry' }>,
): TrailingEntryExpectedIntent {
  return {
    state_revision: entry.row.state_revision,
    phase: entry.row.phase,
    lifecycle: entry.row.lifecycle,
  }
}

function requireTarget<K extends ProjectionEntity['kind']>(
  action: LifecycleAction,
  kind: K,
): Extract<ProjectionEntity, { kind: K }> {
  if (action.target.kind !== kind) throw new Error(`${action.label} has no ${kind} target`)
  return action.target as Extract<ProjectionEntity, { kind: K }>
}

function dedupe(actions: LifecycleAction[]): LifecycleAction[] {
  const seen = new Set<LifecycleActionKind>()
  return actions.filter((item) => {
    if (seen.has(item.kind)) return false
    seen.add(item.kind)
    return true
  })
}
