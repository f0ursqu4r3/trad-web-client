<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import { enumKeyName } from '@/lib/utils'
import { NetworkType, ExchangeType } from '@/lib/ws/protocol'
import { useAccountsStore, type AccountFormPayload } from '@/stores/accounts'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const accounts = useAccountsStore()

const DEFAULT_NETWORK: NetworkType = NetworkType.Mainnet
const NETWORK_OPTIONS: NetworkType[] = [NetworkType.Mainnet, NetworkType.Testnet]
const DEFAULT_EXCHANGE: ExchangeType = ExchangeType.Binance
const EXCHANGE_OPTIONS: ExchangeType[] = [ExchangeType.Binance]

const network = ref<NetworkType>(DEFAULT_NETWORK)
const exchange = ref<ExchangeType>(DEFAULT_EXCHANGE)
const name = ref('')
const apiKey = ref('')
const secretKey = ref('')
const formError = ref<string | null>(null)
const isSubmitting = ref(false)

const isSubmitDisabled = computed(() => {
  return !network.value || !name.value.trim() || !apiKey.value.trim() || !secretKey.value.trim()
})

function reset() {
  network.value = DEFAULT_NETWORK
  name.value = ''
  apiKey.value = ''
  secretKey.value = ''
  formError.value = null
  isSubmitting.value = false
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
    }
  },
)

function close() {
  emit('close')
}

async function submit() {
  if (isSubmitDisabled.value || isSubmitting.value) return
  isSubmitting.value = true
  formError.value = null
  try {
    await accounts.addAccount({
      label: name.value.trim(),
      key: apiKey.value.trim(),
      secret: secretKey.value.trim(),
      network: network.value.toLowerCase() as NetworkType,
      exchange: exchange.value.toLowerCase() as ExchangeType,
    } as AccountFormPayload)
    close()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseCommandModal title="Create Account" :open="open" @close="close">
    <form id="create-account-form" class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Network</span>
          <select v-model="network" class="input">
            <option v-for="option in NETWORK_OPTIONS" :key="option" :value="option">
              {{ enumKeyName(NetworkType, option) || option }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Exchange</span>
          <select v-model="exchange" class="input" disabled>
            <option v-for="option in EXCHANGE_OPTIONS" :key="option" :value="option">
              {{ enumKeyName(ExchangeType, option) || option }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Name</span>
          <input v-model.trim="name" class="input" placeholder="Account alias" />
        </label>
        <label class="field">
          <span>API Key</span>
          <input v-model.trim="apiKey" class="input" placeholder="API key" />
        </label>
        <label class="field">
          <span>Secret Key</span>
          <input v-model.trim="secretKey" class="input" placeholder="Secret key" />
        </label>
        <p class="col-span-2 text-[11px] text-[var(--color-text-dim)] leading-relaxed">
          Your keys are stored securely and are only accessible by the trading backend. Double-check
          the network matches the exchange the keys belong to.
        </p>
      </div>
      <p v-if="formError" class="text-xs text-red-400">{{ formError }}</p>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button
          form="create-account-form"
          type="submit"
          class="btn btn-primary"
          :disabled="isSubmitDisabled || isSubmitting"
        >
          <span v-if="isSubmitting">Creating...</span>
          <span v-else>Create</span>
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

button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
