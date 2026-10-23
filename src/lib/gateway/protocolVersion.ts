// What a tab does when the gateway speaks another browser protocol version.
//
// The gateway checks `Authenticate.protocol_version` and, on a mismatch,
// closes the socket before any hello with close code 1008 (policy) and the
// reason "browser protocol mismatch: expected <gateway>, received <client>"
// (gateway/src/browser_socket/auth.rs and connection.rs). Without handling,
// the client treated that as an ordinary drop and reconnected forever, a
// fresh ticket every 1-30 s, showing only "reconnecting".
//
// - The gateway is newer: this page's code is out of date. Reload once to
//   fetch the new frontend; a sessionStorage stamp stops a second automatic
//   reload for a few minutes (a cached old bundle would otherwise loop), and
//   the page then asks the trader to reload.
// - The gateway is older (the frontend shipped first): keep reconnecting; the
//   gateway catches up.

export const PROTOCOL_MISMATCH_CLOSE_CODE = 1008
export const PROTOCOL_RELOAD_GUARD_MS = 5 * 60_000
const RELOAD_STAMP_KEY = 'trad:protocol-reload'
const MISMATCH_REASON = /browser protocol mismatch: expected (\d+), received (\d+)/

export interface ProtocolMismatch {
  // The gateway's version and the one this page sent.
  expected: number
  actual: number
}

export type ProtocolMismatchAction = 'reload' | 'reload_required' | 'wait_for_server'

export interface ReloadStampStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function protocolMismatchFromClose(code: number, reason: string): ProtocolMismatch | null {
  if (code !== PROTOCOL_MISMATCH_CLOSE_CODE) return null
  const match = MISMATCH_REASON.exec(reason)
  if (match === null) return null
  const expected = Number(match[1])
  const actual = Number(match[2])
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(actual)) return null
  return expected === actual ? null : { expected, actual }
}

export function protocolMismatchAction(
  mismatch: ProtocolMismatch,
  storage: ReloadStampStorage | null,
  now: number,
): ProtocolMismatchAction {
  if (mismatch.expected < mismatch.actual) return 'wait_for_server'
  // Without storage there is no loop guard: ask instead of reloading.
  if (storage === null) return 'reload_required'
  try {
    const stamp = Number(storage.getItem(RELOAD_STAMP_KEY))
    if (Number.isFinite(stamp) && stamp > 0 && now - stamp < PROTOCOL_RELOAD_GUARD_MS) {
      return 'reload_required'
    }
    storage.setItem(RELOAD_STAMP_KEY, String(now))
    return 'reload'
  } catch {
    return 'reload_required'
  }
}

export function browserReloadStampStorage(): ReloadStampStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}
