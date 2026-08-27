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
  projectionRevision: number | null
  fingerprint: string
}

export interface AffordabilityEvidence {
  hyperliquid: boolean
  projectionReady: boolean
  projectionRevision: number | null
  available: ExactDecimal | null
  configuredLeverage: number | null
}

export function affordabilityAdvisory(
  preview: CommandPreview | null,
  evidence: AffordabilityEvidence,
): AffordabilityAdvisory | null {
  if (preview === null || !evidence.hyperliquid) return null
  const leverage = validLeverage(evidence.configuredLeverage)
  const available = evidence.available
  if (!evidence.projectionReady || available === null || leverage === null) {
    return advisory('balance_evidence_unknown', available, leverage, null, evidence, preview)
  }
  try {
    if (compareExact(available, '0') < 0) {
      return advisory(
        'insufficient_margin_likely',
        available,
        leverage,
        '0',
        evidence,
        preview,
      )
    }
    const maximumNotional = multiplyExact(available, String(leverage))
    const state =
      compareExact(preview.normalized_quote_notional, maximumNotional) > 0
        ? 'insufficient_margin_likely'
        : 'likely_affordable'
    return advisory(state, available, leverage, maximumNotional, evidence, preview)
  } catch {
    return advisory('balance_evidence_unknown', available, leverage, null, evidence, preview)
  }
}

function advisory(
  state: AffordabilityState,
  available: ExactDecimal | null,
  leverage: number | null,
  maximumNotional: ExactDecimal | null,
  evidence: AffordabilityEvidence,
  preview: CommandPreview,
): AffordabilityAdvisory {
  return {
    state,
    available,
    leverage,
    estimatedMaximumNotional: maximumNotional,
    projectionRevision: evidence.projectionRevision,
    fingerprint: [
      state,
      preview.symbol,
      preview.normalized_quote_notional,
      available ?? 'unknown',
      leverage ?? 'unknown',
      evidence.projectionRevision ?? 'unknown',
    ].join(':'),
  }
}

function validLeverage(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= 1 ? value : null
}
