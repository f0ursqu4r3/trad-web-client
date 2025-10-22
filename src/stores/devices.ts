import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type MarketContext,
  MarketOrderStatus,
  type OrderSide,
  type PositionSide,
  type StopGuardStatus,
  type TrailingEntryLifecycle,
  type DeviceTeDeltaEvent,
  type DeviceMoDeltaEvent,
  type DeviceSgDeltaEvent,
  type DeviceSplitDeltaEvent,
  type DeviceTeDelta,
  type DeviceSplitDelta,
  type DeviceMoDelta,
  type DeviceSgDelta,
  type Market,
} from '@/lib/ws/protocol'
import { TrailingEntryPhase } from '@/lib/ws/protocol'

export const useDeviceStore = defineStore('device', () => {
  const deviceMap = ref<Record<string, Device>>({})

  const devices = computed<Device[]>(() => Object.values(deviceMap.value))
  const tePoints = computed<number[]>(() => {
    // Find the first TrailingEntry device and return its points
    const teDevice = devices.value.find((d) => d.kind === 'TrailingEntry') as
      | TrailingEntry
      | undefined
    if (!teDevice) return []
    return teDevice.points_snapshot
  })

  function handleDeviceUpdate(kind: string, event: DeviceDeltaEvent) {
    console.log('Handling device update of kind:', kind, 'with event:', event)
    switch (kind) {
      case 'DeviceTeDelta':
        applyDeviceTeDeltaEvent(event as DeviceTeDeltaEvent)
        break
      case 'DeviceSplitDelta':
        applyDeviceSplitDeltaEvent(event as DeviceSplitDeltaEvent)
        break
      case 'DeviceMoDelta':
        applyDeviceMoDeltaEvent(event as DeviceMoDeltaEvent)
        break
      case 'DeviceSgDelta':
        applyDeviceSgDeltaEvent(event as DeviceSgDeltaEvent)
        break
    }
  }

  function applyDeviceTeDeltaEvent(event: DeviceTeDeltaEvent) {
    // Implementation goes here
    const deviceId: string = event.device_id
    const delta: DeviceTeDelta = event.delta
    if (!(deviceId in deviceMap.value)) {
      deviceMap.value[deviceId] = createTrailingEntry(deviceId)
    }
    const entry = deviceMap.value[deviceId] as TrailingEntry
    switch (delta.kind) {
      case 'Init':
        entry.symbol = delta.data.symbol
        entry.market_context = delta.data.market_context
        entry.position_side = delta.data.position_side
        entry.activation_price = delta.data.activation_price
        entry.jump_frac_threshold = delta.data.jump_frac_threshold
        entry.stop_loss = delta.data.stop_loss
        entry.risk_amount = delta.data.risk_amount
        entry.phase = delta.data.phase
        entry.peak = delta.data.peak
        entry.peak_index = delta.data.peak_index
        entry.base_index = delta.data.base_index
        entry.total_points = delta.data.total_points
        entry.lifecycle = delta.data.lifecycle
        break
      case 'PointsInit':
        entry.points_snapshot = delta.data.points
        entry.base_index = delta.data.start_idx
        entry.total_points = delta.data.total_len
        break
      case 'Point':
        if (entry.points_snapshot.length == 0) {
          entry.base_index = delta.data.idx
          entry.points_snapshot.push(delta.data.price)
        } else if (delta.data.idx >= entry.base_index) {
          // ignore
        } else {
          const offset = delta.data.idx - entry.base_index
          const len = entry.points_snapshot.length
          if (offset == len) {
            entry.points_snapshot.push(delta.data.price)
          } else if (offset < len) {
            entry.points_snapshot[offset] = delta.data.price
          } else {
            entry.base_index = delta.data.idx
            entry.points_snapshot = [delta.data.price]
          }
        }
        entry.total_points = Math.max(entry.total_points, delta.data.idx + 1)
        break
      case 'Peak':
        entry.peak = delta.data.price
        break
      case 'Phase':
        switch (delta.data.to) {
          case 'Triggered':
            entry.phase = TrailingEntryPhase.Triggered
            break
          default:
            entry.phase = TrailingEntryPhase.Initial
            break
        }
        break
      case 'Lifecycle':
        entry.lifecycle = delta.data.status
        break
      case 'TrailingStop':
        // optional visual cue
        break
      case 'OrderUpdate':
        // optional order notes
        // { order_id: number; status: string; cum_qty?: number | null; price?: number | null }
        // TODO: find MO device with matching client_order_id and update its data
        break
      case 'Review':
        entry.start_trigger_index = delta.data.start_trigger_index || entry.start_trigger_index
        entry.end_trigger_index = delta.data.end_trigger_index || entry.end_trigger_index
        break
    }
  }

  function applyDeviceSplitDeltaEvent(event: DeviceSplitDeltaEvent) {
    // Implementation goes here
  }

  function applyDeviceMoDeltaEvent(event: DeviceMoDeltaEvent) {
    const deviceId: string = event.device_id
    const delta: DeviceMoDelta = event.delta
    if (!(deviceId in deviceMap.value)) {
      deviceMap.value[deviceId] = createTrailingEntry(deviceId)
    }
    const entry = deviceMap.value[deviceId] as MarketOrder
    switch (delta.kind) {
      case 'Init':
        entry.market_context = delta.data.market_context
        entry.symbol = delta.data.symbol
        entry.order_side = delta.data.order_side
        entry.position_side = delta.data.position_side
        entry.quantity = delta.data.quantity
        entry.price = delta.data.price
        entry.status = delta.data.status
        entry.client_order_id = delta.data.client_order_id
        break
      case 'Submitted':
        entry.status = MarketOrderStatus.AlreadySentAndAwaitingFilling
        break
      case 'PartiallyFilled':
        entry.status = MarketOrderStatus.PartiallyFilled
        if (delta.data.price !== undefined && delta.data.price !== null) {
          entry.price = delta.data.price
        }
        break
      case 'Filled':
        entry.status = MarketOrderStatus.Filled
        if (delta.data.price !== undefined && delta.data.price !== null) {
          entry.price = delta.data.price
        }
        break
      case 'Canceled':
        entry.status = MarketOrderStatus.Canceled
        break
      case 'Rejected':
        entry.status = MarketOrderStatus.Rejected
        break
    }
  }

  function applyDeviceSgDeltaEvent(event: DeviceSgDeltaEvent) {
    // Implementation goes here
  }

  return {
    // state
    devices,
    tePoints,
    // actions
    handleDeviceUpdate,
  }
})

