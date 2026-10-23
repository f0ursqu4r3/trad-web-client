import type {
  ChaseProjection,
  CloseWorkflowProjection,
  CommandProjection,
  EntryCancellationProjection,
  ExecutionGroupProjection,
  ExecutionProjection,
  FlattenWorkflowProjection,
  NativeProtectionProjection,
  OrderProjection,
  OwnedExposureProjection,
  PresentationRelationship,
  ProtectionAmendmentProjection,
  ProtectionProjection,
  TrailingEntryProjection,
} from './projection.ts'
import { decodeTradeSummaries, type TradeSummary } from './tradeSummary.ts'

// History over HTTP (trade-summary slice S3; the backend's
// docs/networking-trade-summaries.md, "Endpoints (for the frontend)"): the
// four page shapes, their routes and their decoders. Cursors are opaque and
// passed back unchanged. A decoder keeps only rows that carry their
// identity; a body that is not a page at all is refused (null).

export const MAX_CLOSED_TRADES_PAGE = 50
export const MAX_FILLS_PAGE = 250
export const MAX_EXPOSURES_PAGE = 200

export type HistoryRoute = 'closed_trades' | 'fills' | 'evidence' | 'exposures'

export interface ClosedTradesPage {
  trades: TradeSummary[]
  next: string | null
}

export type TradeFillRole = 'entry' | 'close' | 'protection' | 'manual'

export interface TradeFill {
  role: TradeFillRole
  execution: ExecutionProjection
}

export interface TradeFillsPage {
  trade_id: string
  fills: TradeFill[]
  next: string | null
}

export interface TradeEvidencePage {
  trade_id: string
  commands: CommandProjection[]
  orders: OrderProjection[]
  protections: ProtectionProjection[]
  execution_groups: ExecutionGroupProjection[]
  chases: ChaseProjection[]
  trailing_entries: TrailingEntryProjection[]
  close_workflows: CloseWorkflowProjection[]
  flatten_workflows: FlattenWorkflowProjection[]
  entry_cancellations: EntryCancellationProjection[]
  protection_amendments: ProtectionAmendmentProjection[]
  native_protection: NativeProtectionProjection | null
  relationships: PresentationRelationship[]
  next: string | null
}

export interface ExposureHistoryRow {
  // The owning trade's first command; null when that command is unknown.
  created_at: number | null
  exposure: OwnedExposureProjection
}

export interface ExposuresPage {
  symbol: string
  total: number
  exposures: ExposureHistoryRow[]
  next: string | null
}

// One request: the path under /api and its query, cursor included.
export interface HistoryRequest {
  route: HistoryRoute
  accountId: string
  path: string
  query: Record<string, string>
  // The page position, for the cache key ('' for the first page).
  cursor: string
}

export function closedTradesRequest(
  accountId: string,
  before: string | null,
  limit = MAX_CLOSED_TRADES_PAGE,
): HistoryRequest {
  const query: Record<string, string> = { state: 'closed', limit: String(limit) }
  if (before !== null) query.before = before
  return request('closed_trades', accountId, '/trades', query, before)
}

export function tradeFillsRequest(
  accountId: string,
  tradeId: string,
  after: string | null,
  limit = MAX_FILLS_PAGE,
): HistoryRequest {
  const query: Record<string, string> = { limit: String(limit) }
  if (after !== null) query.after = after
  return request('fills', accountId, `/trades/${encodeURIComponent(tradeId)}/fills`, query, after)
}

export function tradeEvidenceRequest(
  accountId: string,
  tradeId: string,
  cursor: string | null,
): HistoryRequest {
  const query: Record<string, string> = {}
  if (cursor !== null) query.cursor = cursor
  return request(
    'evidence',
    accountId,
    `/trades/${encodeURIComponent(tradeId)}/evidence`,
    query,
    cursor,
  )
}

export function exposuresRequest(
  accountId: string,
  symbol: string,
  before: string | null,
  limit = MAX_EXPOSURES_PAGE,
): HistoryRequest {
  const query: Record<string, string> = { limit: String(limit) }
  if (before !== null) query.before = before
  // Percent-encoded: `xyz:GOLD` travels as `xyz%3AGOLD`.
  return request(
    'exposures',
    accountId,
    `/positions/${encodeURIComponent(symbol)}/exposures`,
    query,
    before,
  )
}

