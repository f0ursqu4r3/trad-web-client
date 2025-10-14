<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import type { NetworkType } from '@/lib/ws/protocol'
import type { GatewayAccount } from '@/lib/gatewayClient'
import { useAccountsStore } from '@/stores/accounts'

interface Props {
  open: boolean
  account: GatewayAccount | null
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  account: null,
})
const emit = defineEmits<{ (e: 'close'): void }>()

const accounts = useAccountsStore()

const network = ref<NetworkType>('Binance')
const label = ref('')
const apiKey = ref('')
const secretKey = ref('')
const formError = ref<string | null>(null)
const isSubmitting = ref(false)

const isSubmitDisabled = computed(() => {
  return !props.account || !label.value.trim() || !apiKey.value.trim() || !secretKey.value.trim()
})

function resetFromAccount(acct: GatewayAccount | null) {
  if (!acct) {
    label.value = ''
    network.value = 'Binance'
    apiKey.value = ''
    secretKey.value = ''
    return
  }
  label.value = acct.label ?? ''
  network.value = (acct.meta?.network as NetworkType) || 'Binance'
  apiKey.value = ''
  secretKey.value = ''
  formError.value = null
  isSubmitting.value = false
}

watch(
  () => [props.open, props.account],
  () => {
    if (props.open) {
      resetFromAccount(props.account)
    }
  },
  { immediate: true },
)

function close() {
  emit('close')
}

async function submit() {
  if (!props.account || isSubmitDisabled.value || isSubmitting.value) return
  isSubmitting.value = true
  formError.value = null
  try {
    await accounts.updateAccount(props.account.id, {
      label: label.value.trim(),
      apiKey: apiKey.value.trim(),
      secretKey: secretKey.value.trim(),
      network: network.value,
    })
    close()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseCommandModal title="Edit Account" :open="open" @close="close">
    <form id="edit-account-form" class="space-y-4" @submit.prevent="submit">
      <div v-if="!account" class="text-xs text-[var(--color-text-dim)]">No account selected.</div>
      <div v-else class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Label</span>
          <input v-model.trim="label" class="input" placeholder="Account label" />
        </label>
        <label class="field">
          <span>Network</span>
          <input
            v-model.trim="network"
            class="input"
            placeholder="Network"
            title="Network identifier (e.g. Binance)"
          />
        </label>
        <label class="field">
          <span>API Key</span>
          <input v-model.trim="apiKey" class="input" placeholder="New API key" />
        </label>
        <label class="field">
          <span>Secret Key</span>
          <input v-model.trim="secretKey" class="input" placeholder="New secret key" />
        </label>
        <p class="col-span-2 text-[11px] text-[var(--color-text-dim)] leading-relaxed">
          Updating an account replaces the stored credentials. Provide the complete new key pair.
        </p>
      </div>
      <p v-if="formError" class="text-xs text-red-400">{{ formError }}</p>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button
          form="edit-account-form"
          type="submit"
          class="btn btn-primary"
          :disabled="isSubmitDisabled || isSubmitting"
        >
          <span v-if="isSubmitting">Saving...</span>
          <span v-else>Save</span>
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 12px;
}

.field > span {
  color: var(--color-text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input {
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-size: 12px;
  color: var(--color-text);
}

.input:focus {
  outline: 1px solid var(--accent-color);
  outline-offset: 1px;
}
</style>
