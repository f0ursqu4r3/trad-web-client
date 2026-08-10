export interface QualificationRisk {
  markUncertain(): void
  markResolved(): void
}

interface SignedQualificationOptions {
  label: string
  run(risk: QualificationRisk): Promise<void>
  cleanup(): Promise<void>
  verifyFinalState(): Promise<void>
}

// Preserve the first failure while still making exchange cleanup authoritative.
export async function runSignedQualification({
  label,
  run,
  cleanup,
  verifyFinalState,
}: SignedQualificationOptions): Promise<void> {
  let cleanupRequired = false
  const failures: unknown[] = []
  const risk: QualificationRisk = {
    markUncertain: () => {
      cleanupRequired = true
    },
    markResolved: () => {
      cleanupRequired = false
    },
  }

  try {
    await run(risk)
  } catch (error) {
    failures.push(new Error(`${label} failed`, { cause: error }))
  }

  if (cleanupRequired) {
    try {
      await cleanup()
    } catch (error) {
      failures.push(new Error(`${label} cleanup command failed`, { cause: error }))
    }
  }

  try {
    await verifyFinalState()
  } catch (error) {
    failures.push(new Error(`${label} cleanup left exchange state`, { cause: error }))
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, `${label} qualification failed`)
  }
}
