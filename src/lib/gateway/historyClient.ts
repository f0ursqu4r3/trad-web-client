import { noHistoryCache, type HistoryPageCache } from './historyCache.ts'
import {
  closedTradesRequest,
  decodeClosedTradesPage,
  decodeExposuresPage,
  decodeTradeEvidencePage,
  decodeTradeFillsPage,
  exposuresRequest,
  historyCacheKey,
  historyCachePrefix,
  historyUrl,
  tradeEvidenceRequest,
  tradeFillsRequest,
  type ClosedTradesPage,
  type ExposuresPage,
  type HistoryRequest,
  type TradeEvidencePage,
  type TradeFillsPage,
} from './historyPages.ts'

// History over HTTP (slice S3): GETs with the session cookie, revalidated
// against the ETag cache (a 304 serves the cached page), and backed off by
// Retry-After on 429 and 503. The rate limit is per user, so one wait holds
// every request this client sends. Requests never go on the socket.

export type HistoryErrorCode =
  | 'invalid_cursor'
  | 'invalid_limit'
  | 'account_not_found'
  | 'unknown_trade'
  | 'rate_limited'
  | 'account_unavailable'
  | 'subscription_required'
  | 'invalid_page'
  | 'network'
  | (string & {})

export class HistoryRequestError extends Error {
  readonly status: number
  readonly code: HistoryErrorCode
  // Set for 429 and 503: how long the gateway asked to wait.
  readonly retryAfterMs: number | null

  constructor(
    status: number,
    code: HistoryErrorCode,
    message: string,
    retryAfterMs = null as number | null,
  ) {
    super(message)
    this.name = 'HistoryRequestError'
    this.status = status
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

export interface HistoryLoadOptions {
  signal?: AbortSignal
  // Called before each backoff wait, so the page can say it is waiting.
  onWait?: (waitMs: number, code: HistoryErrorCode) => void
}

export interface HistoryClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  cache?: HistoryPageCache
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  // Attempts per request while the gateway answers 429 or 503.
  maxAttempts?: number
}

const DEFAULT_RETRY_MS = 2_000
const MAX_RETRY_MS = 30_000
const BACKOFF_CODES = new Set([429, 503])

export class HistoryClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly cache: HistoryPageCache
  private readonly now: () => number
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  private readonly maxAttempts: number
  private blockedUntil = 0

  constructor(options: HistoryClientOptions) {
    this.baseUrl = options.baseUrl
    this.fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.cache = options.cache ?? noHistoryCache
    this.now = options.now ?? (() => Date.now())
    this.sleep = options.sleep ?? abortableSleep
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 4)
  }

  closedTrades(
    accountId: string,
    before: string | null,
    options: HistoryLoadOptions & { limit?: number } = {},
  ): Promise<ClosedTradesPage> {
    return this.load(
      closedTradesRequest(accountId, before, options.limit),
      decodeClosedTradesPage,
      options,
    )
  }

  tradeFills(
    accountId: string,
    tradeId: string,
    after: string | null,
    options: HistoryLoadOptions & { limit?: number } = {},
  ): Promise<TradeFillsPage> {
    return this.load(
      tradeFillsRequest(accountId, tradeId, after, options.limit),
      decodeTradeFillsPage,
      options,
    )
  }

  tradeEvidence(
    accountId: string,
    tradeId: string,
    cursor: string | null,
    options: HistoryLoadOptions = {},
  ): Promise<TradeEvidencePage> {
    return this.load(
      tradeEvidenceRequest(accountId, tradeId, cursor),
      decodeTradeEvidencePage,
      options,
    )
  }

  exposures(
    accountId: string,
    symbol: string,
    before: string | null,
    options: HistoryLoadOptions & { limit?: number } = {},
  ): Promise<ExposuresPage> {
    return this.load(
      exposuresRequest(accountId, symbol, before, options.limit),
      decodeExposuresPage,
      options,
    )
  }

  // Forgets every cached page (sign-out).
  clearCache(): Promise<void> {
    return this.cache.clear()
  }

  async load<T>(
    request: HistoryRequest,
    decode: (value: unknown) => T | null,
    options: HistoryLoadOptions = {},
  ): Promise<T> {
    const key = historyCacheKey(request)
    let revalidate = true
    for (let attempt = 1; ; attempt += 1) {
      await this.waitForGate(options)
      const cached = revalidate ? await this.cache.get(key) : null
      const response = await this.send(request, cached?.etag ?? null, options.signal)

      if (response.status === 304) {
        const page = cached === null ? null : decode(cached.body)
        if (page !== null) return page
        if (cached === null) {
          throw new HistoryRequestError(304, 'invalid_page', 'not modified, but nothing is cached')
        }
        // The cached page no longer decodes: ask again in full.
        await this.cache.remove(key)
        revalidate = false
        continue
      }
      if (response.ok) {
        const body = await readJson(response)
        const page = decode(body)
        if (page === null) {
          throw new HistoryRequestError(
            response.status,
            'invalid_page',
            'history page is malformed',
          )
        }
        const etag = response.headers.get('ETag')
        if (etag !== null && etag !== '') {
          void this.cache.put({ key, etag, body, storedAt: this.now() })
        }
        return page
      }

      const failure = await readFailure(response)
      if (BACKOFF_CODES.has(response.status)) {
        const waitMs = retryAfterMs(response.headers.get('Retry-After'), this.now())
        this.blockedUntil = Math.max(this.blockedUntil, this.now() + waitMs)
        if (attempt < this.maxAttempts) {
          options.onWait?.(waitMs, failure.code)
          continue
        }
        throw new HistoryRequestError(response.status, failure.code, failure.message, waitMs)
      }
      if (failure.code === 'invalid_cursor') {
        // Cursors changed format: the caller restarts from the first page.
        await this.cache.dropPrefix(historyCachePrefix(request))
      }
      throw new HistoryRequestError(response.status, failure.code, failure.message)
    }
  }

  private async waitForGate(options: HistoryLoadOptions): Promise<void> {
    const waitMs = this.blockedUntil - this.now()
    if (waitMs > 0) await this.sleep(waitMs, options.signal)
  }

  private async send(
    request: HistoryRequest,
    etag: string | null,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (etag !== null) headers['If-None-Match'] = etag
    try {
      return await this.fetcher(historyUrl(this.baseUrl, request), {
        method: 'GET',
        credentials: 'include',
        // Our own ETag cache revalidates; the HTTP cache would hide the 304.
        cache: 'no-store',
        headers,
        signal,
      })
    } catch (error) {
      if (isAbort(error)) throw error
      throw new HistoryRequestError(
        0,
        'network',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

// Seconds or an HTTP date; the gateway's default when absent or unreadable.
export function retryAfterMs(header: string | null, now: number): number {
  const value = header?.trim() ?? ''
  let waitMs = DEFAULT_RETRY_MS
  if (/^\d+$/.test(value)) waitMs = Number(value) * 1_000
  else if (value !== '' && Number.isFinite(Date.parse(value))) waitMs = Date.parse(value) - now
  return Math.min(MAX_RETRY_MS, Math.max(1_000, waitMs))
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new HistoryRequestError(response.status, 'invalid_page', 'history page is not JSON')
  }
}

async function readFailure(
  response: Response,
): Promise<{ code: HistoryErrorCode; message: string }> {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: unknown; code?: unknown }
    if (typeof body.code === 'string') {
      return { code: body.code, message: typeof body.error === 'string' ? body.error : body.code }
    }
  } catch {
    // Plain-text refusals (401, malformed path).
  }
  return { code: `http_${response.status}`, message: text.trim() || `HTTP ${response.status}` }
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}
