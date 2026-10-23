// The history pages' ETag cache: an evictable optimization, never a source
// of truth. A miss, an error or a browser without IndexedDB (private
// windows, some WebViews) only costs a full page instead of a 304, so every
// failure here is swallowed and the cache reports a miss.

export interface CachedHistoryPage {
  key: string
  etag: string
  // The decoded JSON body as the gateway sent it.
  body: unknown
  storedAt: number
}

export interface HistoryPageCache {
  get(key: string): Promise<CachedHistoryPage | null>
  put(page: CachedHistoryPage): Promise<void>
  remove(key: string): Promise<void>
  // Drops every page whose key starts with the prefix.
  dropPrefix(prefix: string): Promise<void>
  clear(): Promise<void>
}

// Pages kept before the oldest go; about 2-3 MB of JSON at most.
export const HISTORY_CACHE_PAGES = 200

// A cache that holds nothing: what a browser without IndexedDB gets.
export const noHistoryCache: HistoryPageCache = {
  get: async () => null,
  put: async () => {},
  remove: async () => {},
  dropPrefix: async () => {},
  clear: async () => {},
}

// For tests and as a stand-in; bounded like the IndexedDB one.
export function memoryHistoryCache(limit = HISTORY_CACHE_PAGES): HistoryPageCache & {
  pages: Map<string, CachedHistoryPage>
} {
  const pages = new Map<string, CachedHistoryPage>()
  return {
    pages,
    get: async (key) => pages.get(key) ?? null,
    put: async (page) => {
      pages.delete(page.key)
      pages.set(page.key, page)
      while (pages.size > limit) pages.delete(pages.keys().next().value as string)
    },
    remove: async (key) => void pages.delete(key),
    dropPrefix: async (prefix) => {
      for (const key of [...pages.keys()]) if (key.startsWith(prefix)) pages.delete(key)
    },
    clear: async () => pages.clear(),
  }
}

// Any failure falls back to a miss, so callers never see the cache throw.
export function forgivingHistoryCache(cache: HistoryPageCache): HistoryPageCache {
  return {
    get: (key) => cache.get(key).catch(() => null),
    put: (page) => cache.put(page).catch(() => {}),
    remove: (key) => cache.remove(key).catch(() => {}),
    dropPrefix: (prefix) => cache.dropPrefix(prefix).catch(() => {}),
    clear: () => cache.clear().catch(() => {}),
  }
}

const DB_NAME = 'trad-history'
const STORE = 'pages'

// The browser's IndexedDB cache, or noHistoryCache when there is none.
export function indexedDbHistoryCache(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  limit = HISTORY_CACHE_PAGES,
): HistoryPageCache {
  if (factory === undefined) return noHistoryCache
  let opened: Promise<IDBDatabase> | null = null
  const database = (): Promise<IDBDatabase> => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open(DB_NAME, 1)
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('storedAt', 'storedAt')
      }
      open.onsuccess = () => {
        const db = open.result
        // A sign-out deletes the database: let it go.
        db.onversionchange = () => {
          db.close()
          opened = null
        }
        resolve(db)
      }
      open.onerror = () => reject(open.error)
      open.onblocked = () => reject(new Error('history cache blocked'))
    }).catch((error: unknown) => {
      opened = null
      throw error
    })
    return opened
  }
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> => {
    const db = await database()
    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request?.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }
  return forgivingHistoryCache({
    get: async (key) =>
      (await run('readonly', (store) => store.get(key) as IDBRequest<CachedHistoryPage>)) ?? null,
    put: async (page) => {
      await run('readwrite', (store) => {
        store.put(page)
        // Oldest first past the limit.
        const count = store.count()
        count.onsuccess = () => {
          let excess = count.result - limit
          if (excess <= 0) return
          store.index('storedAt').openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
            if (cursor === null || excess <= 0) return
            cursor.delete()
            excess -= 1
            cursor.continue()
          }
        }
      })
    },
    remove: async (key) => {
      await run('readwrite', (store) => {
        store.delete(key)
      })
    },
    dropPrefix: async (prefix) => {
      await run('readwrite', (store) => {
        store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`))
      })
    },
    clear: async () => {
      await run('readwrite', (store) => {
        store.clear()
      })
    },
  })
}

// Sign-out: the cached pages are the user's trade history.
export function deleteHistoryCache(factory: IDBFactory | undefined = globalThis.indexedDB): void {
  try {
    factory?.deleteDatabase(DB_NAME)
  } catch {
    // Nothing cached, or storage refused: nothing to delete.
  }
}
