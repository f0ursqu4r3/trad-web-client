import type { BrowserAccountSnapshot } from '../gateway/index.ts'
import { lifecycleActions, type LifecycleAction } from '../engineCommands/lifecycle.ts'
import { nodeKey } from './index.ts'
import { projectionEntities } from './presentation.ts'
import { activeCloseWorkflowsForTrade } from './tradeWorkspaceClose.ts'
import type { ManagedTradeView } from './tradeWorkspaceTypes.ts'

export interface ManagedTradeActionSet {
  all: LifecycleAction[]
  close: LifecycleAction | null
  takeover: LifecycleAction | null
  secondary: LifecycleAction[]
}

export function managedTradeActions(
  trade: ManagedTradeView,
  snapshot: BrowserAccountSnapshot,
): ManagedTradeActionSet {
  const primary = projectionEntities(snapshot).get(nodeKey(trade.primaryCommand.root))
  const all = primary === undefined ? [] : lifecycleActions(primary, snapshot, snapshot.positions)
  const closeOwned = activeCloseWorkflowsForTrade(trade, snapshot).length > 0
  return {
    all,
    close: closeOwned ? null : (all.find((action) => action.kind === 'close_exposure') ?? null),
    takeover: all.find((action) => action.kind === 'take_over_exposure') ?? null,
    secondary: all.filter(
      (action) => action.kind !== 'close_exposure' && action.kind !== 'take_over_exposure',
    ),
  }
}
