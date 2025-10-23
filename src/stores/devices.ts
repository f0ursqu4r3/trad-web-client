import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  MarketOrderStatus,
  OrderSide,
  PositionSide,
  StopGuardStatus,
  TrailingEntryLifecycle,
  TrailingEntryPhase,
  type DeviceMoDelta,
  type DeviceMoDeltaEvent,
  type DeviceSgDelta,
  type DeviceSgDeltaEvent,
  type DeviceSplitDelta,
  type DeviceSplitDeltaEvent,
  type DeviceTeDelta,
  type DeviceTeDeltaEvent,
  type MarketContext,
} from '@/lib/ws/protocol'

export const useDeviceStore = defineStore('device', () => {
  const deviceMap = ref<Record<string, Device>>({})

  const devices = computed<Device[]>(() => Object.values(deviceMap.value))
  const selectedDeviceId = ref<string | null>(null)
  const selectedDevice = computed<Device | null>(() => {
    if (!selectedDeviceId.value) return null
    return deviceMap.value[selectedDeviceId.value] || null
  })

  const tePoints = computed<number[]>(() => {
    // Find the first TrailingEntry device and return its points
    const teDevice = devices.value.find((d) => d.kind === 'TrailingEntry') as Device | undefined
    if (!teDevice) return []
    return (teDevice.state as TrailingEntry).points_snapshot
  })

  function inspectDevice(deviceId: string) {
    selectedDeviceId.value = deviceId
  }

  function ensureDeviceRecord(deviceId: string, kind: string, command_id: string | null): Device {
    if (!(deviceId in deviceMap.value)) {
      const new_device = newDevice(deviceId, kind, command_id)
      deviceMap.value[deviceId] = new_device
    }
    return deviceMap.value[deviceId]
  }

  function addDeviceChild(parentId: string, childId: string) {
    const parentDevice = deviceMap.value[parentId]
    const childDevice = deviceMap.value[childId]
    if (parentDevice && childDevice) {
      if (!parentDevice.children_devices.includes(childId)) {
        parentDevice.children_devices.push(childId)
      }
      childDevice.parent_device = parentId
    }
  }

  function handleDeviceUpdate(kind: string, event: DeviceDeltaEvent) {
    console.log('Handling device update of kind:', kind, 'with event:', event)
    let commandId = null
    if (event.delta.kind === 'Init') {
      commandId = event.delta.data.command_id || null
    }
    const device = ensureDeviceRecord(event.device_id, kind, commandId)
    switch (kind) {
      case 'DeviceTeDelta':
        applyDeviceTeDeltaEvent(device, event as DeviceTeDeltaEvent)
        break
      case 'DeviceSplitDelta':
        applyDeviceSplitDeltaEvent(device, event as DeviceSplitDeltaEvent)
        break
      case 'DeviceMoDelta':
        applyDeviceMoDeltaEvent(device, event as DeviceMoDeltaEvent)
        break
      case 'DeviceSgDelta':
        applyDeviceSgDeltaEvent(device, event as DeviceSgDeltaEvent)
        break
    }
  }

  function applyDeviceTeDeltaEvent(device: Device, event: DeviceTeDeltaEvent) {
    // Implementation goes here
    const te = device.state as TrailingEntry
    const delta: DeviceTeDelta = event.delta
    switch (delta.kind) {
      case 'Init':
        {
          const {
            symbol,
            market_context,
            position_side,
            activation_price,
            jump_frac_threshold,
            stop_loss,
            risk_amount,
            phase,
            peak,
            peak_index,
            base_index,
            total_points,
            lifecycle,
          } = delta.data
          te.symbol = symbol
          te.market_context = market_context
          te.position_side = position_side
          te.activation_price = activation_price
          te.jump_frac_threshold = jump_frac_threshold
          te.stop_loss = stop_loss
          te.risk_amount = risk_amount
          te.phase = phase
          te.peak = peak
          te.peak_index = peak_index
          te.base_index = base_index
          te.total_points = total_points
          te.lifecycle = lifecycle
        }
        break
      case 'PointsInit':
        {
          const { points, start_idx, total_len } = delta.data
          te.points_snapshot = points
          te.base_index = start_idx
          te.total_points = total_len
        }
        break
      case 'Point':
        {
          const { idx, price } = delta.data
          if (te.points_snapshot.length == 0) {
            te.base_index = idx
            te.points_snapshot.push(price)
          } else if (idx >= te.base_index) {
            // ignore
          } else {
            const offset = idx - te.base_index
            const len = te.points_snapshot.length
            if (offset == len) {
              te.points_snapshot.push(price)
            } else if (offset < len) {
              te.points_snapshot[offset] = price
            } else {
              te.base_index = idx
              te.points_snapshot = [price]
            }
          }
          te.total_points = Math.max(te.total_points, idx + 1)
        }
        break
      case 'Peak':
        {
          const { price } = delta.data
          te.peak = price
        }
        break
      case 'Phase':
        {
          const { to } = delta.data
          switch (to) {
            case 'Triggered':
              te.phase = TrailingEntryPhase.Triggered
              break
            default:
              te.phase = TrailingEntryPhase.Initial
              break
          }
        }
        break
      case 'Lifecycle':
        {
          const { status } = delta.data
          te.lifecycle = status
        }
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
        {
          const { start_trigger_index, end_trigger_index } = delta.data
          te.start_trigger_index = start_trigger_index || te.start_trigger_index
          te.end_trigger_index = end_trigger_index || te.end_trigger_index
        }
        break
    }
  }

  function applyDeviceMoDeltaEvent(device: Device, event: DeviceMoDeltaEvent) {
    const mo = device.state as MarketOrderState
    const delta: DeviceMoDelta = event.delta
    switch (delta.kind) {
      case 'Init':
        {
          const {
            market_context,
            symbol,
            order_side,
            position_side,
            quantity,
            price,
            status,
            client_order_id,
            parent_device,
          } = delta.data
          mo.market_context = market_context
          mo.symbol = symbol
          mo.order_side = order_side
          mo.position_side = position_side
          mo.quantity = quantity
          mo.price = price
          mo.status = status
          mo.client_order_id = client_order_id || null
          if (parent_device) {
            addDeviceChild(parent_device, device.id)
          }
        }
        break
      case 'Submitted':
        {
          mo.status = MarketOrderStatus.AlreadySentAndAwaitingFilling
        }
        break
      case 'PartiallyFilled':
        {
          const { price } = delta.data
          mo.status = MarketOrderStatus.PartiallyFilled
          if (price !== undefined && price !== null) {
            mo.price = price
          }
        }
        break
      case 'Filled':
        {
          const { price } = delta.data
          mo.status = MarketOrderStatus.Filled
          if (price !== undefined && price !== null) {
            mo.price = price
          }
        }
        break
      case 'Canceled':
        {
          mo.status = MarketOrderStatus.Canceled
          device.failure_reason = null
        }
        break
      case 'Rejected':
        {
          const { reason } = delta.data
          mo.status = MarketOrderStatus.Rejected
          device.failure_reason = reason || null
        }
        break
    }
  }

  function applyDeviceSgDeltaEvent(device: Device, event: DeviceSgDeltaEvent) {
    const sg = device.state as StopGuardState
    const delta: DeviceSgDelta = event.delta
    switch (delta.kind) {
      case 'Init':
        {
          const {
            client_order_id,
            covered_qty,
            last_replacement_at,
            last_status_check_at,
            last_update_seen_at,
            market_context,
            position_side,
            remote_order_id,
            sent_at,
            status,
            stop_price,
            symbol,
            target_coverage,
            topup_seq,
            parent_device,
          } = delta.data
          sg.symbol = symbol
          sg.market_context = market_context
          sg.position_side = position_side
          sg.stop_price = stop_price
          sg.covered_qty = covered_qty
          sg.target_coverage = target_coverage
          sg.desired_qty = target_coverage
          sg.client_order_id = client_order_id
          sg.current_stop_client_id = client_order_id
          sg.remote_order_id = remote_order_id
          sg.current_stop_order_id = remote_order_id
          sg.topup_seq = topup_seq
          sg.sent_at = sent_at ? new Date(sent_at) : undefined
          sg.last_update_seen_at = last_update_seen_at ? new Date(last_update_seen_at) : undefined
          sg.last_status_check_at = last_status_check_at
            ? new Date(last_status_check_at)
            : undefined
          sg.last_replacement_at = last_replacement_at ? new Date(last_replacement_at) : undefined
          sg.last_reconcile_time = last_status_check_at ? new Date(last_status_check_at) : undefined
          sg.last_topup_time = last_replacement_at ? new Date(last_replacement_at) : undefined
          sg.status = status
          if (parent_device) {
            addDeviceChild(parent_device, device.id)
          }
        }
        break
      case 'Submitted':
        {
          const { order_id, quantity, topup_seq } = delta.data
          sg.client_order_id = order_id
          sg.current_stop_client_id = order_id
          sg.covered_qty = quantity
          sg.target_coverage = quantity
          sg.desired_qty = quantity
          sg.topup_seq = topup_seq
          sg.sent_at = event.ts ? new Date(event.ts) : undefined
          sg.status = StopGuardStatus.Working
        }
        break
      case 'Replaced':
        {
          const { new_order_id, new_quantity, topup_seq } = delta.data
          sg.client_order_id = new_order_id
          sg.current_stop_client_id = new_order_id
          sg.covered_qty = new_quantity
          sg.target_coverage = new_quantity
          sg.desired_qty = new_quantity
          sg.topup_seq = topup_seq
          sg.last_replacement_at = event.ts ? new Date(event.ts) : undefined
          sg.last_topup_time = event.ts ? new Date(event.ts) : undefined
          sg.status = StopGuardStatus.Working
        }
        break
      case 'PartiallyFilled':
        {
          sg.status = StopGuardStatus.Triggered
          sg.last_update_seen_at = event.ts ? new Date(event.ts) : undefined
        }
        break
      case 'Filled':
        {
          sg.status = StopGuardStatus.Flat
          sg.covered_qty = 0
          sg.last_update_seen_at = event.ts ? new Date(event.ts) : undefined
        }
        break
      case 'Canceled':
        {
          sg.status = StopGuardStatus.Canceled
          sg.last_update_seen_at = event.ts ? new Date(event.ts) : undefined
        }
        break
      case 'Rejected':
        {
          const { reason } = delta.data
          sg.status = StopGuardStatus.Rejected
          sg.last_update_seen_at = event.ts ? new Date(event.ts) : undefined
          device.failure_reason = reason || null
        }
        break
      case 'Threshold':
        {
          // not implemented
        }
        break
      case 'Triggered':
        {
          // not implemented
        }
        break
      case 'OrderUpdate':
        {
          // not implemented
        }
        break
      case 'Coverage':
        {
          const { covered_qty, target_coverage, topup_seq } = delta.data
          sg.covered_qty = covered_qty
          sg.target_coverage = target_coverage
          sg.desired_qty = target_coverage
          sg.topup_seq = topup_seq
        }
        break
    }
  }

  function applyDeviceSplitDeltaEvent(_device: Device, _event: DeviceSplitDeltaEvent) {
    // TODO: implement handling once split deltas are defined
  }

  return {
    // state
    devices,
    tePoints,
    selectedDeviceId,
    selectedDevice,
    // actions
    handleDeviceUpdate,
    inspectDevice,
  }
})

