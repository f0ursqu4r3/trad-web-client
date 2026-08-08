import type { BrowserCommandIntent, PositionSideIntent, TimeInForceIntent } from '@/lib/gateway'
import {
  exactDecimal,
  normalizedSymbol,
  optionalExactDecimal,
  protectionIntent,
  shapeIntent,
  sizingIntent,
  type ProtectionFormState,
  type ShapeMode,
  type SizingMode,
} from './form.ts'

export interface OrderCommandDraft {
  executionKind: 'market' | 'limit'
  symbol: string
  positionSide: PositionSideIntent
  sizingMode: SizingMode
  amount: string
  limitPrice: string
  timeInForce: TimeInForceIntent
  shapeMode: ShapeMode
  targetChildNotional: string
  maxChildren: string
  protection: ProtectionFormState
}

export interface ChaseCommandDraft {
  symbol: string
  positionSide: PositionSideIntent
  sizingMode: SizingMode
  amount: string
  boundaryKind: 'none' | 'basis_points' | 'price'
  boundaryValue: string
  expirySeconds: string
  remainder: 'cancel' | 'market_fill'
  protection: ProtectionFormState
}

export interface TrailingEntryCommandDraft {
  symbol: string
  positionSide: PositionSideIntent
  activationPrice: string
  jumpBasisPoints: string
  stopLossPrice: string
  takeProfitPrice: string
  riskAmount: string
  shapeMode: ShapeMode
  targetChildNotional: string
  maxChildren: string
  oneWaySemantics: 'delta' | 'target_side_exposure'
}

export function buildPlaceOrderIntent(draft: OrderCommandDraft): BrowserCommandIntent {
  const protection = protectionIntent(draft.protection)
  requireStopForRiskSizing(draft.sizingMode, protection)
  return {
    kind: 'place_order',
    parameters: {
      symbol: normalizedSymbol(draft.symbol),
      position_side: draft.positionSide,
      sizing: sizingIntent(draft.sizingMode, draft.amount),
      execution:
        draft.executionKind === 'market'
          ? { kind: 'market' }
          : {
              kind: 'limit',
              price: exactDecimal(draft.limitPrice, 'limit price'),
              time_in_force: draft.timeInForce,
            },
      ...(protection === undefined ? {} : { protection }),
      shape: shapeIntent(draft.shapeMode, draft.targetChildNotional, draft.maxChildren),
    },
  }
}

export function buildPlaceChaseIntent(draft: ChaseCommandDraft): BrowserCommandIntent {
  const protection = protectionIntent(draft.protection)
  requireStopForRiskSizing(draft.sizingMode, protection)
  const adverseBoundary =
    draft.boundaryKind === 'none'
      ? undefined
      : {
          kind: draft.boundaryKind,
          value: exactDecimal(
            draft.boundaryValue,
            draft.boundaryKind === 'price' ? 'boundary price' : 'boundary basis points',
            draft.boundaryKind === 'basis_points',
          ),
        }
  const expiry = optionalExactDecimal(draft.expirySeconds, 'expiry seconds')
  return {
    kind: 'place_chase',
    parameters: {
      symbol: normalizedSymbol(draft.symbol),
      position_side: draft.positionSide,
      sizing: sizingIntent(draft.sizingMode, draft.amount),
      ...(protection === undefined ? {} : { protection }),
      ...(adverseBoundary === undefined ? {} : { adverse_boundary: adverseBoundary }),
      ...(expiry === null ? {} : { expires_after_ms: secondsToMilliseconds(expiry) }),
      remainder: draft.remainder,
    },
  }
}

export function buildPlaceTrailingEntryIntent(
  draft: TrailingEntryCommandDraft,
): BrowserCommandIntent {
  const takeProfit = optionalExactDecimal(draft.takeProfitPrice, 'take-profit price')
  return {
    kind: 'place_trailing_entry',
    parameters: {
      symbol: normalizedSymbol(draft.symbol),
      position_side: draft.positionSide,
      activation_price: exactDecimal(draft.activationPrice, 'activation price'),
      jump_basis_points: exactDecimal(draft.jumpBasisPoints, 'jump basis points'),
      stop_loss_price: exactDecimal(draft.stopLossPrice, 'stop-loss price'),
      ...(takeProfit === null ? {} : { take_profit_price: takeProfit }),
      risk_amount: exactDecimal(draft.riskAmount, 'risk amount'),
      shape: shapeIntent(draft.shapeMode, draft.targetChildNotional, draft.maxChildren),
      one_way_semantics: draft.oneWaySemantics,
    },
  }
}

export function buildFlattenIntent(
  target: 'account' | 'symbol',
  symbol: string,
): BrowserCommandIntent {
  return {
    kind: 'flatten',
    parameters: {
      target:
        target === 'account'
          ? { kind: 'account' }
          : { kind: 'symbol', symbol: normalizedSymbol(symbol) },
    },
  }
}

function requireStopForRiskSizing(
  sizingMode: SizingMode,
  protection: ReturnType<typeof protectionIntent>,
): void {
  if (sizingMode === 'risk_at_stop' && protection?.stop_loss === undefined) {
    throw new Error('risk sizing requires an attached stop loss')
  }
}

function secondsToMilliseconds(seconds: string): number {
  if (!/^\d+$/.test(seconds)) throw new Error('expiry seconds must be a whole number')
  const value = Number(seconds)
  const milliseconds = value * 1_000
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error('expiry seconds is outside the supported range')
  }
  return milliseconds
}