function request(
  route: HistoryRoute,
  accountId: string,
  suffix: string,
  query: Record<string, string>,
  cursor: string | null,
): HistoryRequest {
  return {
    route,
    accountId,
    path: `/accounts/${encodeURIComponent(accountId)}${suffix}`,
    query,
    cursor: cursor ?? '',
  }
}

export function historyUrl(baseUrl: string, request: HistoryRequest): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const search = new URLSearchParams(request.query).toString()
  return `${base}${request.path}${search === '' ? '' : `?${search}`}`
}

// Cache key: account, route (with its trade or coin) and page position.
export function historyCacheKey(request: HistoryRequest): string {
  return `${historyCachePrefix(request)}${request.query.limit ?? ''}|${request.cursor}`
}

export function historyCachePrefix(request: HistoryRequest): string {
  return `${request.accountId}|${request.path}|`
}

export function decodeClosedTradesPage(value: unknown): ClosedTradesPage | null {
  const page = record(value)
  if (page === null || !Array.isArray(page.trades)) return null
  return { trades: decodeTradeSummaries(page.trades), next: cursor(page.next) }
}

const FILL_ROLES: ReadonlySet<string> = new Set(['entry', 'close', 'protection', 'manual'])

export function decodeTradeFillsPage(value: unknown): TradeFillsPage | null {
  const page = record(value)
  if (page === null || typeof page.trade_id !== 'string' || !Array.isArray(page.fills)) return null
  const fills: TradeFill[] = []
  for (const row of page.fills) {
    const fill = record(row)
    const execution = record(fill?.execution)
    if (
      fill === null ||
      execution === null ||
      typeof fill.role !== 'string' ||
      !FILL_ROLES.has(fill.role) ||
      typeof execution.event_id !== 'string' ||
      record(execution.fill) === null
    ) {
      continue
    }
    fills.push({
      role: fill.role as TradeFillRole,
      execution: execution as unknown as ExecutionProjection,
    })
  }
  return { trade_id: page.trade_id, fills, next: cursor(page.next) }
}

export function decodeTradeEvidencePage(value: unknown): TradeEvidencePage | null {
  const page = record(value)
  if (page === null || typeof page.trade_id !== 'string' || !Array.isArray(page.commands)) {
    return null
  }
  return {
    trade_id: page.trade_id,
    commands: rows<CommandProjection>(page.commands, 'command_id'),
    orders: rows<OrderProjection>(page.orders, 'order_id'),
    protections: rows<ProtectionProjection>(page.protections, 'remote_order_id'),
    execution_groups: rows<ExecutionGroupProjection>(page.execution_groups),
    chases: rows<ChaseProjection>(page.chases),
    trailing_entries: rows<TrailingEntryProjection>(page.trailing_entries),
    close_workflows: rows<CloseWorkflowProjection>(page.close_workflows),
    flatten_workflows: rows<FlattenWorkflowProjection>(page.flatten_workflows),
    entry_cancellations: rows<EntryCancellationProjection>(page.entry_cancellations),
    protection_amendments: rows<ProtectionAmendmentProjection>(page.protection_amendments),
    native_protection:
      typeof record(page.native_protection)?.protection_id === 'string'
        ? (page.native_protection as NativeProtectionProjection)
        : null,
    relationships: rows<PresentationRelationship>(page.relationships),
    next: cursor(page.next),
  }
}

export function decodeExposuresPage(value: unknown): ExposuresPage | null {
  const page = record(value)
  if (
    page === null ||
    typeof page.symbol !== 'string' ||
    !Number.isSafeInteger(page.total) ||
    !Array.isArray(page.exposures)
  ) {
    return null
  }
  const exposures: ExposureHistoryRow[] = []
  for (const row of page.exposures) {
    const item = record(row)
    const exposure = record(item?.exposure)
    if (item === null || exposure === null || typeof exposure.scope_id !== 'string') continue
    const createdAt = Number.isSafeInteger(item.created_at) ? (item.created_at as number) : null
    exposures.push({
      created_at: createdAt,
      exposure: exposure as unknown as OwnedExposureProjection,
    })
  }
  return { symbol: page.symbol, total: page.total as number, exposures, next: cursor(page.next) }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function cursor(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

// Objects only, and with their id when the row has one.
function rows<T>(value: unknown, id?: string): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((row) => {
    const item = record(row)
    return item !== null && (id === undefined || typeof item[id] === 'string')
  }) as T[]
}
