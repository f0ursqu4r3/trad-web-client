import type { ExchangeType } from './ws/protocol.ts'

// Paused exchanges remain part of the protocol and existing-account views. This
// list controls only which adapters accept new account setup in the current app.
const ENABLED_ACCOUNT_CREATION_EXCHANGES: readonly ExchangeType[] = [
  'bifake' as ExchangeType,
  'hyperliquid' as ExchangeType,
]

// The mocked browser harness retains adapter setup coverage without exposing
// paused exchanges in a production build or reaching a real Gateway.
const E2E_ACCOUNT_CREATION_EXCHANGES: readonly ExchangeType[] = [
  'binance' as ExchangeType,
  'bifake' as ExchangeType,
  'bybit' as ExchangeType,
  'hyperliquid' as ExchangeType,
]

export const ACCOUNT_CREATION_EXCHANGES: readonly ExchangeType[] =
  import.meta.env?.VITE_E2E === '1'
    ? E2E_ACCOUNT_CREATION_EXCHANGES
    : ENABLED_ACCOUNT_CREATION_EXCHANGES

export const DEFAULT_ACCOUNT_CREATION_EXCHANGE = 'hyperliquid' as ExchangeType
