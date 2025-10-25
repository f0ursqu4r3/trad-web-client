import type { PositionSide } from '@/lib/ws/protocol'

export type TrailingEntryPrefill = {
  activation_price?: number
  jump_frac_threshold?: number
  position_side?: PositionSide
  risk_amount?: number
  selectedAccountId?: string
  stop_loss?: number
  symbol?: string
}
