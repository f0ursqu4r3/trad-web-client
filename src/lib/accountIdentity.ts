export interface AccountIdentityLike {
  exchange: string
  network?: string | null
  exchange_metadata?: {
    product?: string | null
  } | null
}

export function accountIdentityChips(account: AccountIdentityLike): string[] {
  const product = formatIdentityProduct(account.exchange_metadata?.product)
  return [account.exchange, account.network, product].filter(
    (value): value is string => typeof value === 'string' && value !== '',
  )
}

function formatIdentityProduct(value: string | null | undefined): string | null {
  if (!value) return null
  return value.replace(/_/g, ' ').toUpperCase().replace('PERP', 'perp')
}
