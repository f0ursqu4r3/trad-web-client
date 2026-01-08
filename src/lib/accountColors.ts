const ACCOUNT_PALETTE = [
  '#56cfe1',
  '#5b8cff',
  '#3fd28c',
  '#f7a529',
  '#e45757',
  '#9d7bff',
  '#21b8c5',
  '#8bc34a',
  '#ff9f1c',
]

export function accountColorFromId(id: string, fallback = 'var(--color-text-dim)'): string {
  if (!id) return fallback
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 2147483647
  }
  return ACCOUNT_PALETTE[Math.abs(hash) % ACCOUNT_PALETTE.length]
}
