import { HistoryRequestError } from './historyClient.ts'
import type { TradeSummary } from './tradeSummary.ts'

// Walks one history list page by page: items de-duplicated by their own id
// (a later copy replaces the earlier one only when `keep` says so), the
// next cursor, and whether the list is done. A `400 invalid_cursor` (a
// cursor format change) restarts from the first page; a reset while a page
// is in flight drops that page.

export interface HistoryPageResult<T> {
  items: T[]
  next: string | null
}

export type PagerStatus = 'idle' | 'loading' | 'waiting' | 'error' | 'done'

export type HistoryPageFetch<T> = (
  cursor: string | null,
  onWait: (waitMs: number) => void,
) => Promise<HistoryPageResult<T>>

export interface HistoryPagerOptions<T> {
  fetchPage: HistoryPageFetch<T>
  id: (item: T) => string
  // Which of two copies of one item stays; the later one by default.
  keep?: (current: T, incoming: T) => T
  // After every change of items or status.
  onChange?: () => void
}

export class HistoryPager<T> {
  // Replaced, never edited, so a shallowRef can hold it.
  items: readonly T[] = []
  next: string | null = null
  done = false
  loading = false
  // Set while a 429 or 503 backoff waits.
  waitingMs: number | null = null
  error: HistoryRequestError | null = null
  restarts = 0
  private started = false
  private generation = 0
  private readonly index = new Map<string, number>()
  private readonly fetchPage: HistoryPageFetch<T>
  private readonly id: (item: T) => string
  private readonly keep: (current: T, incoming: T) => T
  private readonly onChange: () => void

  constructor(options: HistoryPagerOptions<T>) {
    this.fetchPage = options.fetchPage
    this.id = options.id
    this.keep = options.keep ?? ((_current, incoming) => incoming)
    this.onChange = options.onChange ?? (() => {})
  }

  get status(): PagerStatus {
    if (this.waitingMs !== null) return 'waiting'
    if (this.loading) return 'loading'
    if (this.error !== null) return 'error'
    return this.done ? 'done' : 'idle'
  }

  // Loads the next page; false when there is none or one is in flight.
  async loadMore(): Promise<boolean> {
    if (this.loading || this.done) return false
    const generation = this.generation
    this.loading = true
    this.error = null
    this.onChange()
    const onWait = (waitMs: number) => {
      if (generation !== this.generation) return
      this.waitingMs = waitMs
      this.onChange()
    }
    try {
      let page: HistoryPageResult<T>
      try {
        page = await this.fetchPage(this.started ? this.next : null, onWait)
      } catch (error) {
        if (!(error instanceof HistoryRequestError) || error.code !== 'invalid_cursor') throw error
        if (generation !== this.generation || !this.started) throw error
        // The cursor no longer reads: start over from the first page.
        this.clear()
        this.restarts += 1
        page = await this.fetchPage(null, onWait)
      }
      if (generation !== this.generation) return false
      this.started = true
      this.add(page.items)
      this.next = page.next
      this.done = page.next === null
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      this.error =
        error instanceof HistoryRequestError
          ? error
          : new HistoryRequestError(
              0,
              'network',
              error instanceof Error ? error.message : String(error),
            )
      return false
    } finally {
      if (generation === this.generation) {
        this.loading = false
        this.waitingMs = null
        this.onChange()
      }
    }
  }

  // Back to before the first page; an in-flight page is dropped.
  reset(): void {
    this.generation += 1
    this.clear()
    this.loading = false
    this.waitingMs = null
    this.error = null
    this.onChange()
  }

  private clear(): void {
    this.items = []
    this.index.clear()
    this.next = null
    this.done = false
    this.started = false
  }

  private add(incoming: T[]): void {
    if (incoming.length === 0) return
    const items = [...this.items]
    for (const item of incoming) {
      const key = this.id(item)
      const at = this.index.get(key)
      if (at === undefined) {
        this.index.set(key, items.length)
        items.push(item)
      } else {
        items[at] = this.keep(items[at]!, item)
      }
    }
    this.items = items
  }
}

// Of two copies of one trade's summary, the newer revision.
export function newerSummary(current: TradeSummary, incoming: TradeSummary): TradeSummary {
  return incoming.revision >= current.revision ? incoming : current
}
