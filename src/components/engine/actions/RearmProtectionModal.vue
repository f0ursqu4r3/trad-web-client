<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import FormField from '@/components/forms/FormField.vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import { useTelemetryAction } from '@/composables/useTelemetryAction'
import { labelWithUnit, marketUnits } from '@/lib/engineCommands/marketUnits'
import {
  rearmAvailability,
  rearmEditableChildren,
  rearmProtectionIntent,
} from '@/lib/engineCommands/protectionRearm'
import type { NativeProtectionProjection } from '@/lib/gateway'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{
  open: boolean
  accountId: string
  protection: NativeProtectionProjection | null
  tradeId?: string | null
}>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'accepted'): void }>()
const gateway = useGatewayStore()
const accounts = useAccountsStore()
const submission = useEngineCommandSubmission()
const telemetryAction = useTelemetryAction({
  open: () => props.open,
  accountId: () => props.accountId || null,
  tradeId: () => props.tradeId ?? null,
  commandId: () => props.tradeId ?? null,
  actionKind: () => 'rearm_protection',
  source: 'rearm_modal',
})
const prices = ref<Record<string, string>>({})
const validationError = ref<string | null>(null)

const availability = computed(() => rearmAvailability(props.protection))
const editable = computed(() =>
  props.protection === null ? [] : rearmEditableChildren(props.protection),
)
const units = computed(() =>
  marketUnits(
    accounts.accounts.find((account) => account.id === props.accountId),
    props.protection?.symbol ?? '',
  ),
)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    props.accountId !== '' &&
    availability.value.kind === 'available' &&
    !submission.submitting.value,
)
const errorMessage = computed(() => {
  if (availability.value.kind === 'refused') return availability.value.reason
  return validationError.value ?? submission.submissionError.value
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    prices.value = Object.fromEntries(editable.value.map((child) => [child.childId, '']))
    validationError.value = null
    submission.clearSubmissionError()
  },
)

async function submit(): Promise<void> {
  if (props.protection === null || !canSubmit.value) return
  validationError.value = null
  const actionAttemptId = telemetryAction.confirm()
  try {
    const intent = rearmProtectionIntent(props.protection, prices.value)
    if (await submission.submit({ accountId: props.accountId, intent }, actionAttemptId)) {
      emit('accepted')
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
  <BaseCommandModal title="Re-arm Protection" :open="open" @close="closeModal">
    <form id="engine-protection-rearm" class="rearm-form" @submit.prevent="submit">
      <p class="rearm-hint">
        Places Trad's stop/TP again; orders you placed on Hyperliquid are not touched.
      </p>
      <p v-if="protection?.failure_reason" class="rearm-reason" data-testid="rearm-flag-reason">
        {{ protection.failure_reason }}
      </p>
      <FormField
        v-for="child in editable"
        :key="child.childId"
        :label="labelWithUnit(`${child.label} trigger`, units.quote)"
        :help="`No live order. Leave blank to place it at ${child.triggerPrice}, or give a new price.`"
        optional
      >
        <input
          v-model="prices[child.childId]"
          class="input"
          type="text"
          inputmode="decimal"
          :placeholder="child.triggerPrice"
          :aria-label="`${child.label} trigger price`"
        />
      </FormField>
      <p v-if="errorMessage" class="submission-error" role="alert" data-testid="rearm-error">
        {{ errorMessage }}
      </p>
    </form>
    <template #footer>
      <button class="btn" type="button" @click="closeModal">Back</button>
      <button
        class="btn btn-primary"
        type="submit"
        form="engine-protection-rearm"
        :disabled="!canSubmit"
      >
        {{ submission.submitting.value ? 'Submitting…' : 'Re-arm protection' }}
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.rearm-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rearm-hint,
.rearm-reason {
  margin: 0;
  font-size: 12px;
}
.rearm-hint {
  color: var(--fg-muted);
}
.rearm-reason {
  color: var(--state-warning);
  overflow-wrap: anywhere;
}
.submission-error {
  margin: 0;
  color: var(--color-error);
  overflow-wrap: anywhere;
}
</style>
