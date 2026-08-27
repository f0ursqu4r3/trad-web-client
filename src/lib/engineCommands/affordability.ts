import { compareExact, multiplyExact } from '../exactDecimalMath.ts'
import type { CommandPreview, ExactDecimal } from '../gateway/index.ts'

export type AffordabilityState =
  | 'likely_affordable'
  | 'insufficient_margin_likely'
  | 'balance_evidence_unknown'

export interface AffordabilityAdvisory {
  state: AffordabilityState
  available: ExactDecimal | null
  leverage: number | null
  estimatedMaximumNotional: ExactDecimal | null
  maximumBaseQuantity: ExactDecimal | null
  evidenceSource: 'venue_capacity' | 'projection_estimate' | 'unknown'
  projectionRevision: number | null
  fingerprint: string
}

export interface AffordabilityEvidence {
  hyperliquid: boolean
  projectionReady: boolean
  projectionRevision: number | null
  available: ExactDecimal | null
  configuredLeverage: number | null
  venueAvailableToTrade?: ExactDecimal | null
  venueMaximumBaseQuantity?: ExactDecimal | null
  venueEffectiveLeverage?: number | null
}

export function affordabilityAdvisory(
  preview: CommandPreview | null,
  evidence: AffordabilityEvidence,
): AffordabilityAdvisory | null {
  if (preview === null || !evidence.hyperliquid) return null
  const venueLeverage = validLeverage(evidence.venueEffectiveLeverage ?? null)
  if (
    evidence.venueAvailableToTrade != null &&
    evidence.venueMaximumBaseQuantity != null &&
    venueLeverage !== null
  ) {
    try {
      const maximumNotional = multiplyExact(
        evidence.venueMaximumBaseQuantity,
        preview.decision_price,
      )
      const state =
        compareExact(preview.normalized_base_quantity, evidence.venueMaximumBaseQuantity) > 0
          ? 'insufficient_margin_likely'
          : 'likely_affordable'
      return advisory(
        state,
        evidence.venueAvailableToTrade,
        venueLeverage,
        maximumNotional,
        evidence.venueMaximumBaseQuantity,
        'venue_capacity',
        evidence,
        preview,
      )
    } catch {
      // Malformed optional venue advice falls through to projection evidence.
    }
  }
  const leverage = validLeverage(evidence.configuredLeverage)
  const available = evidence.available
  if (!evidence.projectionReady || available === null || leverage === null) {
    return advisory(
      'balance_evidence_unknown',
      available,
      leverage,
      null,
      null,
      'unknown',
      evidence,
      preview,
    )
  }
  try {
    if (compareExact(available, '0') < 0) {
      return advisory(
        'insufficient_margin_likely',
        available,
        leverage,
        '0',
        null,
        'projection_estimate',
        evidence,
        preview,
      )
    }
    const maximumNotional = multiplyExact(available, String(leverage))
    const state =
      compareExact(preview.normalized_quote_notional, maximumNotional) > 0
        ? 'insufficient_margin_likely'
        : 'likely_affordable'
    return advisory(
      state,
      available,
      leverage,
      maximumNotional,
      null,
      'projection_estimate',
      evidence,
      preview,
    )
  } catch {
    return advisory(
      'balance_evidence_unknown',
      available,
      leverage,
      null,
      null,
      'unknown',
      evidence,
      preview,
    )
  }
}

function advisory(
  state: AffordabilityState,
  available: ExactDecimal | null,
  leverage: number | null,
  maximumNotional: ExactDecimal | null,
  maximumBaseQuantity: ExactDecimal | null,
  evidenceSource: AffordabilityAdvisory['evidenceSource'],
  evidence: AffordabilityEvidence,
  preview: CommandPreview,
): AffordabilityAdvisory {
  return {
    state,
    available,
    leverage,
    estimatedMaximumNotional: maximumNotional,
    maximumBaseQuantity,
    evidenceSource,
    projectionRevision: evidence.projectionRevision,
    fingerprint: [
      state,
      preview.symbol,
      preview.normalized_quote_notional,
      available ?? 'unknown',
      leverage ?? 'unknown',
      maximumBaseQuantity ?? 'unknown',
      evidenceSource,
      evidence.projectionRevision ?? 'unknown',
    ].join(':'),
  }
}

function validLeverage(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= 1 ? value : null
}
