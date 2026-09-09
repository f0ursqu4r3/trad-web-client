import type { BrowserServerMessage } from './wire.ts'

export function parseServerMessage(raw: unknown): BrowserServerMessage | null {
  try {
    const text =
      typeof raw === 'string'
        ? raw
        : raw instanceof ArrayBuffer
          ? new TextDecoder().decode(raw)
          : null
    if (text === null) return null
    const parsed = JSON.parse(text) as unknown
    return isServerMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isServerMessage(value: unknown): value is BrowserServerMessage {
  return (
    typeof value === 'object' && value !== null && 'kind' in value && typeof value.kind === 'string'
  )
}
