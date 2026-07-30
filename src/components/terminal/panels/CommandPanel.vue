<script setup lang="ts">
import { ref, computed, type Component, nextTick } from 'vue'
import SplitView from '@/components/general/SplitView.vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'
import { useWsStore } from '@/stores/ws'
import { useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'
import { useUiStore } from '@/stores/ui'
import { useDeviceStore, type NativeProtectionState } from '@/stores/devices'
import { formatName } from '@/lib/utils'
import { marketProductLabel } from '@/lib/marketContext'

import type {
  LimitOrderPrefill,
  ChaseOrderPrefill,
  MarketOrderPrefill,
  TrailingEntryPrefill,
} from '../modals/commands/types'
import {
  TrailingEntryLifecycle,
  TrailingEntryPhase,
  type DeviceSnapshotLiteData,
  type MarketContext,
  type PositionSide,
  type TrailingEntrySnapshot,
  type UserCommandPayload,
} from '@/lib/ws/protocol'
import { interestingCommandKinds } from '@/stores/command'

import CommandHistoryItem from '@/components/terminal/commands/CommandHistoryItem.vue'
import CommandBase from '../commands/CommandBase.vue'
import TELongCommand from '@/components/terminal/commands/TELongCommand.vue'
import MarketOrderCommand from '@/components/terminal/commands/MarketOrderCommand.vue'
import LimitOrderCommand from '@/components/terminal/commands/LimitOrderCommand.vue'
import ChaseOrderCommand from '@/components/terminal/commands/ChaseOrderCommand.vue'
import SetHedgeModeCommand from '@/components/terminal/commands/SetHedgeModeCommand.vue'
import SetLeverageCommand from '@/components/terminal/commands/SetLeverageCommand.vue'
import { marketContextAccountId, normalizeMarketContext } from '@/lib/marketContext'
import { NativeProtectionStatus } from '@/lib/ws/protocol'
import EditHyperliquidProtectionModal from '@/components/terminal/modals/EditHyperliquidProtectionModal.vue'
import PartialHyperliquidCommandCloseModal from '@/components/terminal/modals/PartialHyperliquidCommandCloseModal.vue'
import ActionConfirmationModal from '@/components/terminal/modals/ActionConfirmationModal.vue'
import EditTrailingEntryModal from '@/components/terminal/modals/EditTrailingEntryModal.vue'

defineOptions({
  inheritAttrs: false,
})

const commandStore = useCommandStore()
const wsStore = useWsStore()
const accountsStore = useAccountsStore()
const modalStore = useModalStore()
const uiStore = useUiStore()
const deviceStore = useDeviceStore()
const editProtectionDevice = ref<{ id: string; state: NativeProtectionState } | null>(null)
const editProtectionState = computed(
  () => editProtectionDevice.value?.state as NativeProtectionState | undefined,
)
const partialCloseData = ref<{
  commandId: string
  symbol: string
  marketContext: MarketContext
  positionSide: PositionSide
  ownedQuantity: number
  protectionCount: number
} | null>(null)
const confirmation = ref<{
  title: string
  message: string
  confirmLabel: string
  rememberLabel?: string
  disableFutureConfirmation?: boolean
  action: () => void
} | null>(null)
const editTeTarget = ref<{ deviceId: string; snapshot: TrailingEntrySnapshot } | null>(null)

const showFilters = ref(false)

function toggleFilters() {
  showFilters.value = !showFilters.value
}

defineExpose({
  showFilters,
  toggleFilters,
  hiddenCommandCount: computed(
    () => commandStore.commands.length - commandStore.filteredCommands.length,
  ),
  shownCommandCount: computed(() => commandStore.filteredCommands.length),
})

const hiddenCommandCount = computed(
  () => commandStore.commands.length - commandStore.filteredCommands.length,
)

const pinnedCommands = computed(() => {
  return commandStore.filteredCommands.filter(
    (cmd) => commandStore.commandMeta?.[cmd.command_id]?.pinned,
  )
})

const unpinnedCommands = computed(() => {
  return commandStore.filteredCommands.filter(
    (cmd) => !commandStore.commandMeta?.[cmd.command_id]?.pinned,
  )
})

const statusOptions = ['Running', 'Completed', 'Failed', 'Canceled'] as const
const positionOptions = ['Open', 'Closed', 'Dusted'] as const
const timeOptions = [
  { label: 'Any', value: 'Any' },
  { label: '12h', value: '12h' },
  { label: 'Day', value: 'Day' },
  { label: 'Week', value: 'Week' },
  { label: 'Month', value: 'Month' },
] as const

type MultiFilterGroup =
  | 'kind'
  | 'status'
  | 'position'
  | 'exchange'
  | 'product'
  | 'account'
  | 'symbol'

function getMultiFilter(group: MultiFilterGroup): readonly string[] {
  switch (group) {
    case 'kind':
      return commandStore.commandFilters.kind
    case 'status':
      return commandStore.commandFilters.status
    case 'position':
      return commandStore.commandFilters.position
    case 'exchange':
      return commandStore.commandFilters.exchange
    case 'product':
      return commandStore.commandFilters.product
    case 'account':
      return commandStore.commandFilters.account
    case 'symbol':
      return commandStore.commandFilters.symbol ?? []
  }
}

function setMultiFilter(group: MultiFilterGroup, values: string[]) {
  switch (group) {
    case 'kind':
      commandStore.commandFilters.kind = values
      return
    case 'status':
      commandStore.commandFilters.status = values as typeof commandStore.commandFilters.status
      return
    case 'position':
      commandStore.commandFilters.position = values as typeof commandStore.commandFilters.position
      return
    case 'exchange':
      commandStore.commandFilters.exchange = values
      return
    case 'product':
      commandStore.commandFilters.product = values
      return
    case 'account':
      commandStore.commandFilters.account = values
      return
    case 'symbol':
      commandStore.commandFilters.symbol = values
      return
  }
}

function toggleMultiFilter(group: MultiFilterGroup, option: string, event?: MouseEvent) {
  const list = getMultiFilter(group)
  const has = list.includes(option as never)
  if (event?.shiftKey) {
    setMultiFilter(group, [option])
    commandStore.commandFilters.solo[group] = true
    return
  }
  if (has) {
    setMultiFilter(
      group,
      list.filter((item) => item !== option),
    )
  } else {
    setMultiFilter(group, [...list, option])
  }
  if (getMultiFilter(group).length !== 1) {
    commandStore.commandFilters.solo[group] = false
  }
}

function isFilterActive(group: MultiFilterGroup, option: string) {
  return getMultiFilter(group).includes(option)
}

function isSoloActive(group: MultiFilterGroup, option: string) {
  return commandStore.commandFilters.solo[group] && isFilterActive(group, option)
}

function setTimeRange(value: string) {
  commandStore.commandFilters.timeRange = value as any
}

function getCommandComponent(command: UserCommandPayload): Component | string {
  switch (command.kind) {
    case 'LimitOrder':
      return LimitOrderCommand
    case 'ChaseOrder':
      return ChaseOrderCommand
    case 'MarketOrder':
      return MarketOrderCommand
    case 'SetHedgeMode':
      return SetHedgeModeCommand
    case 'SetLeverage':
      return SetLeverageCommand
    case 'TrailingEntryOrder':
      return TELongCommand
    default:
      return 'div'
  }
}

function getCommandLabel(command: UserCommandPayload): string {
  if (command.kind === 'FlattenHyperliquidAccount') return 'Flatten All'
  if (command.kind === 'FlattenHyperliquidSymbol') return 'Flatten Position'
  if (command.kind === 'LimitOrder') return 'Limit Order'
  if (command.kind === 'ChaseOrder') return 'Chase Order'
  if (command.kind === 'TrailingEntryOrder') return 'Trailing Entry'
  if (command.kind === 'SetHedgeMode') return 'Set Hedge Mode'
  if (command.kind === 'SetLeverage') return 'Set Leverage'
  return command.kind
}

function getKindLabel(kind: string): string {
  if (kind === 'FlattenHyperliquidAccount') return 'Flatten All'
  if (kind === 'FlattenHyperliquidSymbol') return 'Flatten Position'
  if (kind === 'TrailingEntryOrder') return 'Trailing Entry'
  if (kind === 'SetHedgeMode') return 'Set Hedge Mode'
  if (kind === 'SetLeverage') return 'Set Leverage'
  return formatName(kind)
}

function getExchangeLabel(exchange: string): string {
  return formatName(exchange)
}

function getProductLabel(product: string): string {
  return marketProductLabel(product)
}

function getAccountLabel(accountId: string): string {
  const account = accountsStore.accounts.find((item) => item.id === accountId)
  return account ? `${account.label} (${account.exchange})` : `${accountId.slice(0, 8)}...`
}

function canDuplicateCommand(command: UserCommandPayload): boolean {
  return !['FlattenHyperliquidAccount', 'FlattenHyperliquidSymbol'].includes(command.kind)
}

function handleDuplicate(command: UserCommandPayload): void {
  switch (command.kind) {
    case 'LimitOrder':
      modalStore.openModalWithValues('LimitOrder', {
        account_id: marketContextAccountId(command.data.market_context),
        symbol: command.data.symbol,
        action: command.data.action,
        position_side: command.data.position_side,
        quantity: command.data.quantity,
        quantity_mode: command.data.quantity_mode,
        price: command.data.price,
        time_in_force: command.data.time_in_force,
        take_profit: command.data.attached_exit_plan?.take_profit ?? null,
        stop_loss: command.data.attached_exit_plan?.stop_loss ?? null,
      } as LimitOrderPrefill)
      break
    case 'ChaseOrder':
      modalStore.openModalWithValues('ChaseOrder', {
        account_id: marketContextAccountId(command.data.market_context),
        symbol: command.data.symbol,
        action: command.data.action,
        position_side: command.data.position_side,
        quantity: command.data.quantity,
        quantity_mode: command.data.quantity_mode,
        boundary: command.data.boundary,
        expires_after_secs: command.data.expires_after_secs,
        take_profit: command.data.attached_exit_plan?.take_profit ?? null,
        stop_loss: command.data.attached_exit_plan?.stop_loss ?? null,
        execution_guard_overrides: command.data.execution_guard_overrides ?? null,
      } as ChaseOrderPrefill)
      break
    case 'TrailingEntryOrder':
      modalStore.openModalWithValues('TrailingEntryOrder', {
        activation_price: command.data.activation_price,
        jump_frac_threshold: command.data.jump_frac_threshold,
        position_side: command.data.position_side,
        risk_amount: command.data.risk_amount,
        stop_loss: command.data.stop_loss,
        take_profit: command.data.take_profit ?? null,
        symbol: command.data.symbol,
      } as TrailingEntryPrefill)
      break
    case 'MarketOrder':
      modalStore.openModalWithValues('MarketOrder', {
        symbol: command.data.symbol,
        quantity_usd: command.data.quantity_usd,
        position_side: command.data.position_side,
        action: command.data.action,
        take_profit: command.data.attached_exit_plan?.take_profit ?? null,
        stop_loss: command.data.attached_exit_plan?.stop_loss ?? null,
      } as MarketOrderPrefill)
      break
    default:
      break
  }
}

function handleInspect(commandId: string): void {
  commandStore.inspectCommand(commandId)
}

function handleRequestActionContext(commandId: string): void {
  wsStore.requestCommandActionContext(commandId)
}

function teActionDevice(commandId: string): DeviceSnapshotLiteData | null {
  const devices = commandStore.commandActionContextDevices(commandId)
  return (
    devices?.find(
      (device) =>
        device.snapshot.kind === 'TrailingEntry' &&
        !device.complete &&
        !device.canceled &&
        device.snapshot.data.lifecycle === TrailingEntryLifecycle.Running,
    ) ?? null
  )
}

function canEditTrailingEntry(commandId: string): boolean {
  return teActionDevice(commandId) !== null
}

function canActivateTrailingEntry(commandId: string): boolean {
  const device = teActionDevice(commandId)
  return (
    device?.snapshot.kind === 'TrailingEntry' &&
    device.snapshot.data.phase === TrailingEntryPhase.Initial
  )
}

function teImmediateActionData(commandId: string) {
  const device = teActionDevice(commandId)
  if (!device || device.snapshot.kind !== 'TrailingEntry') return null
  const te = device.snapshot.data
  return {
    device_id: device.device_id,
    expected_revision: te.state_revision ?? 0,
    expected_phase: te.phase,
    expected_lifecycle: te.lifecycle ?? TrailingEntryLifecycle.Running,
  }
}

function handleActivateTrailingEntry(commandId: string): void {
  const data = teImmediateActionData(commandId)
  if (!data) return
  wsStore.sendUserCommand({ kind: 'ActivateTrailingEntryNow', data })
}

function handleEnterTrailingEntry(commandId: string): void {
  const data = teImmediateActionData(commandId)
  if (!data) return
  confirmation.value = {
    title: 'Enter Now',
    message:
      'Bypass the remaining trailing wait and submit this TE entry through the normal order and protection pipeline at the latest authoritative stream price?',
    confirmLabel: 'Enter Now',
    action: () => wsStore.sendUserCommand({ kind: 'EnterTrailingEntryNow', data }),
  }
}

function handleEditTrailingEntry(commandId: string): void {
  const device = teActionDevice(commandId)
  if (!device || device.snapshot.kind !== 'TrailingEntry') return
  editTeTarget.value = {
    deviceId: device.device_id,
    snapshot: device.snapshot.data,
  }
}

function handleCancel(commandId: string): void {
  commandStore.cancelCommand(commandId)
}

function handleClosePosition(commandId: string): void {
  if (!uiStore.confirmPositionCloses) {
    commandStore.closePosition(commandId)
    return
  }
  const label = commandStore.closePositionLabel(commandId)
  confirmation.value = {
    title: label,
    message: `${label} for command ${commandId.slice(0, 8)}?\n\nTrad will cancel any remaining entry order before submitting a reduce-only market close for this command's attributable exposure.`,
    confirmLabel: label,
    rememberLabel: "Don't ask again for position closes",
    disableFutureConfirmation: true,
    action: () => commandStore.closePosition(commandId),
  }
}

function handlePartialClosePosition(commandId: string): void {
  const item = commandStore.commandMap[commandId]
  if (
    !item ||
    !['MarketOrder', 'LimitOrder', 'ChaseOrder'].includes(item.command.kind) ||
    !item.command.data ||
    !('market_context' in item.command.data) ||
    !('symbol' in item.command.data) ||
    !('position_side' in item.command.data)
  ) {
    return
  }
  const state = commandStore.hyperliquidCommandActionState(commandId)
  if (!commandStore.canPartialClosePosition(commandId) || state.ownedQuantity <= 0) return
  partialCloseData.value = {
    commandId,
    symbol: item.command.data.symbol,
    marketContext: item.command.data.market_context,
    positionSide: item.command.data.position_side,
    ownedQuantity: state.ownedQuantity,
    protectionCount: state.protectionCount,
  }
}

function submitPartialClose(data: {
  quantity: number
  expectedOwnedQuantity: number
  fullClose: boolean
}): void {
  const commandId = partialCloseData.value?.commandId
  if (!commandId) return
  if (data.fullClose) {
    commandStore.closePosition(commandId)
  } else {
    commandStore.partialClosePosition(commandId, data.quantity, data.expectedOwnedQuantity)
  }
}

function handleCancelRemainingEntry(commandId: string): void {
  confirmation.value = {
    title: 'Cancel Remaining Entry',
    message: `Cancel the remaining entry for command ${commandId.slice(0, 8)}?\n\nAlready filled exposure and its active protection will remain open.`,
    confirmLabel: 'Cancel Remaining',
    action: () => commandStore.cancelRemainingEntry(commandId),
  }
}

function confirmPendingAction(disableFutureConfirmation = false): void {
  const pending = confirmation.value
  confirmation.value = null
  if (pending?.disableFutureConfirmation && disableFutureConfirmation) {
    uiStore.setConfirmPositionCloses(false)
  }
  pending?.action()
}

function canRefreshExchangeState(command: UserCommandPayload): boolean {
  if (
    !['MarketOrder', 'LimitOrder', 'ChaseOrder', 'TrailingEntryOrder'].includes(command.kind) ||
    !command.data ||
    !('market_context' in command.data)
  ) {
    return false
  }
  return normalizeMarketContext(command.data.market_context).type === 'hyperliquid'
}

function handleRefreshExchangeState(commandId: string): void {
  const item = commandStore.commandMap[commandId]
  if (!item || !canRefreshExchangeState(item.command)) return
  const data = item.command.data as {
    market_context: MarketContext
    symbol: string
  }
  wsStore.sendRefreshHyperliquidReconciliation(data.market_context, {
    symbol: data.symbol,
    commandId,
  })
}

function editableProtection(
  commandId: string,
): { id: string; state: NativeProtectionState } | null {
  const contextDevices = commandStore.commandActionContextDevices(commandId)
  if (contextDevices) {
    const device = contextDevices.find(
      (candidate) =>
        candidate.snapshot.kind === 'NativeProtection' &&
        !candidate.complete &&
        normalizeMarketContext(candidate.snapshot.data.market_context).type === 'hyperliquid' &&
        candidate.snapshot.data.status === NativeProtectionStatus.Tracking &&
        candidate.snapshot.data.ownership_status === 'consistent' &&
        (candidate.snapshot.data.owned_remaining_qty ?? 0) > 0,
    )
    if (!device || device.snapshot.kind !== 'NativeProtection') return null
    const snapshot = device.snapshot.data
    return {
      id: device.device_id,
      state: {
        ...snapshot,
        market_context: normalizeMarketContext(snapshot.market_context),
        take_profit: snapshot.take_profit ?? null,
        stop_loss: snapshot.stop_loss ?? null,
        owned_remaining_qty: snapshot.owned_remaining_qty ?? 0,
        last_live_signed_position: snapshot.last_live_signed_position ?? null,
        aggregate_owned_qty: snapshot.aggregate_owned_qty ?? null,
        aggregate_owner_count: snapshot.aggregate_owner_count ?? null,
        ownership_reason: snapshot.ownership_reason ?? null,
        explicit_close_cleanup: snapshot.explicit_close_cleanup ?? false,
        last_client_order_id: snapshot.last_client_order_id ?? null,
        last_parent_client_order_id: snapshot.last_parent_client_order_id ?? null,
        last_remote_order_id: snapshot.last_remote_order_id ?? null,
        last_order_status: snapshot.last_order_status ?? null,
        last_order_reason: snapshot.last_order_reason ?? null,
        last_take_profit: null,
        last_stop_loss: null,
        last_tpsl_mode: null,
        last_update_seen_at: snapshot.last_update_seen_at
          ? new Date(snapshot.last_update_seen_at)
          : null,
        created_at: new Date(snapshot.created_at),
      } as NativeProtectionState,
    }
  }
  return (
    deviceStore.devices
      .filter((device) => device.associated_command_id === commandId)
      .map((device) => ({ id: device.id, state: device.state as NativeProtectionState, device }))
      .find(({ device, state: protection }) => {
        if (device.kind !== 'NativeProtection' || device.complete) {
          return false
        }
        return (
          normalizeMarketContext(protection.market_context).type === 'hyperliquid' &&
          protection.status === NativeProtectionStatus.Tracking &&
          protection.ownership_status === 'consistent' &&
          protection.owned_remaining_qty > 0
        )
      }) ?? null
  )
}

function canEditProtection(commandId: string): boolean {
  return editableProtection(commandId) !== null
}

function handleEditProtection(commandId: string): void {
  editProtectionDevice.value = editableProtection(commandId)
}

function handleContinueMissedEntry(commandId: string): void {
  const cmd = commandStore.commandMap[commandId]
  if (!cmd || cmd.command.kind !== 'TrailingEntryOrder') return
  commandStore.continueMissedEntry(commandId)
}

function handleRename(commandId: string): void {
  const current = commandStore.commandMeta?.[commandId]?.nickname ?? ''
  const currentColor = commandStore.commandMeta?.[commandId]?.nicknameColor ?? null
  renameCommandId.value = commandId
  renameValue.value = current
  renameColor.value = currentColor
  renameOpen.value = true
  nextTick(() => {
    const el = document.getElementById('command-nickname-input') as HTMLInputElement | null
    el?.focus()
    el?.select()
  })
}

function handlePin(commandId: string): void {
  commandStore.toggleCommandPin(commandId)
}

function handleServerNoticeAction(): void {
  const notice = wsStore.serverActionNotice
  if (!notice?.action) return
  if (notice.action.kind === 'inspect_command') {
    commandStore.inspectCommand(notice.action.commandId)
    wsStore.dismissServerActionNotice(notice.id)
  }
}

const renameOpen = ref(false)
const renameCommandId = ref<string | null>(null)
const renameValue = ref('')
const renameColor = ref<string | null>(null)
const nicknameColors = [
  { label: 'Default', value: null },
  { label: 'Blue', value: '#5cc8ff' },
  { label: 'Green', value: '#6ee7b7' },
  { label: 'Yellow', value: '#fbbf24' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Red', value: '#f87171' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Pink', value: '#f472b6' },
]

const renameCommandLabel = computed(() => {
  if (!renameCommandId.value) return ''
  const cmd = commandStore.commandMap[renameCommandId.value]
  if (!cmd) return ''
  return getCommandLabel(cmd.command)
})

function closeRename() {
  renameOpen.value = false
  renameCommandId.value = null
  renameValue.value = ''
  renameColor.value = null
}

function removeRename() {
  renameValue.value = ''
  renameColor.value = null
  saveRename()
}

function saveRename() {
  if (!renameCommandId.value) return
  commandStore.setCommandNickname(renameCommandId.value, renameValue.value, renameColor.value)
  closeRename()
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div
      v-if="wsStore.serverActionNotice"
      class="server-action-notice"
      role="status"
      aria-live="polite"
    >
      <div class="min-w-0">
        <div class="notice-title">{{ wsStore.serverActionNotice.title ?? 'Command blocked' }}</div>
        <div class="notice-message">{{ wsStore.serverActionNotice.message }}</div>
      </div>
      <div class="notice-actions">
        <button
          v-if="wsStore.serverActionNotice.action"
          class="btn btn-sm"
          @click="handleServerNoticeAction"
        >
          {{ wsStore.serverActionNotice.action.label }}
        </button>
        <button
          class="btn btn-sm btn-ghost"
          aria-label="Dismiss command notice"
          @click="wsStore.dismissServerActionNotice(wsStore.serverActionNotice?.id)"
        >
          x
        </button>
      </div>
    </div>

    <Transition name="expand">
      <div v-show="showFilters">
        <div class="panel-content space-y-3 p-2 text-xs">
          <div class="space-y-2">
            <div
              class="flex items-center justify-between text-[11px] uppercase tracking-wide text-(--color-text-dim)"
            >
              <span>Status</span>
              <span class="text-[10px] normal-case">Shift+click to solo</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in statusOptions"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('status', option)"
                :aria-pressed="isFilterActive('status', option)"
                :class="isSoloActive('status', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('status', option, $event)"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Position</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in positionOptions"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('position', option)"
                :aria-pressed="isFilterActive('position', option)"
                :class="isSoloActive('position', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('position', option, $event)"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Recent</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in timeOptions"
                :key="option.value"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="commandStore.commandFilters.timeRange === option.value"
                :aria-pressed="commandStore.commandFilters.timeRange === option.value"
                @click="setTimeRange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="commandStore.activeCommandExchanges.length" class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Exchange</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in commandStore.activeCommandExchanges"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('exchange', option)"
                :aria-pressed="isFilterActive('exchange', option)"
                :class="isSoloActive('exchange', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('exchange', option, $event)"
              >
                {{ getExchangeLabel(option) }}
              </button>
            </div>
          </div>

          <div v-if="commandStore.activeCommandProducts.length" class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Product</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in commandStore.activeCommandProducts"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('product', option)"
                :aria-pressed="isFilterActive('product', option)"
                :class="isSoloActive('product', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('product', option, $event)"
              >
                {{ getProductLabel(option) }}
              </button>
            </div>
          </div>

          <div v-if="commandStore.activeCommandAccounts.length" class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Account</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in commandStore.activeCommandAccounts"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('account', option)"
                :aria-pressed="isFilterActive('account', option)"
                :class="isSoloActive('account', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('account', option, $event)"
              >
                {{ getAccountLabel(option) }}
              </button>
            </div>
          </div>

          <div v-if="commandStore.activeCommandSymbols.length" class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Symbol</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in commandStore.activeCommandSymbols"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('symbol', option)"
                :aria-pressed="isFilterActive('symbol', option)"
                :class="isSoloActive('symbol', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('symbol', option, $event)"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Kind</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in commandStore.activeCommandKinds"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('kind', option)"
                :aria-pressed="isFilterActive('kind', option)"
                :class="isSoloActive('kind', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('kind', option, $event)"
              >
                {{ getKindLabel(option) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="pinnedCommands.length" class="flex-1 min-h-0">
      <SplitView
        orientation="vertical"
        storage-key="terminal-commands-pinned"
        :initial-sizes="[35, 65]"
        class="w-full h-full"
      >
        <template #pinned>
          <div class="pane-fill">
            <div class="pinned-section flex-1 min-h-0">
              <div class="pinned-header">Pinned</div>
              <div class="pinned-body">
                <StickyScroller
                  :trigger="pinnedCommands.length"
                  :smooth="true"
                  :showButton="false"
                  :stickOnMount="!uiStore.newestCommandsFirst"
                >
                  <div class="flex flex-col p-2 gap-2">
                    <template v-for="cmd in pinnedCommands" :key="cmd.command_id">
                      <div
                        class="border border-[var(--border-color)]"
                        :class="
                          cmd.command_id == commandStore.selectedCommandId
                            ? 'ring-2 ring-[var(--color-text)]'
                            : ''
                        "
                      >
                        <CommandBase
                          v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
                          :commandId="cmd.command_id"
                          :commandStatus="cmd.status"
                          :commandKind="cmd.command.kind"
                          :label="getCommandLabel(cmd.command)"
                          :nickname="commandStore.commandMeta?.[cmd.command_id]?.nickname ?? null"
                          :nicknameColor="
                            commandStore.commandMeta?.[cmd.command_id]?.nicknameColor ?? null
                          "
                          :pinned="commandStore.commandMeta?.[cmd.command_id]?.pinned ?? false"
                          :canCancel="commandStore.canCancelCommand(cmd.command_id)"
                          :canCancelRemainingEntry="
                            commandStore.canCancelRemainingEntry(cmd.command_id)
                          "
                          :canClosePosition="commandStore.canClosePosition(cmd.command_id)"
                          :canPartialClosePosition="
                            commandStore.canPartialClosePosition(cmd.command_id)
                          "
                          :closePositionLabel="commandStore.closePositionLabel(cmd.command_id)"
                          :canContinueMissedEntry="
                            commandStore.canContinueMissedEntry(cmd.command_id)
                          "
                          :canRefreshExchangeState="canRefreshExchangeState(cmd.command)"
                          :canEditProtection="canEditProtection(cmd.command_id)"
                          :canEditTrailingEntry="canEditTrailingEntry(cmd.command_id)"
                          :canActivateTrailingEntry="canActivateTrailingEntry(cmd.command_id)"
                          :canEnterTrailingEntry="canEditTrailingEntry(cmd.command_id)"
                          :canDuplicate="canDuplicateCommand(cmd.command)"
                          :actionContextStatus="
                            commandStore.commandActionContext(cmd.command_id).status
                          "
                          :actionContextError="
                            commandStore.commandActionContext(cmd.command_id).error
                          "
                          :createdAt="cmd.created_at"
                          :result="cmd.result"
                          :flattenedByEffects="commandStore.flattenEffectsAffecting(cmd.command_id)"
                          :flattenEffects="commandStore.flattenEffectsFrom(cmd.command_id)"
                          @duplicate="handleDuplicate(cmd.command)"
                          @cancel="handleCancel"
                          @inspect="handleInspect"
                          @close-position="handleClosePosition"
                          @partial-close-position="handlePartialClosePosition"
                          @cancel-remaining-entry="handleCancelRemainingEntry"
                          @continue-missed-entry="handleContinueMissedEntry"
                          @refresh-exchange-state="handleRefreshExchangeState"
                          @edit-protection="handleEditProtection"
                          @edit-trailing-entry="handleEditTrailingEntry"
                          @activate-trailing-entry="handleActivateTrailingEntry"
                          @enter-trailing-entry="handleEnterTrailingEntry"
                          @rename="handleRename"
                          @pin="handlePin"
                          @request-action-context="handleRequestActionContext"
                          @inspect-related="handleInspect"
                        >
                          <component
                            :is="getCommandComponent(cmd.command)"
                            :command="cmd.command.data"
                            :market-ref="cmd.market_ref"
                          />
                        </CommandBase>
                        <CommandHistoryItem v-else :command="cmd" />
                      </div>
                    </template>
                  </div>
                </StickyScroller>
              </div>
            </div>
          </div>
        </template>
        <template #all>
          <div class="pane-fill">
            <StickyScroller
              :trigger="unpinnedCommands.length"
              :smooth="true"
              :showButton="!uiStore.newestCommandsFirst"
              :stickOnMount="!uiStore.newestCommandsFirst"
              class="flex-1 min-h-0"
            >
              <div class="flex flex-col p-2 gap-2">
                <template v-for="cmd in unpinnedCommands" :key="cmd.command_id">
                  <div
                    class="border border-[var(--border-color)]"
                    :class="
                      cmd.command_id == commandStore.selectedCommandId
                        ? 'ring-2 ring-[var(--color-text)]'
                        : ''
                    "
                  >
                    <CommandBase
                      v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
                      :commandId="cmd.command_id"
                      :commandStatus="cmd.status"
                      :commandKind="cmd.command.kind"
                      :label="getCommandLabel(cmd.command)"
                      :nickname="commandStore.commandMeta?.[cmd.command_id]?.nickname ?? null"
                      :nicknameColor="
                        commandStore.commandMeta?.[cmd.command_id]?.nicknameColor ?? null
                      "
                      :pinned="commandStore.commandMeta?.[cmd.command_id]?.pinned ?? false"
                      :canCancel="commandStore.canCancelCommand(cmd.command_id)"
                      :canCancelRemainingEntry="
                        commandStore.canCancelRemainingEntry(cmd.command_id)
                      "
                      :canClosePosition="commandStore.canClosePosition(cmd.command_id)"
                      :canPartialClosePosition="
                        commandStore.canPartialClosePosition(cmd.command_id)
                      "
                      :closePositionLabel="commandStore.closePositionLabel(cmd.command_id)"
                      :canContinueMissedEntry="commandStore.canContinueMissedEntry(cmd.command_id)"
                      :canRefreshExchangeState="canRefreshExchangeState(cmd.command)"
                      :canEditProtection="canEditProtection(cmd.command_id)"
                      :canEditTrailingEntry="canEditTrailingEntry(cmd.command_id)"
                      :canActivateTrailingEntry="canActivateTrailingEntry(cmd.command_id)"
                      :canEnterTrailingEntry="canEditTrailingEntry(cmd.command_id)"
                      :canDuplicate="canDuplicateCommand(cmd.command)"
                      :actionContextStatus="
                        commandStore.commandActionContext(cmd.command_id).status
                      "
                      :actionContextError="commandStore.commandActionContext(cmd.command_id).error"
                      :createdAt="cmd.created_at"
                      :result="cmd.result"
                      :flattenedByEffects="commandStore.flattenEffectsAffecting(cmd.command_id)"
                      :flattenEffects="commandStore.flattenEffectsFrom(cmd.command_id)"
                      @duplicate="handleDuplicate(cmd.command)"
                      @cancel="handleCancel"
                      @inspect="handleInspect"
                      @close-position="handleClosePosition"
                      @partial-close-position="handlePartialClosePosition"
                      @cancel-remaining-entry="handleCancelRemainingEntry"
                      @continue-missed-entry="handleContinueMissedEntry"
                      @refresh-exchange-state="handleRefreshExchangeState"
                      @edit-protection="handleEditProtection"
                      @edit-trailing-entry="handleEditTrailingEntry"
                      @activate-trailing-entry="handleActivateTrailingEntry"
                      @enter-trailing-entry="handleEnterTrailingEntry"
                      @rename="handleRename"
                      @pin="handlePin"
                      @request-action-context="handleRequestActionContext"
                      @inspect-related="handleInspect"
                    >
                      <component
                        :is="getCommandComponent(cmd.command)"
                        :command="cmd.command.data"
                        :market-ref="cmd.market_ref"
                      />
                    </CommandBase>
                    <CommandHistoryItem v-else :command="cmd" />
                  </div>
                </template>
              </div>
            </StickyScroller>
          </div>
        </template>
      </SplitView>
    </div>

    <StickyScroller
      v-else
      :trigger="unpinnedCommands.length"
      :smooth="true"
      :showButton="!uiStore.newestCommandsFirst"
      :stickOnMount="!uiStore.newestCommandsFirst"
      class="flex-1 min-h-0"
    >
      <div class="flex flex-col p-2 gap-2">
        <template v-for="cmd in unpinnedCommands" :key="cmd.command_id">
          <div
            class="border border-[var(--border-color)]"
            :class="
              cmd.command_id == commandStore.selectedCommandId
                ? 'ring-2 ring-[var(--color-text)]'
                : ''
            "
          >
            <CommandBase
              v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
              :commandId="cmd.command_id"
              :commandStatus="cmd.status"
              :commandKind="cmd.command.kind"
              :label="getCommandLabel(cmd.command)"
              :nickname="commandStore.commandMeta?.[cmd.command_id]?.nickname ?? null"
              :nicknameColor="commandStore.commandMeta?.[cmd.command_id]?.nicknameColor ?? null"
              :pinned="commandStore.commandMeta?.[cmd.command_id]?.pinned ?? false"
              :canCancel="commandStore.canCancelCommand(cmd.command_id)"
              :canCancelRemainingEntry="commandStore.canCancelRemainingEntry(cmd.command_id)"
              :canClosePosition="commandStore.canClosePosition(cmd.command_id)"
              :canPartialClosePosition="commandStore.canPartialClosePosition(cmd.command_id)"
              :closePositionLabel="commandStore.closePositionLabel(cmd.command_id)"
              :canContinueMissedEntry="commandStore.canContinueMissedEntry(cmd.command_id)"
              :canRefreshExchangeState="canRefreshExchangeState(cmd.command)"
              :canEditProtection="canEditProtection(cmd.command_id)"
              :canEditTrailingEntry="canEditTrailingEntry(cmd.command_id)"
              :canActivateTrailingEntry="canActivateTrailingEntry(cmd.command_id)"
              :canEnterTrailingEntry="canEditTrailingEntry(cmd.command_id)"
              :canDuplicate="canDuplicateCommand(cmd.command)"
              :actionContextStatus="commandStore.commandActionContext(cmd.command_id).status"
              :actionContextError="commandStore.commandActionContext(cmd.command_id).error"
              :createdAt="cmd.created_at"
              :result="cmd.result"
              :flattenedByEffects="commandStore.flattenEffectsAffecting(cmd.command_id)"
              :flattenEffects="commandStore.flattenEffectsFrom(cmd.command_id)"
              @duplicate="handleDuplicate(cmd.command)"
              @cancel="handleCancel"
              @inspect="handleInspect"
              @close-position="handleClosePosition"
              @partial-close-position="handlePartialClosePosition"
              @cancel-remaining-entry="handleCancelRemainingEntry"
              @continue-missed-entry="handleContinueMissedEntry"
              @refresh-exchange-state="handleRefreshExchangeState"
              @edit-protection="handleEditProtection"
              @edit-trailing-entry="handleEditTrailingEntry"
              @activate-trailing-entry="handleActivateTrailingEntry"
              @enter-trailing-entry="handleEnterTrailingEntry"
              @rename="handleRename"
              @pin="handlePin"
              @request-action-context="handleRequestActionContext"
              @inspect-related="handleInspect"
            >
              <component
                :is="getCommandComponent(cmd.command)"
                :command="cmd.command.data"
                :market-ref="cmd.market_ref"
              />
            </CommandBase>
            <CommandHistoryItem v-else :command="cmd" />
          </div>
        </template>
      </div>
    </StickyScroller>

    <Teleport to="body">
      <div
        v-if="renameOpen"
        class="fixed inset-0 z-[400] bg-black/25 backdrop-blur-xs"
        @click.self="closeRename"
      >
        <div
          class="absolute top-[10%] left-1/2 -translate-x-1/2 w-[min(520px,90%)] bg-[var(--panel-bg)] border border-[var(--border-color)] shadow-2xl text-[color:var(--color-text)] overflow-hidden"
          :style="{ borderRadius: 'var(--radius-none)' }"
          role="dialog"
          aria-modal="true"
        >
          <div class="relative p-3 border-b border-[var(--border-color)]">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">
              Command Nickname
            </div>
            <div class="text-[13px] text-(--color-text) mt-1">{{ renameCommandLabel }}</div>
            <button
              v-if="renameValue.trim().length > 0"
              class="btn btn-sm btn-ghost absolute right-3 top-3"
              @click="removeRename"
            >
              Remove
            </button>
          </div>
          <div class="p-3">
            <input
              id="command-nickname-input"
              v-model="renameValue"
              placeholder="Add a nickname..."
              class="w-full bg-transparent border border-[var(--border-color)] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] placeholder:opacity-60"
              :style="{ borderRadius: 'var(--radius-none)' }"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="saveRename"
              @keydown.escape.prevent="closeRename"
            />
          </div>
          <div class="px-3 pb-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim) mb-2">
              Nickname color
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in nicknameColors"
                :key="option.label"
                class="btn btn-sm btn-ghost"
                :data-pressed="renameColor === option.value"
                :aria-pressed="renameColor === option.value"
                @click="renameColor = option.value"
              >
                <span
                  v-if="option.value"
                  class="inline-block w-3 h-3 border"
                  :style="{ background: option.value, borderColor: 'var(--border-color)' }"
                />
                <span v-else class="text-xs text-(--color-text-dim)">Default</span>
              </button>
            </div>
          </div>
          <div
            class="flex items-center justify-end gap-2 p-3 border-t border-[var(--border-color)]"
          >
            <button class="btn btn-sm btn-ghost" @click="closeRename">Cancel</button>
            <button class="btn btn-sm" @click="saveRename">Save</button>
          </div>
        </div>
      </div>
    </Teleport>
    <EditHyperliquidProtectionModal
      v-if="editProtectionDevice && editProtectionState"
      :open="true"
      :device-id="editProtectionDevice.id"
      :device="editProtectionState"
      @close="editProtectionDevice = null"
    />
    <EditTrailingEntryModal
      v-if="editTeTarget"
      :open="true"
      :device-id="editTeTarget.deviceId"
      :device="editTeTarget.snapshot"
      @close="editTeTarget = null"
    />
    <PartialHyperliquidCommandCloseModal
      v-if="partialCloseData"
      :open="true"
      :command-id="partialCloseData.commandId"
      :symbol="partialCloseData.symbol"
      :market-context="partialCloseData.marketContext"
      :position-side="partialCloseData.positionSide"
      :owned-quantity="partialCloseData.ownedQuantity"
      :protection-count="partialCloseData.protectionCount"
      @submit="submitPartialClose"
      @close="partialCloseData = null"
    />
    <ActionConfirmationModal
      v-if="confirmation"
      :open="true"
      :title="confirmation.title"
      :message="confirmation.message"
      :confirm-label="confirmation.confirmLabel"
      :remember-label="confirmation.rememberLabel"
      @confirm="confirmPendingAction"
      @cancel="confirmation = null"
    />
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s ease;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}
.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
  opacity: 1;
}

.filter-btn {
  color: var(--color-text-dim);
  border-color: var(--border-color);
  box-shadow: none;
  background: transparent;
}

.filter-btn[data-pressed='true'],
.filter-btn[aria-pressed='true'] {
  color: var(--color-text);
  border-color: var(--color-text);
  box-shadow: inset 0 0 0 1px var(--color-text);
}

.filter-solo {
  border-color: var(--color-text);
  box-shadow:
    inset 0 0 0 1px var(--color-text),
    0 0 0 1px var(--color-text);
}

.pinned-section {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border-color);
}

.pinned-header {
  padding: 6px 10px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border-bottom: 1px solid var(--border-color);
}
.pinned-body {
  flex: 1;
  min-height: 0;
}

.server-action-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--color-error) 12%, var(--panel-bg));
  color: var(--color-text);
  font-size: 12px;
}

.notice-title {
  font-size: 10px;
  line-height: 1.2;
  text-transform: uppercase;
  color: var(--color-error);
}

.notice-message {
  margin-top: 2px;
  line-height: 1.3;
  color: var(--color-text);
}

.notice-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.pane-fill {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
</style>