export type Device = TrailingEntry | Split | MarketOrder | StopGuard
export type DeviceDeltaEvent =
  | DeviceTeDeltaEvent
  | DeviceMoDeltaEvent
  | DeviceSgDeltaEvent
  | DeviceSplitDeltaEvent

export interface TrailingEntry {
  // identity
  id: string
  kind: string

  // parameters
  symbol: string
  market_context: MarketContext
  // no order_side because a TrailingEntry is always an open order
  position_side: PositionSide
  activation_price: number
  jump_frac_threshold: number
  stop_loss: number
  risk_amount: number

  // state
  phase: TrailingEntryPhase
  peak: number
  peak_index: number

  // result
  position_size: number
  actual_activation_price: number
  buy_or_sell_price: number
  completed: boolean
  cancelled: boolean
  succeeded: boolean
  stop_loss_hit: boolean

  lifecycle: TrailingEntryLifecycle

  // review
  points_snapshot: number[]
  base_index: number // number of points discarded from the front (for absolute indexing)
  total_points: number // total points ever seen; indices are absolute in [0..total_points)
  start_trigger_index?: number
  end_trigger_index?: number
}

export interface Split {
  // identity
  id: string
  kind: string

  split_id: string // UUID as string
  symbol: string
  quantity: number
  price: number
}

export interface MarketOrder {
  // identity
  id: string
  kind: string

  market_order_id: string // UUID as string
  market_context: MarketContext
  symbol: string
  order_side: OrderSide
  quantity: number
  position_side: PositionSide
  price: number

