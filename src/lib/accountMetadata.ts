import { ExchangeType, type NetworkType } from '@/lib/ws/protocol'
export { accountIdentityChips } from './accountIdentity'

export interface ExchangeAccountMetadataLike {
  product?: string | null
  hedge_mode_only?: boolean | null
  account_mode?: string | null
  margin_mode?: string | null
  user_address?: string | null
  agent_address?: string | null
  vault_address?: string | null
  builder_address?: string | null
  builder_config_version?: string | null
  builder_fee_tenths_bps?: number | null
  builder_target_total_tenths_bps?: number | null
  builder_fee_manager?: boolean | null
  max_builder_fee_tenths_bps?: number | null
  builder_approved?: boolean | null
  builder_approval_network?: NetworkType | null
  builder_approval_user_address?: string | null
  builder_approval_verified_at_ms?: number | null
  agent_approved?: boolean | null
  agent_approval_verified_at_ms?: number | null
  default_leverage?: number | null
  symbol_leverage_overrides?: Record<string, number> | null
  entry_market_guard_tenths_bps?: number | null
  take_profit_market_guard_tenths_bps?: number | null
  stop_loss_market_guard_tenths_bps?: number | null
}

export interface AccountMetadataLike {
  id?: string
  label?: string
  exchange: ExchangeType
  network?: NetworkType | string | null
  exchange_metadata?: ExchangeAccountMetadataLike | null
}

export function formatAccountProduct(product?: string | null): string | null {
  switch (product) {
    case 'usdt_perp':
      return 'USDT perp'
    case 'usdc_perp':
      return 'USDC perp'
    default:
      return normalizeMetadataLabel(product)
  }
}

export function normalizeMetadataLabel(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function isVerifiedBybitMetadataLabel(value?: string | null): boolean {
  const label = normalizeMetadataLabel(value)
  if (!label) return false
  const normalized = label.toLowerCase()
  return (
    normalized !== 'unknown' &&
    normalized !== 'unknown account mode' &&
    normalized !== 'unknown margin mode'
  )
}

export function accountMetadataChips(account: AccountMetadataLike): string[] {
  const meta = account.exchange_metadata
  const chips: string[] = [account.exchange, account.network || 'Unknown']
  const product = formatAccountProduct(meta?.product)
  if (product) chips.push(product)
  if (meta?.hedge_mode_only) chips.push('Hedge only')
  if (account.exchange === ExchangeType.Hyperliquid) chips.push('One-way')
  const marginMode = normalizeMetadataLabel(meta?.margin_mode)
  const accountMode = normalizeMetadataLabel(meta?.account_mode)
  if (account.exchange !== ExchangeType.Bybit || isVerifiedBybitMetadataLabel(marginMode)) {
    if (marginMode) chips.push(marginMode)
  }
  if (account.exchange !== ExchangeType.Bybit || isVerifiedBybitMetadataLabel(accountMode)) {
    if (accountMode) chips.push(accountMode)
  }
  if (account.exchange === ExchangeType.Bybit && !isBybitMetadataVerified(account)) {
    chips.push('Mode unvalidated')
  }
  if (account.exchange === ExchangeType.Hyperliquid) {
    if (normalizeMetadataLabel(meta?.agent_address)) chips.push('Agent set')
    else chips.push('Agent missing')
    if (meta?.agent_approved === true) chips.push('Agent approved')
    else chips.push('Agent unvalidated')
    if (hyperliquidTargetTotalTenthsBps(meta) === 0) chips.push('No builder fee')
    else if (meta?.builder_approved === true) chips.push('Builder approved')
    else chips.push('Builder unvalidated')
    if (meta?.vault_address) chips.push('Vault/subaccount')
    if (meta?.default_leverage) chips.push(`${meta.default_leverage}x default`)
    const overrideCount = Object.keys(meta?.symbol_leverage_overrides ?? {}).length
    if (overrideCount) chips.push(`${overrideCount} lev override${overrideCount === 1 ? '' : 's'}`)
  }
  return chips
}

export function isBybitMetadataVerified(account: AccountMetadataLike | null | undefined): boolean {
  if (!account || account.exchange !== ExchangeType.Bybit) return true
  const meta = account.exchange_metadata
  return Boolean(
    meta?.product === 'usdt_perp' &&
      meta?.hedge_mode_only &&
      isVerifiedBybitMetadataLabel(meta?.account_mode) &&
      isVerifiedBybitMetadataLabel(meta?.margin_mode),
  )
}

export function accountMetadataStatus(account: AccountMetadataLike): string | null {
  if (account.exchange === ExchangeType.Hyperliquid) {
    if (isHyperliquidMetadataReady(account)) return 'Hyperliquid account metadata is ready.'
    return 'Hyperliquid account is not ready for live trading; approve the agent wallet and authorize the configured Trad builder.'
  }
  if (account.exchange !== ExchangeType.Bybit) return null
  if (isBybitMetadataVerified(account)) {
    return `Exchange metadata verified: ${account.exchange_metadata?.account_mode} / ${account.exchange_metadata?.margin_mode}`
  }
  return 'Bybit exchange metadata unvalidated; refresh credentials before live trading.'
}

export function isHyperliquidMetadataReady(
  account: AccountMetadataLike | null | undefined,
): boolean {
  if (!account || account.exchange !== ExchangeType.Hyperliquid) return true
  const meta = account.exchange_metadata
  const builderFee = hyperliquidTargetTotalTenthsBps(meta)
  const hasBuilderReadiness =
    builderFee === 0 ||
    Boolean(
      normalizeMetadataLabel(meta?.builder_address) &&
        normalizeMetadataLabel(meta?.builder_config_version) &&
        meta?.builder_approved === true &&
        meta?.builder_approval_network === account.network &&
        normalizeAddress(meta?.builder_approval_user_address) ===
          normalizeAddress(meta?.user_address) &&
        meta?.builder_approval_verified_at_ms &&
        (meta?.max_builder_fee_tenths_bps ?? 0) >= builderFee,
    )
  return Boolean(
    meta?.product === 'usdc_perp' &&
      normalizeMetadataLabel(meta?.user_address) &&
      normalizeMetadataLabel(meta?.agent_address) &&
      meta?.agent_approved === true &&
      meta?.agent_approval_verified_at_ms &&
      hasBuilderReadiness,
  )
}

function normalizeAddress(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export const HYPERLIQUID_TARGET_TOTAL_DEFAULT_TENTHS_BPS = 52
export const HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS = 52

export function hyperliquidTargetTotalTenthsBps(
  meta: ExchangeAccountMetadataLike | null | undefined,
): number {
  return meta?.builder_target_total_tenths_bps ?? HYPERLIQUID_TARGET_TOTAL_DEFAULT_TENTHS_BPS
}
