export function hyperliquidAgentName(accountId: string): string {
  const compact = accountId.trim().toLowerCase().replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    throw new Error('Hyperliquid agent naming requires a valid account UUID.')
  }
  return `trad-${compact.slice(0, 8)}`
}
