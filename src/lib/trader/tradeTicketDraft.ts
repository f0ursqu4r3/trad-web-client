import type { BrowserCommandIntent, PositionSideIntent, TimeInForceIntent } from '@/lib/gateway'
import {
  newEntryProtectionState,
  sizingModeFromPreference,
  type ProtectionFormState,
  type ShapeMode,
  type SizingMode,
} from '@/lib/engineCommands/form'
import {
  buildPlaceChaseIntent,
  buildPlaceOrderIntent,
  buildPlaceTrailingEntryIntent,
} from '@/lib/engineCommands/intents'
import type { PersistedSizingMode } from '@/lib/engineCommands/form'

export type TicketEntryType = 'market' | 'limit' | 'chase' | 'trailing'

export interface TradeTicketDraft {
  entryType: TicketEntryType
  symbol: string
  positionSide: PositionSideIntent
  sizingMode: SizingMode
  amount: string
  limitPrice: string
  timeInForce: TimeInForceIntent
  boundaryKind: 'none' | 'basis_points' | 'price'
  boundaryValue: string
  expirySeconds: string
  remainder: 'cancel' | 'market_fill'
  activationPrice: string
  jumpBasisPoints: string
  shapeMode: ShapeMode
  targetChildNotional: string
  maxChildren: string
  oneWaySemantics: 'delta' | 'target_side_exposure'
  protection: ProtectionFormState
}

export function newTradeTicketDraft(
  symbol: string,
  sizingPreference: PersistedSizingMode,
): TradeTicketDraft {
  return {
    entryType: 'chase',
    symbol,
    positionSide: 'long',
    sizingMode: sizingModeFromPreference(sizingPreference),
    amount: '50',
    limitPrice: '',
    timeInForce: 'post_only',
    boundaryKind: 'none',
    boundaryValue: '10',
    expirySeconds: '',
    remainder: 'cancel',
    activationPrice: '',
    jumpBasisPoints: '10',
    shapeMode: 'single',
    targetChildNotional: '',
    maxChildren: '20',
    oneWaySemantics: 'target_side_exposure',
    protection: newEntryProtectionState(),
  }
}

export function buildTradeTicketIntent(draft: TradeTicketDraft): BrowserCommandIntent {
  if (draft.entryType === 'trailing') {
    return buildPlaceTrailingEntryIntent({
      symbol: draft.symbol,
      positionSide: draft.positionSide,
      activationPrice: draft.activationPrice,
      jumpBasisPoints: draft.jumpBasisPoints,
      stopLossPrice: draft.protection.stopLoss.triggerPrice,
      takeProfitPrice: draft.protection.takeProfits[0]?.triggerPrice ?? '',
      riskAmount: draft.amount,
      shapeMode: draft.shapeMode,
      targetChildNotional: draft.targetChildNotional,
      maxChildren: draft.maxChildren,
      oneWaySemantics: draft.oneWaySemantics,
    })
  }
  if (draft.entryType === 'chase') {
    return buildPlaceChaseIntent({
      symbol: draft.symbol,
      positionSide: draft.positionSide,
      sizingMode: draft.sizingMode,
      amount: draft.amount,
      boundaryKind: draft.boundaryKind,
      boundaryValue: draft.boundaryValue,
      expirySeconds: draft.expirySeconds,
      remainder: draft.remainder,
      protection: draft.protection,
    })
  }
  return buildPlaceOrderIntent({
    executionKind: draft.entryType,
    symbol: draft.symbol,
    positionSide: draft.positionSide,
    sizingMode: draft.sizingMode,
    amount: draft.amount,
    limitPrice: draft.limitPrice,
    timeInForce: draft.timeInForce,
    shapeMode: draft.shapeMode,
    targetChildNotional: draft.targetChildNotional,
    maxChildren: draft.maxChildren,
    protection: draft.protection,
  })
}
