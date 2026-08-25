export interface PreviewRejectionRemediation {
  title: string
  description: string
  actionLabel: string
  actionPath: string
}

const BUILDER_APPROVAL_REASON = 'hyperliquid builder approval does not cover this account policy'

// Turn known planner barriers into the next user action. Preserve unknown reasons verbatim.
export function previewRejectionRemediation(
  reason: string,
  accountId: string,
): PreviewRejectionRemediation | null {
  if (!reason.toLowerCase().includes(BUILDER_APPROVAL_REASON) || accountId === '') return null
  return {
    title: 'Builder approval required',
    description:
      'Complete the one-time wallet approval for this account. Your configured fee will not change.',
    actionLabel: 'Authorize builder →',
    actionPath: `/settings/accounts/${encodeURIComponent(accountId)}/setup`,
  }
}