export interface Device {
  id: string
  kind: string
  associated_command_id: string

  parent_device: string | null
  children_devices: string[]
  complete: boolean
  failed: boolean
  canceled: boolean
  awaiting_children: boolean
  failure_reason: string | null

  state: DeviceState
}

export type DeviceState = TrailingEntry | SplitState | MarketOrderState | StopGuardState

export type DeviceDeltaEvent =
  | DeviceTeDeltaEvent
  | DeviceMoDeltaEvent
  | DeviceSgDeltaEvent
  | DeviceSplitDeltaEvent

export type DeviceDelta = DeviceTeDelta | DeviceSplitDelta | DeviceMoDelta | DeviceSgDelta

export interface TrailingEntry {
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
  start_trigger_index: number | null
  end_trigger_index: number | null
}

export interface SplitState {
  symbol: string
  quantity: number
  price: number
}

export interface MarketOrderState {
  market_context: MarketContext
  symbol: string
  order_side: OrderSide
  quantity: number
  position_side: PositionSide
  price: number

  status: MarketOrderStatus
  remote_id: number | null
  client_order_id: string | null
  // Runtime-only fields for reconciliation and health (not persisted)
  sent_at: Date | null
  last_status_check_at: Date | null
  last_update_seen_at: Date | null
}

export interface StopGuardState {
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
  client_order_id?: string | null | undefined // Format: sg{short-uuid}-v{seq}
  remote_order_id?: number | null | undefined // Exchange order ID
  sent_at?: Date | null | undefined // When order was submitted

