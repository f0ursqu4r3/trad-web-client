<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import RearmProtectionModal from '@/components/engine/actions/RearmProtectionModal.vue'
import type { LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { lifecycleIntent } from '@/lib/engineCommands/lifecycle'
import { CLOSE_CHASE_PRESET_LABEL } from '@/lib/engineCommands/closeChasePreset'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import { rearmAvailability } from '@/lib/engineCommands/protectionRearm'
import {
  blockerExplanation,
  closeBlock,
  protectionBlock,
  type ActionBlock,
} from '@/lib/engineCommands/tradeActionBlockers'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import {
  activeCloseWorkflowsForTrade,
  type ManagedTradeView,
} from '@/lib/projection/tradeWorkspace'
import { managedTradeActions } from '@/lib/projection/tradeWorkspaceActions'
import { useAccountsStore } from '@/stores/accounts'
import { isExactZero } from '@/lib/exactDecimalMath'
import { CommandOutcomeUnknownError, useGatewayStore } from '@/stores/gateway'
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
const gateway = useGatewayStore()
const selectedAction = ref<LifecycleAction | null>(null)
const closePercent = ref<string | null>(null)
const closeExecution = ref<'market' | 'limit' | 'chase'>('chase')
const editProtectionOpen = ref(false)
const rearmOpen = ref(false)
const rearmMessage = ref<string | null>(null)
const blockedMessage = ref<string | null>(null)
const shortcutState = ref<'idle' | 'submitting' | 'accepted' | 'unknown'>('idle')
const shortcutMessage = ref<string | null>(null)
const shortcutRequestId = ref<string | null>(null)
const shortcutCommandId = ref<string | null>(null)

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
const closeBlockState = computed(() =>
  closeBlock({
    closeAvailable: closeAction.value !== null,
    hasRemainingExposure: !isExactZero(props.trade.remainingQuantity),
    activeClose: activeCloseWorkflow.value !== null,
    position: props.trade.position,
    protection: props.trade.protection,
  }),
)
const protectionBlockState = computed(() =>
  protectionBlock(props.trade.protection, activeAmendment.value !== null),
)
const closeBlocker = computed(() => closeBlockState.value?.blocker ?? null)
const protectionBlocker = computed(() => protectionBlockState.value?.blocker ?? null)
// How long an Edit click waits for a settling protection (tradeActionBlockers.ts).
const PROTECTION_SETTLE_WAIT_MS = 10_000
const CLOSE_PRESETS = [
  { label: 'Close all', percent: null },
  { label: 'Close ½', percent: '50' },
  { label: 'Close ⅓', percent: '33.33333333' },
  { label: 'Close ¼', percent: '25' },
] as const
let protectionWait: number | null = null
const activeCloseMessage = computed(() =>
  closeBlocker.value === 'ACTIVE_CLOSE_EXISTS'
    ? 'A close is already active. Trad is waiting for its authoritative outcome before allowing another close.'
    : null,
)
// Shown only while Trad has flagged the trade; the engine says whether it
// would be accepted now and why not.
const rearm = computed(() => rearmAvailability(props.trade.protection))
const rearmRefusal = computed(() =>
  rearm.value.kind === 'refused' ? `Re-arm unavailable: ${rearm.value.reason}` : null,
)
const actionMessage = computed(
  () => blockedMessage.value ?? activeCloseMessage.value ?? rearmRefusal.value,
)
const observedShortcut = computed(
  () =>
    props.snapshot.commands.find(
      (command) =>
        command.command_id === shortcutCommandId.value ||
        command.command_id === shortcutRequestId.value,
    ) ?? null,
)

watch(
  () => observedShortcut.value?.lifecycle ?? null,
  (lifecycle) => {
    if (lifecycle === null || shortcutState.value === 'idle') return
    if (
      [
        'succeeded',
        'partially_succeeded',
        'failed',
        'canceled',
        'reconciliation_required',
      ].includes(lifecycle)
    ) {
      shortcutState.value = 'idle'
      shortcutMessage.value = `Close command ${lifecycle.replace(/_/g, ' ')}. Review the updated position before another close.`
    } else {
      shortcutState.value = 'accepted'
      shortcutMessage.value = `Close command accepted and ${lifecycle}. Await its authoritative outcome.`
    }
  },
)

watch(
  [closeBlockState, protectionBlockState],
  ([close, protection], previous) => {
    if (close !== null && close.blocker !== previous?.[0]?.blocker) {
      recordUnavailable('partial_close', close, 'managed_trade_close')
    }
    if (protection !== null && protection.blocker !== previous?.[1]?.blocker) {
      recordUnavailable('edit_protection', protection, 'managed_trade_protection')
    }
  },
  { immediate: true },
)

watch(protectionBlocker, (blocker) => {
  if (protectionWait === null || blocker === 'PROTECTION_SETTLING') return
  endProtectionWait()
  if (blocker === null) {
    blockedMessage.value = null
    editProtectionOpen.value = true
  } else {
    blockAction('edit_protection', blocker)
  }
})

onBeforeUnmount(endProtectionWait)

function openClose(percent: string | null): void {
  if (shortcutState.value !== 'idle') return
  if (closeAction.value === null) {
    if (closeBlocker.value !== null) blockAction('partial_close', closeBlocker.value)
    return
  }
  if (closeExecution.value === 'chase') {
    void submitChaseShortcut(percent)
    return
  }
  closePercent.value = percent
  selectedAction.value = closeAction.value
}

async function submitChaseShortcut(percent: string | null): Promise<void> {
  if (shortcutState.value !== 'idle' || closeAction.value === null) return
  const requestId = crypto.randomUUID()
  const actionAttemptId = newActionAttemptId()
  shortcutState.value = 'submitting'
  shortcutRequestId.value = requestId
  shortcutCommandId.value = null
  shortcutMessage.value = 'Submitting the Chase close preset…'
  try {
    const intent = lifecycleIntent(closeAction.value, {
      closeMode: percent === null ? 'full' : 'percent',
      closePercent: percent ?? undefined,
      closeExecutionMode: 'chase',
      closeChaseBoundaryEnabled: false,
      closeChaseUntilCanceled: true,
    })
    const outcome = await gateway.submitCommand(
      intent,
      accounts.selectedAccountId,
      requestId,
      actionAttemptId,
    )
    if (outcome.kind === 'rejected') {
      shortcutState.value = 'idle'
      shortcutMessage.value = `Close rejected: ${outcome.rejection.reason}`
      return
    }
    shortcutCommandId.value = outcome.command_id
    shortcutState.value = 'accepted'
    shortcutMessage.value = `Chase close accepted (#${outcome.command_id.slice(0, 8)}). It follows the book until the close fills; cancel the Chase to stop it.`
  } catch (error) {
    if (error instanceof CommandOutcomeUnknownError) {
      shortcutState.value = 'unknown'
      shortcutMessage.value = `Close outcome unknown (#${requestId.slice(0, 8)}). Do not repeat this shortcut until the account projection proves its result.`
    } else {
      shortcutState.value = 'idle'
      shortcutMessage.value = error instanceof Error ? error.message : String(error)
    }
  }
}

function openProtection(): void {
  const blocker = protectionBlocker.value
  if (blocker === null) {
    editProtectionOpen.value = true
  } else if (blocker === 'PROTECTION_SETTLING') {
    awaitProtection()
  } else {
    blockAction('edit_protection', blocker)
  }
}

// Wait for the protection to settle, then open the editor; past the wait it
// is reported as blocked.
function awaitProtection(): void {
  blockedMessage.value = blockerExplanation('PROTECTION_SETTLING', null)
  if (protectionWait !== null) return
  protectionWait = window.setTimeout(() => {
    protectionWait = null
    if (protectionBlocker.value !== null) blockAction('edit_protection', protectionBlocker.value)
  }, PROTECTION_SETTLE_WAIT_MS)
}

function endProtectionWait(): void {
  if (protectionWait !== null) window.clearTimeout(protectionWait)
  protectionWait = null
}

function openRearm(): void {
  if (rearm.value.kind !== 'available') return
  rearmMessage.value = null
  rearmOpen.value = true
}

function blockAction(actionKind: TelemetryActionKind, blockerCode: TelemetryBlockerCode): void {
  blockedMessage.value = blockerExplanation(blockerCode, activeCloseMessage.value)
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
  block: ActionBlock,
  controlId: string,
): void {
  recordTelemetry({
    eventName: 'action_unavailable_presented',
    accountId: accounts.selectedAccountId,
    tradeId: props.trade.primaryCommand.command_id,
    commandId: props.trade.primaryCommand.command_id,
    properties: {
      action_kind: actionKind,
      blocker_code: block.blocker,
      reason_code: block.reasonCode,
      control_id: controlId,
      source: 'managed_trade',
    },
  })
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
    <span v-if="closeAction && closeExecution === 'chase'" class="shortcut-terms">
      One tap · {{ CLOSE_CHASE_PRESET_LABEL }} · cancel the Chase to stop it
    </span>
    <template v-if="closeAction || closeBlocker">
      <button
        v-for="preset in CLOSE_PRESETS"
        :key="preset.label"
        class="btn btn-sm"
        :class="{
          'btn-outline-danger': preset.percent === null,
          'action-unavailable': !closeAction,
        }"
        type="button"
        :disabled="shortcutState !== 'idle'"
        @click="openClose(preset.percent)"
      >
        {{ preset.label }}
      </button>
    </template>
    <p v-if="shortcutMessage" class="action-blocker" role="status">{{ shortcutMessage }}</p>
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
    <button
      v-if="rearm.kind !== 'hidden'"
      class="btn btn-sm btn-outline-warn"
      type="button"
      data-testid="rearm-protection"
      :aria-disabled="rearm.kind !== 'available'"
      :class="{ 'action-unavailable': rearm.kind !== 'available' }"
      title="Places Trad's stop/TP again; orders you placed on Hyperliquid are not touched."
      @click="openRearm"
    >
      Re-arm protection
    </button>
    <span v-if="rearm.kind !== 'hidden'" class="shortcut-terms">
      Re-arm places Trad's stop/TP again; orders you placed on Hyperliquid are not touched.
    </span>
    <p v-if="rearmMessage" class="action-blocker" role="status">{{ rearmMessage }}</p>
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
  <RearmProtectionModal
    :open="rearmOpen"
    :account-id="accounts.selectedAccountId ?? ''"
    :protection="trade.protection"
    :trade-id="trade.primaryCommand.command_id"
    @accepted="rearmMessage = 'Re-arm accepted. Trad is placing the protection again.'"
    @close="rearmOpen = false"
  />
  <ProtectionAmendmentModal
    :open="editProtectionOpen"
    :account-id="accounts.selectedAccountId ?? ''"
    :protection="trade.protection"
    :active-amendment="activeAmendment"
    :entry-price="trade.averageEntryPrice"
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
.shortcut-terms {
  flex-basis: 100%;
  color: var(--fg-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
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
@media (max-width: 480px) {
  .trade-actions {
    padding: 0.45rem;
  }
  .trade-actions > .btn,
  .close-mode select {
    min-height: 40px;
  }
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
