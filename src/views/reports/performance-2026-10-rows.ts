// Table rows of the Aug–Oct 2026 performance report; the sections, headline
// figures and legend are in performance-2026-10.ts. Account fixtures carry
// shape names (small, large, very large, largest), never client names.
import {
  approx,
  bytes,
  count,
  gb,
  kb,
  mb,
  mib,
  ms,
  per,
  sec,
  text,
  throughput,
  us,
  type Method,
  type ReportRow,
  type Value,
} from './reportFormat'

type RowOptions = Pick<ReportRow, 'group' | 'factorAt' | 'notShipped'>

function r(
  measure: string,
  before: Value | null,
  after: Value,
  method: Method,
  conditions = '',
  options: RowOptions = {},
): ReportRow {
  return { measure, before, after, method, conditions, ...options }
}

function turn(group: string, measure: string, before: number, after: number): ReportRow {
  return r(measure, us(before), us(after), 'benchmark', '', { group })
}

const p50 = { index: 0, label: 'p50' }
const p99 = { index: 1, label: 'p99' }
const perSecond = (value: number) => throughput(per(count(value), '/s'))

export const engineTurns: ReportRow[] = [
  turn('Small', 'Command', 397, 27),
  turn('Small', 'Fill', 372, 40),
  turn('Small', 'Exchange frame', 190, 14),
  turn('Small', 'Balance', 344, 11),
  turn('Small', 'Market tick', 160, 1.9),
  turn('Small', 'Timer', 153, 1.8),
  turn('Small', 'Chase reprice', 418, 30),
  turn('Large', 'Command', 55_665, 41),
  turn('Large', 'Fill', 47_754, 90),
  turn('Large', 'Exchange frame', 17_698, 19),
  turn('Large', 'Balance', 45_636, 12),
  turn('Large', 'Market tick', 17_842, 2.3),
  turn('Large', 'Timer', 19_229, 1.9),
  turn('Large', 'Chase reprice', 56_490, 42),
  turn('Very large', 'Command', 225_875, 71),
  turn('Very large', 'Fill', 191_037, 207),
  turn('Very large', 'Exchange frame', 71_201, 20),
  turn('Very large', 'Balance', 192_309, 15),
  turn('Very large', 'Market tick', 69_594, 2.4),
  turn('Very large', 'Timer', 69_209, 1.9),
  turn('Very large', 'Chase reprice', 230_775, 75),
]

export const planningRows: ReportRow[] = [
  r('Order preview, p50 / p95, large', ms(46.5, 50.3), us(3, 4), 'benchmark', '', {
    factorAt: p50,
  }),
  r('Order preview, p50 / p95, largest', ms(759, 772), us(3, 7), 'benchmark', '', {
    factorAt: p50,
  }),
  r('Command plan, p50 / p95, large', ms(46.7, 48.9), us(3, 4), 'benchmark', '', {
    factorAt: p50,
  }),
  r('Command plan, p50 / p95, largest', ms(770, 792), us(4, 4), 'benchmark', '', {
    factorAt: p50,
  }),
  r('Database reads per preview or plan', count(23), count(0), 'benchmark'),
  r('Database statements per market command', count(37), count(13), 'benchmark', 'end to end'),
  r(
    'Statements per protection-snapshot commit, large',
    count(1_597),
    count(10),
    'benchmark',
    '1,593 rows',
  ),
  r(
    'Protection-snapshot commit, p50, large',
    ms([69, 78]),
    ms([35, 40]),
    'benchmark',
    'PostgreSQL 17, fsync on',
  ),
  r(
    'Protection-snapshot commit, p50, largest',
    ms(380),
    ms([200, 230]),
    'benchmark',
    'statements 7,552 → 16',
  ),
  r('Account install commit, large', ms(300), ms(150), 'benchmark', 'statements 6,202 → 18'),
  r(
    'Account install commit, largest',
    sec(4.3),
    sec([2.1, 3.0]),
    'benchmark',
    'statements 93,591 → 104',
  ),
  r(
    'Live action behind a 400 ms outbox scan',
    ms(776),
    approx(ms(5)),
    'benchmark',
    'scan delay simulated',
  ),
  r(
    'Full replay, 3.7M-event account',
    text('> 2 h 51 min'),
    sec(13.9),
    'rehearsal',
    'production copy; before stopped unfinished; v0.10.25',
  ),
  r('Full replay, 2.7M-event account', sec(97.6), sec(7.8), 'rehearsal', 'production copy'),
  r('Full replay, 1.9M-event account', sec(91.1), sec(5.7), 'rehearsal', 'production copy'),
  r(
    'Trade summaries after one fill, largest',
    ms(224),
    us(35),
    'benchmark',
    'full recompute → touched trade only, p50',
  ),
  r(
    'Journal rows per day, repeated reports, large',
    count(372_672),
    count([12_528, 21_240]),
    'benchmark',
    'production ~320,000/day on 22 Oct',
  ),
  r(
    'Memory allocated per fill turn, large',
    mib(20.8),
    mib(0.06),
    'benchmark',
    'counting allocator',
  ),
]

