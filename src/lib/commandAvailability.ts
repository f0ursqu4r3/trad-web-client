import type { CommandMeta } from '@/components/terminal/commands/commandRegistry'
import type { MarketCapabilitiesData } from '@/lib/ws/protocol'

export function commandWithMarketAvailability(
  command: CommandMeta,
  capabilities: MarketCapabilitiesData | null | undefined,
): CommandMeta {
  if (command.disabled || !capabilities) return command

  switch (command.kind) {
    case 'MarketOrder':
      return capabilities.supports_market_orders
        ? command
        : {
            ...command,
            disabled: true,
            description: 'Unavailable for selected market',
          }
    case 'LimitOrder':
      return capabilities.supports_limit_orders
        ? command
        : {
            ...command,
            disabled: true,
            description: 'Unavailable for selected market',
          }
    case 'TrailingEntryOrder':
      return capabilities.supports_trailing_entry
        ? command
        : {
            ...command,
            disabled: true,
            description: 'Unavailable for selected market',
          }
    default:
      return command
  }
}
