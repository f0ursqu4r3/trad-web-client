<script setup lang="ts">
import { computed, ref } from 'vue'

import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import type { LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { managedTradeActions } from '@/lib/projection/tradeWorkspaceActions'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{
  trade: ManagedTradeView
  snapshot: BrowserAccountSnapshot
}>()

const accounts = useAccountsStore()
const selectedAction = ref<LifecycleAction | null>(null)
const closePercent = ref<string | null>(null)
const closeExecution = ref<'market' | 'limit' | 'chase'>('market')
const editProtectionOpen = ref(false)

const actions = computed(() => managedTradeActions(props.trade, props.snapshot))
const closeAction = computed(() => actions.value.close)
const secondaryActions = computed(() => actions.value.secondary)
const takeoverAction = computed(() => actions.value.takeover)
const activeAmendment = computed(() =>
  activeProtectionAmendment(props.trade.protection, props.snapshot.protection_amendments),
)

function openClose(percent: string | null): void {
  if (closeAction.value === null) return
  closePercent.value = percent
  selectedAction.value = closeAction.value
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
      v-if="closeAction"
      class="btn btn-sm btn-outline-danger"
      type="button"
      @click="openClose(null)"
    >
      Close all
    </button>
    <button v-if="closeAction" class="btn btn-sm" type="button" @click="openClose('50')">
      Close ½
    </button>
    <button v-if="closeAction" class="btn btn-sm" type="button" @click="openClose('33.33333333')">
      Close ⅓
    </button>
    <button v-if="closeAction" class="btn btn-sm" type="button" @click="openClose('25')">
      Close ¼
    </button>
    <button
      v-if="trade.protection"
      class="btn btn-sm"
      type="button"
      :disabled="trade.protection.status !== 'tracking' || activeAmendment !== null"
      @click="editProtectionOpen = true"
    >
      Edit protection
    </button>
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