  // Reconciliation & versioning
  topup_seq: number
  last_update_seen_at?: Date | null | undefined // Last WS OrderTradeUpdate
  last_status_check_at?: Date | null | undefined // Last REST query
  last_replacement_at?: Date | null | undefined // Last topup/resize
  pending_replacement_from?: string | null | undefined // Old client_order_id being replaced, cleared on CANCELED receipt

  created_at: Date

  // Legacy fields for backward compatibility
  target_split_id: string // Deprecated, use parent_id (UUID as string)
  desired_qty: number // Deprecated, use target_coverage
  current_stop_order_id?: number | null | undefined // Deprecated, use remote_order_id
  current_stop_client_id?: string | null | undefined // Deprecated, use client_order_id
  last_topup_time?: Date | null | undefined // Deprecated, use last_replacement_at
  last_reconcile_time?: Date | null | undefined // Deprecated, use last_status_check_at
}

function newDevice(deviceId: string, kind: string, command_id: string | null): Device {
  if (command_id === null) {
    throw new Error(`Cannot create device without associated command_id`)
  }
  const mappedKind =
    {
      DeviceTeDelta: 'TrailingEntry',
      DeviceMoDelta: 'MarketOrder',
      DeviceSgDelta: 'StopGuard',
      DeviceSplitDelta: 'Split',
    }[kind] || kind
  const state = (() => {
    switch (mappedKind || kind) {
      case 'TrailingEntry':
        return newTrailingEntryState()
      case 'Split':
        return newSplitSate()
      case 'MarketOrder':
        return newMarketOrderState()
      case 'StopGuard':
        return newStopGuardState()
      default:
        throw new Error(`Unknown device kind: ${kind}`)
    }
  })()
  return {
    id: deviceId,
    kind: mappedKind,
    associated_command_id: command_id,
    parent_device: null,
    children_devices: [],
    complete: false,
    failed: false,
    canceled: false,
    awaiting_children: false,
    failure_reason: null,
    state,
  } as Device
}

