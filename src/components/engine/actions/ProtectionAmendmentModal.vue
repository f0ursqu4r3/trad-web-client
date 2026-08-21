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

const props = defineProps<{
  open: boolean
  accountId: string
  protection: NativeProtectionProjection | null
  activeAmendment: ProtectionAmendmentProjection | null
  focusChildId?: string | null
}>()
const emit = defineEmits<{ (event: 'close'): void }>()
const gateway = useGatewayStore()
const accounts = useAccountsStore()
const submission = useEngineCommandSubmission()
const form = ref<ProtectionFormState>(newProtectionState())
const baseline = ref('')
const confirmed = ref(false)
const validationError = ref<string | null>(null)
const units = computed(() =>
  marketUnits(
    accounts.accounts.find((account) => account.id === props.accountId),
    props.protection?.symbol ?? '',
  ),
)

const changed = computed(() => JSON.stringify(form.value) !== baseline.value)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    props.accountId !== '' &&
    props.protection?.status === 'tracking' &&
    props.activeAmendment === null &&
    changed.value &&
    confirmed.value &&
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
  form.value =
    props.protection === null ? newProtectionState() : protectionForm(props.protection.plan)
  baseline.value = JSON.stringify(form.value)
  confirmed.value = false
  validationError.value = null
  submission.clearSubmissionError()
  void focusRequestedChild()
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
  try {
    const intent = protectionAmendmentIntent(
      props.protection.protection_id,
      props.protection.plan_revision,
      form.value,
    )
    if (await submission.submit({ accountId: props.accountId, intent })) emit('close')
  } catch (error) {
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <BaseCommandModal title="Edit Native Protection" :open="open" size="wide" @close="emit('close')">
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
        :base-asset="units.base"
        :quote-asset="units.quote"
      />

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
      <label class="confirm-row">
        <input v-model="confirmed" type="checkbox" />
        Apply this complete TP/SL plan to the live owned position
      </label>
      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="emit('close')">Back</button>
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
.help-text {
  color: var(--color-text-dim);
}
.confirm-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.submission-error {
  color: var(--color-error);
  overflow-wrap: anywhere;
}
</style>
