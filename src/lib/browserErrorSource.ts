export type BrowserErrorSource = 'extension' | 'application' | 'unknown'

// ErrorEvent.filename is browser-supplied provenance, not a reason to inspect
// arbitrary stack text or display extension exceptions as Trad failures.
export function browserErrorSource(filename: string, origin: string): BrowserErrorSource {
  if (/^(?:chrome|moz|safari|ms-browser)-extension:\/\//i.test(filename)) return 'extension'
  if (filename === '') return 'unknown'
  try {
    return new URL(filename).origin === origin ? 'application' : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function browserRejectionSource(reason: unknown, origin: string): BrowserErrorSource {
  if (!(reason instanceof Error) || typeof reason.stack !== 'string') return 'unknown'
  const stack = reason.stack.slice(0, 2048)
  if (stack.includes(origin)) return 'application'
  if (/(?:chrome|moz|safari|ms-browser)-extension:\/\//i.test(stack)) return 'extension'
  return 'unknown'
}
