import type { BrowserAccountSnapshot, CloseWorkflowProjection } from '../gateway/index.ts'
import type { ManagedTradeView } from './tradeWorkspaceTypes.ts'
import { terminalLifecycle } from './tradeWorkspaceValues.ts'

export function activeCloseWorkflowsForTrade(
  trade: ManagedTradeView,
  snapshot: BrowserAccountSnapshot,
): CloseWorkflowProjection[] {
  return snapshot.close_workflows
    .filter(
      (workflow) =>
        !terminalLifecycle(workflow.lifecycle) &&
        workflow.requested_reductions.some((row) => row.scope_id === trade.scopeId),
    )
    .sort(
      (left, right) =>
        right.created_at - left.created_at ||
        left.close_workflow_id.localeCompare(right.close_workflow_id),
    )
}
