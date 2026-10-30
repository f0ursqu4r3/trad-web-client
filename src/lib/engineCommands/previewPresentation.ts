import type { PreviewPlanningRejectionCode } from '@/lib/gateway'

export const PREVIEW_EDITING_SETTLE_MS = 1_200

export function isEditingBarrier(code: PreviewPlanningRejectionCode | undefined): boolean {
  return (
    code === 'wrong_side_stop' ||
    code === 'wrong_side_take_profit' ||
    code === 'missing_stop_for_risk_sizing' ||
    code === 'zero_entry_stop_distance' ||
    code === 'below_minimum_order' ||
    code === 'above_maximum_order' ||
    code === 'invalid_price_precision' ||
    code === 'invalid_intent' ||
    code === 'limit_price_out_of_band'
  )
}

export function editingGuidance(code: PreviewPlanningRejectionCode | undefined): string {
  switch (code) {
    case 'wrong_side_stop':
      return 'Finish entering a stop-loss price on the loss side of the entry.'
    case 'wrong_side_take_profit':
      return 'Finish entering a take-profit price on the profit side of the entry.'
    case 'missing_stop_for_risk_sizing':
      return 'Enter a stop-loss price to calculate risk-sized quantity.'
    case 'zero_entry_stop_distance':
      return 'Finish entering a stop-loss price different from the entry.'
    case 'below_minimum_order':
      return 'Finish entering an order size above the exchange minimum.'
    case 'above_maximum_order':
      return 'Finish entering an order size within the exchange maximum.'
    case 'invalid_price_precision':
      return 'Finish entering a price accepted by the exchange precision rules.'
    case 'invalid_intent':
      return 'Finish entering the order details.'
    case 'limit_price_out_of_band':
      return 'Enter a limit price near the live market price.'
    default:
      return 'Checking order details…'
  }
}
