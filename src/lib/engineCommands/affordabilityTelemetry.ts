import type { AffordabilityState } from './affordability.ts'

export interface AffordabilityTransition {
  state: AffordabilityState
  previousState: AffordabilityState | 'unknown'
}

/**
 * Tracks only semantic affordability state per user attempt. Evidence-source,
 * projection-revision, and capacity refreshes are deliberately not state
 * transitions and therefore cannot create telemetry churn.
 */
export class AffordabilityTransitionTracker {
  private attemptId: string | null = null
  private state: AffordabilityState | null = null

  observe(
    attemptId: string | null | undefined,
    state: AffordabilityState | null,
  ): AffordabilityTransition | null {
    const normalizedAttempt = attemptId ?? null
    if (normalizedAttempt !== this.attemptId) {
      this.attemptId = normalizedAttempt
      this.state = null
    }
    if (state === null || state === this.state) return null
    const transition = { state, previousState: this.state ?? 'unknown' } as const
    this.state = state
    return transition
  }

  clear(): void {
    this.attemptId = null
    this.state = null
  }
}
