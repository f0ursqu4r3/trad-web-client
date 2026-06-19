import { type MarketContext } from '@/lib/ws/protocol'

export type AccountDisplayRecord = {
  id: string
  label: string
  exchange: string
  network?: string | null
}

export function normalizeMarketContext(raw: MarketContext | Record<string, unknown>): MarketContext {
  if (!raw || typeof raw !== 'object') return { type: 'none' }
  const maybe = raw as Record<string, unknown>
  if ('type' in maybe) {
    return raw as MarketContext
  }
  const binance = maybe.binance ?? maybe.Binance
  if (binance) {
    const ctx = binance as { account_id?: string } | undefined
    return { type: 'binance', account_id: ctx?.account_id || '' }
  }
  const bifake = maybe.bifake ?? maybe.Bifake
  if (bifake) {
    const ctx = bifake as { account_id?: string } | undefined
    return { type: 'bifake', account_id: ctx?.account_id || '' }
  }
  const bybit = maybe.bybit ?? maybe.Bybit
  if (bybit) {
    const ctx = bybit as { account_id?: string } | undefined
    return { type: 'bybit', account_id: ctx?.account_id || '' }
  }
  const sim = maybe.sim ?? maybe.Sim
  if (sim) {
    const ctx = sim as { sim_market_id?: string } | undefined
    return { type: 'sim', sim_market_id: ctx?.sim_market_id || '' }
  }
  return { type: 'none' }
}

export function marketContextAccountId(ctx: MarketContext): string | null {
  if (ctx.type === 'binance' || ctx.type === 'bifake' || ctx.type === 'bybit') {
    return ctx.account_id || null
  }
  if (ctx.type === 'sim') return ctx.sim_market_id || null
  return null
}

export function marketContextExchangeLabel(ctx: MarketContext): string {
  switch (ctx.type) {
    case 'binance':
      return 'Binance'
    case 'bifake':
      return 'Bifake'
    case 'bybit':
      return 'Bybit'
    case 'sim':
      return 'Sim'
    default:
      return 'None'
  }
}

export function marketContextProductKey(ctx: MarketContext): string {
  switch (ctx.type) {
    case 'binance':
      return 'usd_m_futures'
    case 'bybit':
      return 'usdt_perp'
    case 'bifake':
      return 'fake'
    case 'sim':
      return 'sim'
    default:
      return 'none'
  }
}

export function marketProductLabel(product: string): string {
  switch (product) {
    case 'usd_m_futures':
      return 'USD-M Futures'
    case 'usdt_perp':
      return 'USDT Perp'
    case 'fake':
      return 'Fake'
    case 'sim':
      return 'Sim'
    default:
      return product === 'none' ? 'None' : product
  }
}

export function accountLabelForContext(
  ctx: MarketContext,
  accounts: readonly AccountDisplayRecord[],
): string | null {
  const accountId = marketContextAccountId(ctx)
  if (!accountId || ctx.type === 'sim') return accountId
  const account = accounts.find((item) => item.id === accountId)
  return account?.label ?? `${accountId.slice(0, 8)}...`
}

export function networkLabelForContext(
  ctx: MarketContext,
  accounts: readonly AccountDisplayRecord[],
): string | null {
  const accountId = marketContextAccountId(ctx)
  if (!accountId || ctx.type === 'sim') return null
  return accounts.find((item) => item.id === accountId)?.network ?? null
}

export function formatMarketContext(
  ctx: MarketContext,
  accounts: readonly AccountDisplayRecord[] = [],
): string {
  const parts = [marketContextExchangeLabel(ctx)]
  const accountLabel = accountLabelForContext(ctx, accounts)
  const networkLabel = networkLabelForContext(ctx, accounts)
  const productLabel = marketProductLabel(marketContextProductKey(ctx))
  if (accountLabel) parts.push(accountLabel)
  if (networkLabel) parts.push(networkLabel)
  if (productLabel !== 'None') parts.push(productLabel)
  return parts.join(' • ')
}
