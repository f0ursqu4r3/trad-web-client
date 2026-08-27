<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import type { LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import {
  activeCloseWorkflowsForTrade,
  type ManagedTradeView,
} from '@/lib/projection/tradeWorkspace'
import { managedTradeActions } from '@/lib/projection/tradeWorkspaceActions'
import { useAccountsStore } from '@/stores/accounts'
import { isExactZero } from '@/lib/exactDecimalMath'
import {
  newActionAttemptId,
  recordTelemetry,
  type TelemetryActionKind,
  type TelemetryBlockerCode,
} from '@/lib/telemetry'

const props = defineProps<{
  trade: ManagedTradeView
  snapshot: BrowserAccountSnapshot
}>()

const accounts = useAccountsStore()
const selectedAction = ref<LifecycleAction | null>(null)
const closePercent = ref<string | null>(null)
const closeExecution = ref<'market' | 'limit' | 'chase'>('market')
const editProtectionOpen = ref(false)
const blockedMessage = ref<string | null>(null)

const actions = computed(() => managedTradeActions(props.trade, props.snapshot))
const closeAction = computed(() => actions.value.close)
const secondaryActions = computed(() => actions.value.secondary)
const takeoverAction = computed(() => actions.value.takeover)
const activeCloseWorkflow = computed(
  () => activeCloseWorkflowsForTrade(props.trade, props.snapshot)[0] ?? null,
)
const activeCloseCommandId = computed(() => activeCloseWorkflow.value?.command_id ?? null)
const shortActiveCloseCommandId = computed(() => activeCloseCommandId.value?.slice(0, 8) ?? null)
const closeReferenceCopied = ref(false)
const activeAmendment = computed(() =>
  activeProtectionAmendment(props.trade.protection, props.snapshot.protection_amendments),
)
const hasRemainingExposure = computed(() => !isExactZero(props.trade.remainingQuantity))
const closeBlocker = computed<TelemetryBlockerCode | null>(() => {
  if (closeAction.value !== null || !hasRemainingExposure.value) return null
  if (activeCloseWorkflow.value !== null) return 'ACTIVE_CLOSE_EXISTS'
  if (props.trade.position?.status === 'awaiting_exchange_confirmation') {
    return 'POSITION_CONFIRMING'
  }
  if (
    props.trade.position?.reconciliation_required ||
    props.trade.protection?.status === 'reconciliation_required'
  ) {
    return 'RECONCILIATION_REQUIRED'
  }
  return 'POSITION_INCONSISTENT'
})
const protectionBlocker = computed<TelemetryBlockerCode | null>(() => {
  if (!props.trade.protection) return null
  if (props.trade.protection.status === 'reconciliation_required') {
    return 'RECONCILIATION_REQUIRED'
  }
  if (props.trade.protection.status !== 'tracking') return 'PROTECTION_NOT_TRACKING'
  if (activeAmendment.value !== null) return 'PROTECTION_AMENDMENT_ACTIVE'
  return null
})
const activeCloseMessage = computed(() =>
  closeBlocker.value === 'ACTIVE_CLOSE_EXISTS'
    ? 'A close is already active. Trad is waiting for its authoritative outcome before allowing another close.'
    : null,
)
const actionMessage = computed(() => blockedMessage.value ?? activeCloseMessage.value)

watch(
  [closeBlocker, protectionBlocker],
  ([close, protection], previous) => {
    if (close !== null && close !== previous?.[0]) {
      recordUnavailable('partial_close', close, 'managed_trade_close')
    }
    if (protection !== null && protection !== previous?.[1]) {
      recordUnavailable('edit_protection', protection, 'managed_trade_protection')
    }
  },
  { immediate: true },
)

function openClose(percent: string | null): void {
  if (closeAction.value === null) {
    if (closeBlocker.value !== null) blockAction('partial_close', closeBlocker.value)
    return
  }
  closePercent.value = percent
  selectedAction.value = closeAction.value
}

function openProtection(): void {
  if (protectionBlocker.value !== null) {
    blockAction('edit_protection', protectionBlocker.value)
    return
  }
  editProtectionOpen.value = true
}

function blockAction(actionKind: TelemetryActionKind, blockerCode: TelemetryBlockerCode): void {
  blockedMessage.value = blockerExplanation(blockerCode)
  recordTelemetry({
    eventName: 'action_blocked',
    accountId: accounts.selectedAccountId,
    tradeId: props.trade.primaryCommand.command_id,
    commandId: props.trade.primaryCommand.command_id,
    actionAttemptId: newActionAttemptId(),
    properties: { action_kind: actionKind, blocker_code: blockerCode, source: 'managed_trade' },
  })
}

function recordUnavailable(
  actionKind: TelemetryActionKind,
  blockerCode: TelemetryBlockerCode,
  controlId: string,
): void {
  recordTelemetry({
    eventName: 'action_unavailable_presented',
    accountId: accounts.selectedAccountId,
    tradeId: props.trade.primaryCommand.command_id,
    commandId: props.trade.primaryCommand.command_id,
    properties: { action_kind: actionKind, blocker_code: blockerCode, control_id: controlId },
  })
}

function blockerExplanation(blockerCode: TelemetryBlockerCode): string {
  switch (blockerCode) {
    case 'POSITION_CONFIRMING':
      return 'Trad is confirming the latest position change with the exchange. This action will become available automatically.'
    case 'RECONCILIATION_REQUIRED':
      return 'This trade needs reconciliation before Trad can safely change its exposure or protection.'
    case 'ACTIVE_CLOSE_EXISTS':
      return (
        activeCloseMessage.value ??
        'A close is already active for this trade. Wait for its outcome before submitting another.'
      )
    case 'PROTECTION_NOT_TRACKING':
      return 'Protection is not tracking, so it cannot be edited safely.'
    case 'PROTECTION_AMENDMENT_ACTIVE':
      return 'A protection edit is already active.'
    default:
      return 'Trad cannot prove this action is safe from the current account projection.'
  }
}

async function copyActiveCloseReference(): Promise<void> {
  if (activeCloseCommandId.value === null) return
  try {
    await navigator.clipboard.writeText(activeCloseCommandId.value)
    closeReferenceCopied.value = true
  } catch {
    closeReferenceCopied.value = false
  }
}

function openAction(action: LifecycleAction): void {
  closePercent.value = null
  selectedAction.value = action
}

function openTakeover(): void {
  if (takeoverAction.value !== null) openAction(takeoverAction.value)
}

defineExpose({ openClose, openTakeover })
</script>

<template>
  <div class="trade-actions">
    <label v-if="closeAction" class="close-mode">
      <span>Close as</span>
      <select v-model="closeExecution" class="input input-compact">
        <option value="market">Market</option>
        <option value="chase">Chase</option>
        <option value="limit">Limit</option>
      </select>
    </label>
    <button
      v-if="closeAction || closeBlocker"
      class="btn btn-sm btn-outline-danger"
      :class="{ 'action-unavailable': !closeAction }"
      type="button"
      @click="openClose(null)"
    >
      Close all
    </button>
    <button
      v-if="closeAction || closeBlocker"
      class="btn btn-sm"
      :class="{ 'action-unavailable': !closeAction }"
      type="button"
      @click="openClose('50')"
    >
      Close ½
    </button>
    <button
      v-if="closeAction || closeBlocker"
      class="btn btn-sm"
      :class="{ 'action-unavailable': !closeAction }"
      type="button"
      @click="openClose('33.33333333')"
    >
      Close ⅓
    </button>
    <button
      v-if="closeAction || closeBlocker"
      class="btn btn-sm"
      :class="{ 'action-unavailable': !closeAction }"
      type="button"
      @click="openClose('25')"
    >
      Close ¼
    </button>
    <button
      v-if="trade.protection"
      class="btn btn-sm"
      type="button"
      :aria-disabled="protectionBlocker !== null"
      :class="{ 'action-unavailable': protectionBlocker !== null }"
      @click="openProtection"
    >
      Edit protection
    </button>
    <p v-if="actionMessage" class="action-blocker" role="status">
      <span>{{ actionMessage }}</span>
      <button
        v-if="activeCloseCommandId"
        class="close-reference"
        type="button"
        :title="
          closeReferenceCopied
            ? 'Copied active close command ID'
            : `Copy active close command ID ${activeCloseCommandId}`
        "
        :aria-label="`Copy active close command ID ${activeCloseCommandId}`"
        @click="copyActiveCloseReference"
      >
        close #{{ shortActiveCloseCommandId }}
      </button>
    </p>
    <button
      v-for="action in secondaryActions"
      :key="action.kind"
      class="btn btn-sm"
      type="button"
      @click="openAction(action)"
    >
      {{ action.label }}
    </button>
    <button
      v-if="takeoverAction"
      class="btn btn-sm btn-outline-warn"
      type="button"
      @click="openAction(takeoverAction)"
    >
      Take over
    </button>
  </div>

  <LifecycleActionModal
    :open="selectedAction !== null"
    :account-id="accounts.selectedAccountId ?? ''"
    :action="selectedAction"
    :initial-close-percent="closePercent"
    :initial-close-execution="closeExecution"
    @close="selectedAction = null"
  />
  <ProtectionAmendmentModal
    :open="editProtectionOpen"
    :account-id="accounts.selectedAccountId ?? ''"
    :protection="trade.protection"
    :active-amendment="activeAmendment"
    @close="editProtectionOpen = false"
  />
</template>

<style scoped>
.trade-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
}
.close-mode {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--fg-muted);
}
.input-compact {
  width: 92px;
  min-height: 28px;
  padding-block: 0.2rem;
}
.action-unavailable {
  opacity: 0.58;
}
.action-blocker {
  display: flex;
  flex-basis: 100%;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.2rem 0 0;
  color: var(--state-warning);
  font-size: 11px;
}
.close-reference {
  padding: 0.05rem 0.2rem;
  border: 1px solid var(--border-normal);
  color: inherit;
  background: transparent;
  font-family: var(--font-mono);
  font-size: inherit;
}
.close-reference:hover,
.close-reference:focus-visible {
  border-color: var(--border-strong);
  color: var(--fg);
}
@media (max-width: 760px) {
  .trade-actions {
    gap: 0.28rem;
    padding: 0.35rem 0.45rem;
  }
  .trade-actions :deep(.btn-sm) {
    min-height: 25px;
    padding: 0.2rem 0.42rem;
    font-size: 10px;
  }
  .close-mode {
    gap: 0.25rem;
    font-size: 10px;
  }
  .input-compact {
    width: 78px;
    min-height: 25px;
    font-size: 10px;
  }
}
</style>
