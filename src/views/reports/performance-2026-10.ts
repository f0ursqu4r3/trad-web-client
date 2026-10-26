// Performance report, Aug–Oct 2026 (v0.10.10 to v0.10.35.2). Figures are
// copied from the measurement ledger of 2026-10-26 (releases/ in the Trad
// workspace); none were re-run. The page is public: account fixtures carry
// shape names, never client names, and no hosts, ids or addresses appear.
import {
  bandwidthRows,
  clientRows,
  engineTurns,
  exchangeRows,
  fuzzRows,
  isolationRows,
  memoryRows,
  orderPathRows,
  planningRows,
  startupRows,
  verificationRows,
} from './performance-2026-10-rows'
import {
  bytes,
  count,
  gb,
  kb,
  mb,
  ms,
  per,
  sec,
  throughput,
  us,
  type Headline,
  type Method,
  type ReportSection,
} from './reportFormat'

const perSecond = (value: number) => throughput(per(count(value), '/s'))

export const reportMeta = {
  title: 'Performance report',
  date: '2026-10-26',
  period: 'Aug–Oct 2026',
  releases: 'v0.10.10 – v0.10.35.2',
  method:
    'Figures copied from release records, benchmark runs and load tests; none re-run for this report.',
  fixtures:
    'Small: 9 open trades. Large: 130 trades, 1,470 fills, 2,698 protection orders. Very large: 1,006 trades. Largest: 5,006 trades, 50,000 fills.',
}

export const methodLegend: Array<{ method: Method; tag: string; label: string; detail: string }> = [
  {
    method: 'production',
    tag: 'PROD',
    label: 'Production',
    detail: 'live system: logs, process stats, deploy timestamps',
  },
  {
    method: 'rehearsal',
    tag: 'REH',
    label: 'Rehearsal',
    detail: 'restored copy of production data',
  },
  {
    method: 'benchmark',
    tag: 'BENCH',
    label: 'Benchmark',
    detail: 'release build, 16-core desktop, synthetic account fixtures',
  },
  {
    method: 'load',
    tag: 'LOAD',
    label: 'Load test',
    detail: 'load harness against a simulated exchange with production latency',
  },
  {
    method: 'probe',
    tag: 'PROBE',
    label: 'Probe',
    detail: 'live requests to the exchange or hosting provider',
  },
  { method: 'estimate', tag: 'EST', label: 'Estimate', detail: 'derived, not measured' },
]

export const unitRule =
  'Durations: µs below 1 ms, ms below 1 s, s above. Sizes: KB, MB, GB decimal; MiB from allocator counts. Factor: before ÷ after, after ÷ before for throughput.'

export const headlines: Headline[] = [
  {
    label: 'Engine turn per command, large account',
    before: ms(55.665),
    after: us(41),
    note: 'p50, v0.10.34',
    method: 'benchmark',
  },
  {
    label: 'Trading process memory, 3 accounts',
    before: gb(1.84),
    after: mb(387),
    note: 'v0.10.32 → v0.10.34',
    method: 'production',
  },
  {
    label: 'Trading pause per deploy',
    before: sec(205),
    after: sec(5.3),
    note: 'v0.10.34 → v0.10.35.2',
    method: 'production',
  },
  {
    label: 'Start, 15 accounts on 5 IPs',
    before: sec(218.8),
    after: sec(25.3),
    note: 'rate-limit errors 35 → 0',
    method: 'load',
  },
  {
    label: 'Reconnect, nothing missed',
    before: bytes(5_238_053),
    after: bytes(305),
    note: 'resume instead of full snapshot',
    method: 'benchmark',
  },
  {
    label: 'Gateway to browser, per 20 s',
    before: mb(5.5),
    after: kb(1.7),
    note: '22 Oct regression, fixed v0.10.29.1',
    method: 'production',
  },
  {
    label: 'Order preview, large account',
    before: ms(46.5),
    after: us(3),
    note: 'p50; database reads 23 → 0',
    method: 'benchmark',
  },
  {
    label: 'Fuzz inputs per second, slowest target',
    before: perSecond(0.57),
    after: perSecond(16.6),
    note: '7–43x across 8 targets',
    method: 'benchmark',
  },
]

