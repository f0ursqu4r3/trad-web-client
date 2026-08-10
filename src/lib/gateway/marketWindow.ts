import type { BrowserMarketSample, BrowserMarketWindow } from './market.ts'

export const MAX_MARKET_SAMPLES = 1_024

export interface MarketSampleWindow {
  oldestSequence: number | null
  nextSequence: number
  samples: BrowserMarketSample[]
}

export function installMarketWindow(window: BrowserMarketWindow): MarketSampleWindow {
  validateSamples(window.samples, null)
  const last = window.samples[window.samples.length - 1]
  if (last !== undefined && window.next_sequence !== last.sequence + 1) {
    throw new Error('market window has an invalid next sequence')
  }

  const samples = window.samples.slice(-MAX_MARKET_SAMPLES)
  return {
    oldestSequence: samples[0]?.sequence ?? null,
    nextSequence: window.next_sequence,
    samples,
  }
}

export function appendMarketSamples(
  current: MarketSampleWindow,
  incoming: BrowserMarketSample[],
): MarketSampleWindow {
  validateSamples(incoming, current.nextSequence)
  if (incoming.length === 0) return current

  const samples = [...current.samples, ...incoming].slice(-MAX_MARKET_SAMPLES)
  const last = incoming[incoming.length - 1]
  if (last === undefined) return current
  return {
    oldestSequence: samples[0]?.sequence ?? null,
    nextSequence: last.sequence + 1,
    samples,
  }
}

function validateSamples(samples: BrowserMarketSample[], minimum: number | null): void {
  let previous: number | null = null
  for (const sample of samples) {
    if (!Number.isSafeInteger(sample.sequence) || sample.sequence < 0) {
      throw new Error('market sample sequence is invalid')
    }
    if (
      (minimum !== null && sample.sequence < minimum) ||
      (previous !== null && sample.sequence <= previous)
    ) {
      throw new Error('market samples are overlapping or out of order')
    }
    previous = sample.sequence
  }
}
