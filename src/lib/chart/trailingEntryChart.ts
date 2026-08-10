import type {
  BrowserMarketSample,
  PositionSide,
  TrailingEntryPlanProjection,
  TrailingEntryProjection,
  TrailingEntryTradeProjection,
} from '@/lib/gateway'

export type TrailingEntryLineId =
  | 'activation_price'
  | 'stop_loss'
  | 'take_profit'
  | 'peak_price'
  | 'jump_trigger'

export interface TrailingEntryChartLine {
  id: TrailingEntryLineId
  price: number
  label: string
  tone: 'activation' | 'stop' | 'take_profit' | 'peak' | 'jump'
  editable: boolean
}

export function trailingEntryChartLines(entry: TrailingEntryProjection): TrailingEntryChartLine[] {
  const plan = entry.plan
  const editable = entry.lifecycle === 'running'
  const lines: TrailingEntryChartLine[] = [
    line(
      'activation_price',
      chartPrice(plan.activation_price),
      'Act',
      'activation',
      editable && entry.phase === 'waiting_for_activation',
    ),
    line('stop_loss', chartPrice(plan.stop_loss), 'Stop', 'stop', editable),
  ]

  if (plan.take_profit !== undefined && plan.take_profit !== null) {
    lines.push(line('take_profit', chartPrice(plan.take_profit), 'TP', 'take_profit', editable))
  }
  if (entry.peak !== null) {
    const peak = chartPrice(entry.peak)
    lines.push(line('peak_price', peak, 'Peak', 'peak', false))
    lines.push(
      line(
        'jump_trigger',
        jumpTriggerPrice(plan.position_side, peak, chartPrice(plan.jump_threshold)),
        jumpLabel(plan, peak),
        'jump',
        editable,
      ),
    )
  }
  return lines
}

export function jumpTriggerPrice(side: PositionSide, peak: number, basisPoints: number): number {
  const fraction = basisPoints / 10_000
  const price = side === 'long' ? peak * (1 + fraction) : peak * (1 - fraction)
  return Number(chartDecimal(price))
}

export function jumpBasisPointsForPrice(side: PositionSide, peak: number, price: number): string {
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(price) || price <= 0) {
    throw new Error('jump price cannot be converted without a positive peak')
  }
  const basisPoints = side === 'long' ? (price / peak - 1) * 10_000 : (1 - price / peak) * 10_000
  if (!Number.isFinite(basisPoints) || basisPoints <= 0 || basisPoints >= 10_000) {
    throw new Error('jump price must remain on the entry side of the tracked peak')
  }
  return chartDecimal(basisPoints)
}

export function chartDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('chart value is not finite')
  const fixed = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
  return fixed === '-0' ? '0' : fixed
}

export function chartPrice(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid projected price: ${value}`)
  return parsed
}

export function marketSampleForTrade(
  samples: BrowserMarketSample[],
  trade: TrailingEntryTradeProjection | null,
): BrowserMarketSample | null {
  if (trade === null) return null
  return (
    [...samples]
      .reverse()
      .find(
        (sample) =>
          sample.generation === trade.generation &&
          sample.trade_id === trade.trade_id &&
          sample.exchange_time_ms === trade.exchange_time,
      ) ?? null
  )
}

export function sampleAtTrailingEntryPoint(
  samples: BrowserMarketSample[],
  entry: TrailingEntryProjection,
  pointIndex: number | null,
): BrowserMarketSample | null {
  if (pointIndex === null || entry.point_count === 0) return null
  const latest = marketSampleForTrade(samples, entry.latest_trade)
  if (latest === null) return null
  const latestSampleIndex = samples.findIndex((sample) => sample.sequence === latest.sequence)
  const distance = entry.point_count - 1 - pointIndex
  if (latestSampleIndex < 0 || distance < 0) return null
  return samples[latestSampleIndex - distance] ?? null
}

function line(
  id: TrailingEntryLineId,
  price: number,
  label: string,
  tone: TrailingEntryChartLine['tone'],
  editable: boolean,
): TrailingEntryChartLine {
  return { id, price, label, tone, editable }
}

function jumpLabel(plan: TrailingEntryPlanProjection, peak: number): string {
  const basisPoints = chartPrice(plan.jump_threshold)
  const sign = plan.position_side === 'long' ? '+' : '-'
  const jump = jumpTriggerPrice(plan.position_side, peak, basisPoints)
  const stop = chartPrice(plan.stop_loss)
  const distance = Math.abs(jump - stop)
  const risk = Number(plan.risk_amount)
  if (!Number.isFinite(risk) || risk <= 0 || distance <= 0) {
    return `Jump ${sign}${basisPoints} bps`
  }
  const estimatedNotional = (risk / distance) * jump
  return `Jump ${sign}${basisPoints} bps · Est $${formatCompact(estimatedNotional)}`
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}k`
  return value.toFixed(2)
}