export const deployPauses: Array<{ version: string; seconds: number }> = [
  { version: '0.10.10', seconds: 306 },
  { version: '0.10.14', seconds: 80 },
  { version: '0.10.16', seconds: 267 },
  { version: '0.10.17', seconds: 165 },
  { version: '0.10.18', seconds: 157 },
  { version: '0.10.19', seconds: 185 },
  { version: '0.10.20', seconds: 193 },
  { version: '0.10.22', seconds: 199 },
  { version: '0.10.23', seconds: 189 },
  { version: '0.10.25', seconds: 194 },
  { version: '0.10.26', seconds: 209 },
  { version: '0.10.27', seconds: 209 },
  { version: '0.10.28', seconds: 430 },
  { version: '0.10.29', seconds: 215 },
  { version: '0.10.29.1', seconds: 206 },
  { version: '0.10.34', seconds: 205 },
  { version: '0.10.35', seconds: 85 },
  { version: '0.10.35.1', seconds: 66 },
  { version: '0.10.35.2', seconds: 5.3 },
]

// Releases with instant startup, drawn as the after state.
export const instantStartupFrom = '0.10.35'

export const sections: ReportSection[] = [
  {
    id: 'engine-turns',
    title: 'Engine turn latency',
    line: 'p50 per engine turn, release build. Shipped in v0.10.34.',
    tables: [{ groupLabel: 'Account', measureLabel: 'Turn', rows: engineTurns }],
  },
  {
    id: 'planning',
    title: 'Planning, commit and replay',
    line: 'Previews and plans read no database; commits batch their statements.',
    tables: [{ measureLabel: 'Measure', rows: planningRows }],
  },
  {
    id: 'memory',
    title: 'Process memory',
    line: 'Resident memory in production, and per-account footprint by allocator count.',
    tables: [{ measureLabel: 'Measure', rows: memoryRows }],
  },
  {
    id: 'startup',
    title: 'Startup and failover',
    line: 'Time until the last account is active. Instant startup shipped in v0.10.35.',
    tables: [{ measureLabel: 'Measure', rows: startupRows }],
  },
  {
    id: 'isolation',
    title: 'Account isolation',
    line: 'One busy or stalled account against the others in the same process.',
    tables: [{ measureLabel: 'Measure', rows: isolationRows }],
  },
  {
    id: 'order-path',
    title: 'Order path latency',
    line: 'Accepted command to first exchange write, and exchange to browser.',
    tables: [{ measureLabel: 'Measure', rows: orderPathRows }],
  },
  {
    id: 'client',
    title: 'Client load',
    line: 'Browser timings on a 15.65 MB synthetic snapshot; phone profile at 4x CPU slowdown.',
    tables: [{ measureLabel: 'Measure', rows: clientRows }],
  },
  {
    id: 'bandwidth',
    title: 'Bandwidth',
    line: 'Gateway to browser. WebSocket uncompressed; HTTP history pages gzip 5–18x.',
    tables: [{ measureLabel: 'Measure', rows: bandwidthRows }],
  },
  {
    id: 'exchange',
    title: 'Exchange rate limits',
    line: 'Hyperliquid limits requests per IP. Each account now has its own IP and budget.',
    tables: [{ measureLabel: 'Measure', rows: exchangeRows }],
  },
  {
    id: 'deploy-pause',
    title: 'Deploy pause',
    line: 'Services stopped to last account active, per production release. Resting stops and take-profits stay on the exchange.',
    tables: [],
    chart: 'deploy-pause',
    caption: 'v0.10.28 includes a rolled-back first attempt.',
  },
  {
    id: 'verification',
    title: 'Verification throughput',
    line: 'Fuzz inputs per second over the same 150 farm inputs, one core each.',
    tables: [
      { measureLabel: 'Fuzz target', rows: fuzzRows },
      { measureLabel: 'Measure', rows: verificationRows },
    ],
  },
  {
    id: 'not-measured',
    title: 'Not measured',
    line: 'Open items for the next report.',
    tables: [],
    list: [
      'End-to-end command latency in production, button press to exchange acknowledgement.',
      'Production since v0.10.34: socket bytes, snapshot size, resume rate, memory over time, journal rows per day, request weight per IP.',
      'Exchange: burst-limit refill rate, real weight of fill pages, batched writes on the live exchange, order acknowledgement latency.',
      'Client: compressed bundle size, time to interactive, a run on a physical iPhone.',
      'CPU use of the trading process and gateway.',
      'Fuzz throughput on the fuzz farm itself; figures above are from a desktop.',
    ],
  },
]

export function measurementCount(): number {
  const rows = sections.reduce(
    (total, section) => total + section.tables.reduce((sum, table) => sum + table.rows.length, 0),
    0,
  )
  return rows + deployPauses.length
}
