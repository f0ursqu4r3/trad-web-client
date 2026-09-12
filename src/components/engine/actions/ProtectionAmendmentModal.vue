<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import ProtectionFields from '@/components/engine/commands/ProtectionFields.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import type { NativeProtectionProjection, ProtectionAmendmentProjection } from '@/lib/gateway'
import {
  newProtectionState,
  protectionAmendmentIntent,
  type ProtectionFormState,
} from '@/lib/engineCommands/form'
import { marketUnits } from '@/lib/engineCommands/marketUnits'
import { protectionForm } from '@/lib/engineCommands/protectionAmendment'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useTelemetryAction } from '@/composables/useTelemetryAction'

const props = defineProps<{
  open: boolean
  accountId: string
  protection: NativeProtectionProjection | null
  activeAmendment: ProtectionAmendmentProjection | null
  focusChildId?: string | null
  entryPrice?: string | null
}>()
const emit = defineEmits<{ (event: 'close'): void }>()
const gateway = useGatewayStore()
const accounts = useAccountsStore()
const submission = useEngineCommandSubmission()
const telemetryAction = useTelemetryAction({
  open: () => props.open,
  accountId: () => props.accountId || null,
  actionKind: () => 'edit_protection',
  source: 'protection_modal',
})
const form = ref<ProtectionFormState>(newProtectionState())
const baseline = ref('')
const validationError = ref<string | null>(null)
const serverBreakeven = ref(false)
const focusedStop = computed(() =>
  Boolean(
    props.focusChildId &&
      form.value.stopLoss.enabled &&
      form.value.stopLoss.childId === props.focusChildId,
  ),
)
const units = computed(() =>
  marketUnits(
    accounts.accounts.find((account) => account.id === props.accountId),
    props.protection?.symbol ?? '',
  ),
)

const changed = computed(
  () => serverBreakeven.value || JSON.stringify(form.value) !== baseline.value,
)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    props.accountId !== '' &&
    props.protection?.status === 'tracking' &&
    props.activeAmendment === null &&
    validationError.value === null &&
    changed.value &&
    !submission.submitting.value,
)

watch(
  () => [props.open, props.protection?.protection_id, props.protection?.plan_revision] as const,
  ([open]) => {
    if (!open) return
    reset()
  },
)

function reset(): void {
  validationError.value = null
  serverBreakeven.value = false
  submission.clearSubmissionError()
  try {
    form.value =
      props.protection === null ? newProtectionState() : protectionForm(props.protection.plan)
    baseline.value = JSON.stringify(form.value)
    void focusRequestedChild()
  } catch (error) {
    form.value = newProtectionState()
    baseline.value = JSON.stringify(form.value)
    validationError.value =
      error instanceof Error ? error.message : 'Unable to read the current protection plan.'
  }
}

async function focusRequestedChild(): Promise<void> {
  if (!props.focusChildId) return
  await nextTick()
  const row = document.querySelector(
    `[data-protection-child-id="${CSS.escape(props.focusChildId)}"]`,
  )
  const input = row?.querySelector<HTMLInputElement>('input[type="text"]')
  input?.focus()
  input?.select()
}

async function submit(): Promise<void> {
  if (props.protection === null) return
  validationError.value = null
  const actionAttemptId = telemetryAction.confirm()
  try {
    const intent = protectionAmendmentIntent(
      props.protection.protection_id,
      props.protection.plan_revision,
      form.value,
      props.focusChildId ?? null,
      serverBreakeven.value ? 'breakeven' : null,
    )
    if (await submission.submit({ accountId: props.accountId, intent }, actionAttemptId)) {
      emit('close')
    }
  } catch (error) {
    telemetryAction.validationFailed()
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}

function closeModal(): void {
  telemetryAction.cancel()
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Edit Native Protection" :open="open" size="wide" @close="closeModal">
    <form id="engine-protection-amendment" class="amendment-form" @submit.prevent="submit">
      <div v-if="protection" class="controller-summary">
        <span>{{ protection.symbol }} · {{ protection.position_side }}</span>
        <span>Plan revision {{ protection.plan_revision }}</span>
        <span>
          {{ protection.covered_quantity }} / {{ protection.target_quantity }}
          {{ units.base ?? '' }} covered
        </span>
      </div>

      <ProtectionFields
        v-model="form"
        mark-price-only
        :account-id="accountId"
        :symbol="protection?.symbol ?? ''"
        :position-side="protection?.position_side ?? 'long'"
        :base-asset="units.base"
        :quote-asset="units.quote"
        :entry-price="entryPrice"
        :focus-child-id="focusChildId"
        :server-breakeven="serverBreakeven"
      />

      <div v-if="focusedStop" class="breakeven-choice">
        <button
          class="btn btn-sm"
          type="button"
          :aria-pressed="serverBreakeven"
          @click="serverBreakeven = !serverBreakeven"
        >
          {{ serverBreakeven ? 'Use explicit stop price' : 'SL → fee-aware breakeven' }}
        </button>
        <p v-if="serverBreakeven" class="help-text">
          The server calculates the stop from attributed entry and exit fills, paid fees, current
          expected exit fee, and the remaining Trad-owned position. It rejects incomplete evidence.
          The result is a fee estimate, not a guarantee against slippage or future fee changes.
        </p>
      </div>

      <p class="help-text">
        Hyperliquid edits are applied one verified exchange operation at a time. Stop changes run
        before take-profit ladder changes; removing the final stop runs last.
      </p>
      <p class="help-text">
        Market protection remains bounded by this account's server-side execution guards. Current
        exchange order identities are never accepted from the browser.
      </p>
      <p v-if="activeAmendment" class="submission-error">
        Another edit is {{ activeAmendment.lifecycle }}: {{ activeAmendment.completed_steps }} /
        {{ activeAmendment.steps.length }} steps complete.
      </p>
      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="closeModal">Back</button>
      <button
        class="btn btn-primary"
        type="submit"
        form="engine-protection-amendment"
        :disabled="!canSubmit"
      >
        {{ submission.submitting.value ? 'Submitting…' : 'Apply Protection' }}
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.amendment-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.controller-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 8px;
  color: var(--color-text-dim);
  border: 1px solid var(--border-color);
}
.help-text,
.submission-error {
  margin: 0;
}
.breakeven-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.help-text {
  color: var(--color-text-dim);
}
.submission-error {
  color: var(--color-error);
  overflow-wrap: anywhere;
}
</style>