function newTrailingEntryState(): TrailingEntry {
  return {
    symbol: '',
    market_context: { type: 'none' } as MarketContext,
    position_side: PositionSide.Long,
    activation_price: 0,
    jump_frac_threshold: 0,
    stop_loss: 0,
    risk_amount: 0,
    phase: TrailingEntryPhase.Initial,
    peak: 0,
    peak_index: 0,
    position_size: 0,
    actual_activation_price: 0,
    buy_or_sell_price: 0,
    completed: false,
    cancelled: false,
    succeeded: false,
    stop_loss_hit: false,
    points_snapshot: [],
    base_index: 0,
    total_points: 0,
    start_trigger_index: null,
    end_trigger_index: null,
    lifecycle: TrailingEntryLifecycle.Running,
  }
}

function newMarketOrderState(): MarketOrderState {
  return {
    market_context: { type: 'none' } as MarketContext,
    symbol: '',
    order_side: OrderSide.Buy,
    quantity: 0,
    position_side: PositionSide.Long,
    price: 0,
    status: MarketOrderStatus.NotYetSent,
    remote_id: null,
    client_order_id: null,
    sent_at: null,
    last_status_check_at: null,
    last_update_seen_at: null,
  }
}

function newSplitSate(): SplitState {
  return {
    symbol: '',
    quantity: 0,
    price: 0,
  }
}

function newStopGuardState(): StopGuardState {
  return {
    symbol: '',
    market_context: { type: 'none' } as MarketContext,
    position_side: PositionSide.Long,
    stop_price: 0,
    use_mark_price: false,
    covered_qty: 0,
    target_coverage: 0,
    status: StopGuardStatus.Working,
    client_order_id: null,
    remote_order_id: null,
    sent_at: null,
    topup_seq: 0,
    last_update_seen_at: null,
    last_status_check_at: null,
    last_replacement_at: null,
    pending_replacement_from: null,
    created_at: new Date(),
    target_split_id: '',
    desired_qty: 0,
    current_stop_order_id: null,
    current_stop_client_id: null,
    last_topup_time: null,
    last_reconcile_time: null,
  }
}