  status: MarketOrderStatus
  remote_id?: number
  client_order_id?: string | null | undefined
  // Runtime-only fields for reconciliation and health (not persisted)
  sent_at?: Date
  last_status_check_at?: Date
  last_update_seen_at?: Date
}

export interface StopGuard {
  // identity
  id: string
  kind: string

  // Hierarchy
  parent_id: string // Parent TE device (UUID as string)
  command_id: string // UUID as string

  // Market context
  symbol: string
  market_context: MarketContext
  position_side: PositionSide
  stop_price: number
  use_mark_price: boolean

  // Coverage tracking (what we're protecting)
  covered_qty: number // Current stop order quantity
  target_coverage: number // Desired coverage based on MO fills

  // Order lifecycle
  status: StopGuardStatus
  client_order_id?: string // Format: sg{short-uuid}-v{seq}
  remote_order_id?: number // Exchange order ID
  sent_at?: Date // When order was submitted

  // Reconciliation & versioning
  topup_seq: number
  last_update_seen_at?: Date // Last WS OrderTradeUpdate
  last_status_check_at?: Date // Last REST query
  last_replacement_at?: Date // Last topup/resize
  pending_replacement_from?: string // Old client_order_id being replaced, cleared on CANCELED receipt

  created_at: Date

  // Legacy fields for backward compatibility
  target_split_id: string // Deprecated, use parent_id (UUID as string)
  desired_qty: number // Deprecated, use target_coverage
  current_stop_order_id?: number // Deprecated, use remote_order_id
  current_stop_client_id?: string // Deprecated, use client_order_id
  last_topup_time?: Date // Deprecated, use last_replacement_at
  last_reconcile_time?: Date // Deprecated, use last_status_check_at
}

function createTrailingEntry(deviceId: string): TrailingEntry {
  return {
    id: deviceId,
    kind: 'TrailingEntry',
    symbol: '',
    market_context: {} as MarketContext,
    position_side: {} as PositionSide,
    activation_price: 0,
    jump_frac_threshold: 0,
    stop_loss: 0,
    risk_amount: 0,
    phase: {} as TrailingEntryPhase,
    peak: 0,
    peak_index: 0,
    position_size: 0,
    actual_activation_price: 0,
    buy_or_sell_price: 0,
    completed: false,
    cancelled: false,
    succeeded: false,
    stop_loss_hit: false,
    lifecycle: {} as TrailingEntryLifecycle,
    points: [],
    base_index: 0,
    total_points: 0,
    start_trigger_index: undefined,
    end_trigger_index: undefined,
  }
}

function createSplit(deviceId: string): Split {
  return {
    id: deviceId,
    kind: 'Split',
    split_id: '',
    symbol: '',
    quantity: 0,
    price: 0,
  }
}

function createMarketOrder(deviceId: string): MarketOrder {
  return {
    id: deviceId,
    kind: 'MarketOrder',
    market_order_id: '',
    market_context: {} as MarketContext,
    symbol: '',
    order_side: {} as OrderSide,
    quantity: 0,
    position_side: {} as PositionSide,
    price: 0,
    status: {} as MarketOrderStatus,
    remote_id: undefined,
    client_order_id: undefined,
    sent_at: undefined,
    last_status_check_at: undefined,
    last_update_seen_at: undefined,
  }
}

function createStopGuard(deviceId: string): StopGuard {
  return {
    id: deviceId,
    kind: 'StopGuard',
    parent_id: '',
    command_id: '',
    symbol: '',
    market_context: {} as MarketContext,
    position_side: {} as PositionSide,
    stop_price: 0,
    use_mark_price: false,
    covered_qty: 0,
    target_coverage: 0,
    status: {} as StopGuardStatus,
    client_order_id: undefined,
    remote_order_id: undefined,
    sent_at: undefined,
    topup_seq: 0,
    last_update_seen_at: undefined,
    last_status_check_at: undefined,
    last_replacement_at: undefined,
    pending_replacement_from: undefined,
    created_at: new Date(),
    target_split_id: '',
    desired_qty: 0,
    current_stop_order_id: undefined,
    current_stop_client_id: undefined,
    last_topup_time: undefined,
    last_reconcile_time: undefined,
  }
}
