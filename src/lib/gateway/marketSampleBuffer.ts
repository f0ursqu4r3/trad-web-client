import type { BrowserMarketSample } from './market.ts'
import { MAX_MARKET_SAMPLES, validateMarketSamples } from './marketWindow.ts'

// Market samples waiting to reach the market store.
//
// Trade feeds can send dozens of messages a second per market. Applying each
// one replaces the market window and re-renders every card and chart that
// reads it, so samples are held here and applied once per animation frame, or
// once when a background tab comes back, instead of once per message.

export interface PendingMarketSamples {
  subscriptionId: string
  accountId: string
  symbol: string
  samples: BrowserMarketSample[]
}

export class MarketSampleBuffer {
  private readonly pending = new Map<string, PendingMarketSamples>()

  // Adds samples for one subscription. `nextSequence` is where the applied
  // window ends, or null when it is not known. Throws, leaving nothing held for
  // the subscription, when the samples overlap or go backwards.
  push(
    target: Omit<PendingMarketSamples, 'samples'>,
    samples: BrowserMarketSample[],
    nextSequence: number | null,
  ): void {
    const held = this.pending.get(target.subscriptionId)
    const last = held?.samples[held.samples.length - 1]
    try {
      validateMarketSamples(samples, last === undefined ? nextSequence : last.sequence + 1)
    } catch (error) {
      this.pending.delete(target.subscriptionId)
      throw error
    }
    if (samples.length === 0) return
    if (held === undefined) {
      this.pending.set(target.subscriptionId, { ...target, samples: [...samples] })
      return
    }
    held.samples.push(...samples)
    // The window keeps only the newest samples, so older held ones would be
    // dropped on apply anyway.
    if (held.samples.length > MAX_MARKET_SAMPLES) {
      held.samples.splice(0, held.samples.length - MAX_MARKET_SAMPLES)
    }
  }

  // Everything held, in arrival order of the first sample per subscription.
  drain(): PendingMarketSamples[] {
    const entries = [...this.pending.values()]
    this.pending.clear()
    return entries
  }

  discard(subscriptionId: string): void {
    this.pending.delete(subscriptionId)
  }

  clear(): void {
    this.pending.clear()
  }

  get size(): number {
    return this.pending.size
  }

  sampleCount(): number {
    let count = 0
    for (const entry of this.pending.values()) count += entry.samples.length
    return count
  }
}
