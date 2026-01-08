const ACCOUNT_PALETTE = [
  'var(--account-color-1)',
  'var(--account-color-2)',
  'var(--account-color-3)',
  'var(--account-color-4)',
  'var(--account-color-5)',
  'var(--account-color-6)',
  'var(--account-color-7)',
  'var(--account-color-8)',
  'var(--account-color-9)',
]

export function accountColorFromId(id: string, fallback = 'var(--color-text-dim)'): string {
  if (!id) return fallback
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 2147483647
  }
  return ACCOUNT_PALETTE[Math.abs(hash) % ACCOUNT_PALETTE.length]
}