export const memoryRows: ReportRow[] = [
  r(
    'Trading process RSS, 3 accounts',
    gb(1.84),
    mb(387),
    'production',
    'peak 2.2 GB before; v0.10.32 → v0.10.34',
  ),
  r('Gateway RSS', mb(143), mb(38), 'production', 'v0.10.32 → v0.10.34'),
  r('Memory per account, large', mib(26.2), mib([19.5, 20.2]), 'benchmark', 'v0.10.35'),
  r('Memory per account, very large', mib(94), mib([62, 64]), 'benchmark', 'v0.10.35'),
  r(
    'Idle RSS after load, 3 large accounts',
    mib(187),
    mib(40),
    'benchmark',
    'tuned allocator, 40 s probe',
  ),
  r(
    'Idle RSS after load, 3 largest accounts',
    mib(2_163),
    mib(447),
    'benchmark',
    'tuned allocator, 40 s probe',
  ),
  r('Gateway snapshot latency, large', ms(92), ms(14), 'benchmark'),
  r('Gateway snapshot latency, largest', ms(1_361), ms(192), 'benchmark'),
  r(
    'Memory per account with history compaction, large',
    mib(19.5),
    mib(3.1),
    'benchmark',
    'built and measured',
    { notShipped: true },
  ),
  r(
    '1,000 accounts in one process',
    mib(7_964),
    mib(1_450),
    'benchmark',
    'mixed sizes; needs history compaction',
    { notShipped: true },
  ),
]

export const startupRows: ReportRow[] = [
  r(
    'Start, 15 accounts on 5 IPs',
    sec(218.8),
    sec(25.3),
    'load',
    'rate-limit errors 35 → 0; v0.10.35',
  ),
  r('Start, 5 accounts on 5 IPs', sec(5.0), sec(2.5), 'load', 'rate-limit errors 0 → 0'),
  r('Crash and restart (kill -9)', sec(209.3), sec(25.5), 'load', 'rate-limit errors 41 → 0'),
  r('Handover to a new process', sec(225.7), sec(25.7), 'load', 'old process stops in 11 ms'),
  r('Start, 15 accounts, one IP each', null, sec(3.1), 'load', 'current production layout'),
  r('Handover, 15 accounts, one IP each', null, sec(10.9), 'load', 'old process stops in 150 ms'),
  r('Move one account to a spare IP', null, sec(4.8), 'load', 'no other account restarted'),
]

export const isolationRows: ReportRow[] = [
  r(
    'Command latency, p50 / p99, 8 accounts',
    ms(2.1, 43),
    ms(2.0, 5.9),
    'benchmark',
    'one account committing nonstop; v0.10.34',
    { factorAt: p99 },
  ),
  r(
    'Publish 20,000 trades, one account stalled',
    text('stuck at 8,192'),
    ms(130),
    'benchmark',
    'one lane per account',
  ),
  r(
    'Exit p99, alone / beside a storming neighbour',
    null,
    ms(305, 336),
    'load',
    'neighbour at 20x load, one IP each',
  ),
]

