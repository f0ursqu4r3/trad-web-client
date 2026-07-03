import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import type { AccountFormPayload } from '@/stores/accounts'

export interface AccountFormInput {
  label: string
  key: string
  secret: string
  network: NetworkType
  exchange: ExchangeType
}

export function buildAccountFormPayload(input: AccountFormInput): AccountFormPayload {
  return {
    label: input.label.trim(),
    key: input.key.trim(),
    secret: input.secret.trim(),
    network: input.network.toLowerCase() as NetworkType,
    exchange: input.exchange.toLowerCase() as ExchangeType,
  }
}
