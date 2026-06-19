import type { CommandMeta } from '@/components/terminal/commands/commandRegistry'
import type { MarketCapabilitiesData } from '@/lib/ws/protocol'

const CAPABILITY_GATED_COMMANDS: ReadonlySet<CommandMeta['kind']> = new Set([
  'MarketOrder',
  'LimitOrder',
  'TrailingEntryOrder',
])

function unavailable(
  command: CommandMeta,
  description = 'Unavailable for selected market',
): CommandMeta {
  return {
    ...command,
    disabled: true,
    description,
  }
}

export function commandWithMarketAvailability(
  command: CommandMeta,
  capabilities: MarketCapabilitiesData | null | undefined,
  options: { capabilitiesPending?: boolean } = {},
): CommandMeta {
  if (command.disabled) return command
  if (!capabilities) {
    return options.capabilitiesPending && CAPABILITY_GATED_COMMANDS.has(command.kind)
      ? unavailable(command, 'Checking selected market capabilities')
      : command
  }

  switch (command.kind) {
    case 'MarketOrder':
      return capabilities.supports_market_orders ? command : unavailable(command)
    case 'LimitOrder':
      return capabilities.supports_limit_orders ? command : unavailable(command)
    case 'TrailingEntryOrder':
      return capabilities.supports_trailing_entry ? command : unavailable(command)
    default:
      return command
  }
}
