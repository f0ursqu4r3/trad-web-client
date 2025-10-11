<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from './BaseCommandModal.vue'
import type { CreateAccountCommand, NetworkType } from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const ws = useWsStore()

const DEFAULT_NETWORK: NetworkType = 'Binance'
const NETWORK_OPTIONS: NetworkType[] = ['Binance', 'Sim']

const network = ref<NetworkType>(DEFAULT_NETWORK)
const name = ref('')
const apiKey = ref('')
const secretKey = ref('')

const isSubmitDisabled = computed(() => {
  return !network.value || !name.value.trim() || !apiKey.value.trim() || !secretKey.value.trim()
})

function reset() {
  network.value = DEFAULT_NETWORK
  name.value = ''
  apiKey.value = ''
  secretKey.value = ''
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

function submit() {
  if (isSubmitDisabled.value) return
  const data: CreateAccountCommand = {
    network: network.value,
    name: name.value.trim(),
    api_key: apiKey.value.trim(),
    secret_key: secretKey.value.trim(),
  }
  ws.sendCreateAccountCommand(data)
  close()
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
              {{ option }}
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
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button
          form="create-account-form"
          type="submit"
          class="btn btn-primary"
          :disabled="isSubmitDisabled"
        >
          Create
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
