<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import { buildCancelEntryWorkIntent } from '@/lib/engineCommands/intents'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const submission = useEngineCommandSubmission()
const selectedAccountId = ref('')
const targetKind = ref<'symbol' | 'account'>('symbol')
const symbol = ref('')
const confirmed = ref(false)
const validationError = ref<string | null>(null)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    selectedAccountId.value !== '' &&
    confirmed.value &&
    !submission.submitting.value,
)

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

watch(selectedAccountId, (accountId, prior) => {
  if (accountId !== '' && accountId !== prior)
    symbol.value = accounts.getDefaultSymbolForAccount(accountId)
})

function reset(): void {
  selectedAccountId.value = accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  targetKind.value = 'symbol'
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  confirmed.value = false
  validationError.value = null
  submission.clearSubmissionError()
}

async function submit(): Promise<void> {
  validationError.value = null
  try {
    const intent = buildCancelEntryWorkIntent(targetKind.value, symbol.value)
    if (await submission.submit({ accountId: selectedAccountId.value, intent })) emit('close')
  } catch (error) {
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <BaseCommandModal title="Cancel Entry Work" :open="open" @close="emit('close')">
    <form id="engine-cancel-entry-work" class="command-form" @submit.prevent="submit">
      <label class="field">
        <span>Account</span>
        <select v-model="selectedAccountId" class="input">
          <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
            {{ account.label }} · {{ account.exchange }} · {{ account.network }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Target</span>
        <select v-model="targetKind" class="input">
          <option value="symbol">One Symbol</option>
          <option value="account">Entire Account</option>
        </select>
      </label>
      <label v-if="targetKind === 'symbol'" class="field">
        <span>Symbol</span>
        <input v-model="symbol" class="input" autocomplete="off" />
      </label>
      <p class="warning">
        Cancels unfilled entry Orders, active Chases, and Trailing Entries that have not established
        a position. Existing exposure and its active protection remain in place.
      </p>
      <label class="confirm-row">
        <input v-model="confirmed" type="checkbox" />
        Confirm cancellation for
        {{ targetKind === 'account' ? 'the entire account' : 'this symbol' }}
      </label>
      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>
    <template #footer>
      <button class="btn" type="button" @click="emit('close')">Back</button>
      <button
        class="btn btn-danger"
        type="submit"
        form="engine-cancel-entry-work"
        :disabled="!canSubmit"
      >
        {{ submission.submitting.value ? 'Submitting…' : 'Cancel Entry Work' }}
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.command-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.warning,
.confirm-row,
.submission-error {
  grid-column: 1 / -1;
}
.warning {
  margin: 0;
  color: var(--color-warning);
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
@media (max-width: 640px) {
  .command-form {
    grid-template-columns: 1fr;
  }
}
</style>
