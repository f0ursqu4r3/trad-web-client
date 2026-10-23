import type { BrowserMarketSample, BrowserTickRun } from './market.ts'
import type { BrowserServerMessage } from './wire.ts'

// Protocol 17 prices (networking work item 19) read back into the sample
// shape the market store keeps: `market_ticks` becomes `market_samples`
// and a window's `ticks` become its `samples`. Ticks carry no update id
// (nothing reads it); everything else comes back exactly.

export function decodeTicks(runs: readonly BrowserTickRun[]): BrowserMarketSample[] {
  const samples: BrowserMarketSample[] = []
  for (const run of runs) {
    if (!Array.isArray(run?.ticks)) continue
    let sequence = 0
    let exchangeTime = 0
    run.ticks.forEach(([step, timeStep, lag, price, tradeId], index) => {
      sequence = index === 0 ? step : sequence + step
      exchangeTime = index === 0 ? timeStep : exchangeTime + timeStep
      samples.push({
        sequence,
        generation: run.generation,
        received_at_ms: exchangeTime + lag,
        exchange_time_ms: exchangeTime,
        price,
        trade_id: tradeId,
      })
    })
  }
  return samples
}

export function readTicks(message: BrowserServerMessage): BrowserServerMessage {
  // a frame is only checked for its kind here; never throw on the rest
  if (message.kind === 'market_ticks' && Array.isArray(message.ticks)) {
    const { ticks, ...rest } = message
    return { ...rest, kind: 'market_samples', samples: decodeTicks(ticks) }
  }
  if (message.kind === 'market_window' && Array.isArray(message.window?.ticks)) {
    const { ticks, ...window } = message.window
    return { ...message, window: { ...window, samples: decodeTicks(ticks) } }
  }
  return message
}
