export type BrowserErrorSource = 'extension' | 'application' | 'unknown'
export type BrowserStackProvenance =
  | 'app_and_extension'
  | 'application'
  | 'extension'
  | 'other'
  | 'absent'

export function browserErrorKind(value: unknown): string {
  if (!(value instanceof Error)) return 'non_error'
  switch (value.name) {
    case 'TypeError':
      return 'type_error'
    case 'ReferenceError':
      return 'reference_error'
    case 'SyntaxError':
      return 'syntax_error'
    case 'RangeError':
      return 'range_error'
    default:
      return 'error'
  }
}

export function browserStackProvenance(value: unknown, origin: string): BrowserStackProvenance {
  if (!(value instanceof Error) || typeof value.stack !== 'string') return 'absent'
  const stack = value.stack.slice(0, 4096)
  const extension = /(?:chrome|moz|safari|ms-browser)-extension:\/\//i.test(stack)
  const application = [...stack.matchAll(/https?:\/\/[^\s)]+/g)].some(([candidate]) => {
    try {
      return new URL(candidate).origin === origin
    } catch {
      return false
    }
  })
  if (application && extension) return 'app_and_extension'
  if (application) return 'application'
  if (extension) return 'extension'
  return 'other'
}

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
  const provenance = browserStackProvenance(reason, origin)
  if (provenance === 'application' || provenance === 'app_and_extension') return 'application'
  if (provenance === 'extension') return 'extension'
  return 'unknown'
}
