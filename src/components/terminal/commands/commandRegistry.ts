import { ExchangeType, type UserCommandPayload } from '@/lib/ws/protocol'

export interface CommandMeta {
  kind: UserCommandPayload['kind']
  label: string
  description?: string
  aliases?: string[]
  modal?: boolean
  disabled?: boolean
  exchange?: ExchangeType
}

// Central list of user commands; add remaining kinds iteratively.
export const commandRegistry: CommandMeta[] = [
  {
    kind: 'MarketOrder',
    label: 'Market Order',
    description: 'Submit a market order',
    aliases: ['mo'],
    modal: true,
  },
  {
    kind: 'LimitOrder',
    label: 'Limit Order',
    description: 'Place a limit order',
    aliases: ['lo'],
    modal: true,
  },
  {
    kind: 'ChaseOrder',
    label: 'Chase Order',
    description: 'Follow the same-side top of book with a post-only order',
    aliases: ['chase'],
    modal: true,
  },
  {
    kind: 'TrailingEntryOrder',
    label: 'Trailing Entry',
    description: 'Create trailing entry device',
    aliases: ['te'],
    modal: true,
  },
  {
    kind: 'CancelAllDevicesCommand',
    label: 'Cancel All Entry Work',
    description: 'Cancel pending entries while preserving positions, protection, and closes',
    aliases: ['ca'],
    modal: true,
  },
  {
    kind: 'FlattenHyperliquidSymbol',
    label: 'Flatten Position',
    description: 'Close one or all authoritative Hyperliquid positions reduce-only',
    aliases: ['fp', 'fl'],
    modal: true,
    exchange: ExchangeType.Hyperliquid,
  },
]
