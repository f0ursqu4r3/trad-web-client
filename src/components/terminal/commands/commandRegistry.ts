import type { UserCommandPayload } from '@/lib/ws/protocol'

export interface CommandMeta {
  kind: UserCommandPayload['kind']
  label: string
  description?: string
  modal?: boolean
}

// Central list of user commands; add remaining kinds iteratively.
export const commandRegistry: CommandMeta[] = [
  { kind: 'MarketOrder', label: 'Market Order', description: 'Submit a market order', modal: true },
  { kind: 'LimitOrder', label: 'Limit Order', description: 'Place a limit order', modal: true },
  {
    kind: 'SplitMarketOrder',
    label: 'Split Market Order',
    description: 'Split market order into parts',
    modal: true,
  },
  {
    kind: 'TrailingEntryOrder',
    label: 'Trailing Entry',
    description: 'Create trailing entry device',
    modal: true,
  },
  {
    kind: 'ControlSimMarket',
    label: 'Control Sim Market',
    description: 'Control / adjust sim market',
    modal: true,
  },
  // Non-modal quick commands below
  { kind: 'GetBalance', label: 'Get Balance' },
  { kind: 'ListDevices', label: 'List Devices' },
  { kind: 'ListPositions', label: 'List Positions' },
  { kind: 'CancelAllDevicesCommand', label: 'Cancel All Devices' },
  { kind: 'GetUserInfo', label: 'Get User Info' },
]