export const orderPathRows: ReportRow[] = [
  r(
    'Exit accepted to first exchange write, p50 / p99',
    ms(13, 45_535),
    ms(13, 20),
    'load',
    '15 accounts under load; v0.10.34',
    { factorAt: p99 },
  ),
  r('Panic flatten to first exchange write, p99', ms(55_755), ms(20), 'load', 'same load'),
  r('Exits failed on a missing order book', count(50), count(0), 'load', 'same load'),
  r(
    'Browser command accepted, p50 / p99',
    null,
    ms([3.1, 4.1], [42, 78]),
    'load',
    'browser send to result',
  ),
  r('Price, exchange to browser, p50 / p99', null, ms(7, [11, 14]), 'load'),
  r('Market subscribe, p50 / p95, 1 × 8 coins', ms(42, 42), ms(1.1, 3.0), 'benchmark', '', {
    factorAt: p50,
  }),
  r('Market subscribe, p50 / p95, 500 × 8 coins', ms(142, 242), ms(0.8, 28), 'benchmark', '', {
    factorAt: p50,
  }),
  r('Exchange market sockets, 500 × 8 coins', count(4_000), count(1), 'benchmark', 'shared stream'),
  r(
    'Resubscribe on lease rotation, p50 / p95, 500 × 8',
    ms(190, 284),
    ms(10, 20),
    'benchmark',
    '',
    {
      factorAt: p50,
    },
  ),
  r(
    'First price after a reconnect',
    sec(32),
    ms([13, 63]),
    'production',
    'production sessions after v0.10.32',
  ),
  r(
    'Command reply delay, 22 Oct regression',
    sec([6, 30]),
    text('normal'),
    'production',
    'fixed in v0.10.29.1',
  ),
  r('Exchange REST latency, median', ms(84), ms(5), 'probe', 'after the 23 Oct server move'),
]

export const clientRows: ReportRow[] = [
  r(
    'Trades on screen, phone, large production account',
    sec(35.8),
    sec([0.4, 0.7]),
    'production',
    'after: snapshot apply, v0.10.32; 2.7 s on one slow load',
  ),
  r('Snapshot applied', ms(2_240), ms(250), 'benchmark', 'phone profile, 4x CPU slowdown'),
  r('Longest task while loading', ms(2_800), ms(330), 'benchmark', 'phone profile'),
  r('Card prices, cold start', ms(3_060), ms(1_290), 'benchmark', 'phone profile'),
  r('All cards priced', ms(3_710), ms(1_920), 'benchmark', 'phone profile'),
  r(
    'Tasks over 50 ms while trading, per 5 s',
    count(18),
    count(0),
    'benchmark',
    'phone profile; up to 320 ms each before',
  ),
  r(
    'Trade view main-thread time',
    per(ms(368), '/s'),
    per(ms(154), '/s'),
    'benchmark',
    '6 cards, 3 feeds at 20 msg/s; v0.10.30',
  ),
  r('Layouts', perSecond(133), perSecond(20), 'benchmark', 'same view'),
  r('Style recalculations', perSecond(204), perSecond(61), 'benchmark', 'same view'),
  r('Hidden tab main-thread time', per(ms(116), '/s'), per(ms(42), '/s'), 'benchmark', 'same view'),
  r('One fill merged into 20,000 rows', ms([3, 9]), ms(0.1), 'benchmark', 'desktop'),
  r(
    'Closed trades page over HTTP, raw / gzip',
    null,
    bytes(74_002, 6_656),
    'benchmark',
    '50 trades, large account',
  ),
  r('Main app script, raw', null, bytes(465_521), 'benchmark', 'v0.10.34; gzip not measured'),
]

