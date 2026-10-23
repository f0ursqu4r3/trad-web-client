import type { BrowserHistoryError, BrowserServerMessage } from './wire.ts'

// How the gateway's subscription and history errors read in the terminal.

export function subscriptionFailure(
  error: Extract<BrowserServerMessage, { kind: 'account_error' }>['error'],
): {
  reason: string
  kind: 'authorization' | 'availability' | 'resync'
} {
  switch (error.kind) {
    case 'unauthorized':
      return { reason: 'Account access is not authorized for this user', kind: 'authorization' }
    case 'unavailable':
      return { reason: error.reason, kind: 'availability' }
    case 'resync_failed':
      return { reason: error.reason, kind: 'resync' }
  }
}

export function historyError(error: BrowserHistoryError, kind: 'modern' | 'legacy'): string {
  const label = kind === 'legacy' ? 'imported command history' : 'command history'
  switch (error.kind) {
    case 'unauthorized':
      return `${label} is unauthorized`
    case 'invalid_request':
    case 'routing_changed':
    case 'unavailable':
      return error.reason
    case 'revision_changed':
      return `${label} revision changed from ${error.expected} to ${error.actual}`
  }
}
