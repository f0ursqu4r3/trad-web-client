// Account list refreshes (on tab focus and every 30 s) usually return exactly
// what the browser already has. Keeping the existing objects for unchanged
// accounts keeps everything keyed on an account (trade cards, market
// catalogs, price subscriptions) from re-running on every refresh.

export interface IdentifiedRecord {
  id: string
}

// The previous list when nothing changed; otherwise the new list with each
// unchanged account replaced by its previous object.
export function reconcileAccountList<T extends IdentifiedRecord>(
  previous: readonly T[],
  next: readonly T[],
): T[] | null {
  const previousById = new Map(previous.map((account) => [account.id, account]))
  let changed = previous.length !== next.length
  const reconciled = next.map((account, index) => {
    const existing = previousById.get(account.id)
    if (existing !== undefined && sameRecord(existing, account)) {
      if (previous[index] !== existing) changed = true
      return existing
    }
    changed = true
    return account
  })
  return changed ? reconciled : null
}

export function accountListAge(lastFetchedAt: number | null, now = Date.now()): number {
  return lastFetchedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - lastFetchedAt)
}

function sameRecord(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const leftKeys = Object.keys(left).filter(
    (key) => (left as Record<string, unknown>)[key] !== undefined,
  )
  const rightKeys = Object.keys(right).filter(
    (key) => (right as Record<string, unknown>)[key] !== undefined,
  )
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) =>
    sameRecord((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  )
}