export const bandwidthRows: ReportRow[] = [
  r(
    'Socket traffic, 22 Oct regression',
    per(gb(1.1), '/h'),
    text('fixed in v0.10.29.1'),
    'production',
    'normal ~80 MB/h',
  ),
  r('Gateway to browser, per 20 s', mb(5.5), kb(1.7), 'production', 'one browser, after the fix'),
  r(
    'Reconnect, nothing missed',
    bytes(5_238_053),
    bytes(305),
    'benchmark',
    'full snapshot → resume',
  ),
  r('Reconnect, 3 updates missed', bytes(5_238_053), bytes(8_624), 'benchmark', 'same'),
  r(
    'Lease renewal, every ~9 min',
    bytes(9_000_653),
    bytes(53_786),
    'benchmark',
    '3 accounts, 1 chart, 6 cards',
  ),
  r(
    'Largest single message on connect',
    bytes(7_718_413),
    bytes(37_011),
    'benchmark',
    'largest account, 64 KiB parts',
  ),
  r('Average update, large', bytes(7_017), bytes(2_836), 'benchmark', '654 updates'),
  r('Average update, largest', bytes(5_315), bytes(2_660), 'benchmark', '12,014 updates'),
  r('Snapshot, largest', bytes(38_627_498), bytes(8_125_628), 'benchmark', 'windowed; v0.10.32'),
  r(
    'Price stream, busy coin',
    per(bytes(9_402), '/s'),
    per(bytes(3_432), '/s'),
    'benchmark',
    'capped at ~4.7 KB/s when backed up',
  ),
  r('Price stream, quiet coin', per(bytes(1_778), '/s'), per(bytes(1_178), '/s'), 'benchmark'),
  r('Snapshot encoding, 100 viewers', ms(735), ms(13.7), 'benchmark', 'encode once per revision'),
  r('Update encoding, 100 viewers', us(2_221), us(75), 'benchmark', 'encode once per revision'),
]

export const exchangeRows: ReportRow[] = [
  r(
    'Burst limit, one IP',
    null,
    text('first 429 at ~276 weight in ~1 s'),
    'probe',
    'fresh IP, one sample; second IP unaffected',
  ),
  r('Users tracked per IP on websockets', null, text('15 (documented: 10)'), 'probe'),
  r(
    'Chase lag, p50 / p99, 20 Chases, fast market',
    ms(1_393, 49_700),
    ms(357, 7_500),
    'benchmark',
    'simulated, 150 ms round trip; batched writes',
    { factorAt: p99 },
  ),
  r(
    'Longest exit wait behind Chase writes',
    ms(132),
    ms(0),
    'benchmark',
    '1,518 writes in 706 requests',
  ),
  r(
    'Weight charged per fill page',
    count(120),
    approx(count(20)),
    'load',
    'overcharge caused 49–65 s queue waits; v0.10.35',
  ),
  r(
    'Rate-limit errors, storming / measured account',
    null,
    text('15 / 0'),
    'load',
    'one IP each; storm peak 1,199 requests/min',
  ),
  r('Reserved IP attach, running host', null, approx(sec(15)), 'probe', 'no restart'),
]

export const fuzzRows: ReportRow[] = [
  r('protection_lifecycle', perSecond(0.83), perSecond(28.3), 'benchmark'),
  r('opposite_trades', perSecond(0.57), perSecond(16.6), 'benchmark'),
  r('native_protection', perSecond(2.5), perSecond(85), 'benchmark'),
  r('protection_amendment', perSecond(3.7), perSecond(70), 'benchmark'),
  r('chase_generative', perSecond(2.8), perSecond(53), 'benchmark'),
  r('chase_pacing', perSecond(4.5), perSecond(32), 'benchmark'),
  r('chase_close_lineage', perSecond(3.8), perSecond(48), 'benchmark'),
  r('chase_risk_lineage', perSecond(25), perSecond(360), 'benchmark'),
]

export const verificationRows: ReportRow[] = [
  r(
    'Fresh 3-minute run, native_protection',
    perSecond(1.8),
    perSecond(78.4),
    'benchmark',
    'new inputs',
  ),
  r(
    'Fuzz farm build',
    text('~50 min, 21 builds'),
    text('1 build per sanitizer'),
    'estimate',
    'build time after not recorded',
  ),
  r(
    'Release fuzz campaign, v0.10.35',
    null,
    text('45 shards, ~4 h, 0 crashes'),
    'benchmark',
    'fuzz farm',
  ),
  r('Qualification suite, v0.10.34', null, text('1,951 tests in 518 s'), 'benchmark', 'PostgreSQL'),
  r(
    'Validation mutation campaigns',
    null,
    text('53,600 compared, 0 differences'),
    'benchmark',
    'mutated accounts',
  ),
]
