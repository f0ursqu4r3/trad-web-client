<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { KeyRound, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-vue-next'
import {
  listHyperliquidAgentConnections,
  refreshHyperliquidAgentConnection,
  replaceHyperliquidAgentConnection,
  selectHyperliquidAgentSlot,
  type HyperliquidAgentConnection,
  type HyperliquidRemoteAgent,
} from '@/lib/gateway/hyperliquidAgentConnections'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'

const props = defineProps<{ account: AccountRecord; locked: boolean }>()
const emit = defineEmits<{ approvalReady: [ready: boolean] }>()

const accounts = useAccountsStore()
const connections = ref<HyperliquidAgentConnection[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const replacementConsent = ref<string | null>(null)

const userAddress = computed(() => props.account.exchange_metadata?.user_address?.toLowerCase())
const connection = computed(() =>
  connections.value.find(
    (item) =>
      item.network === props.account.network &&
      item.user_address.toLowerCase() === userAddress.value,
  ),
)
const currentRemote = computed(() => {
  const selected = connection.value
  if (!selected) return undefined
  return selected.remote_agents.find(
    (remote) => remote.address.toLowerCase() === selected.agent_address.toLowerCase(),
  )
})
const slotConflict = computed(() => {
  const selected = connection.value
  if (!selected || currentRemote.value) return undefined
  return selected.remote_agents.find(
    (remote) =>
      remote.name === selected.agent_name &&
      remote.address.toLowerCase() !== selected.agent_address.toLowerCase(),
  )
})
const namedRemoteAgents = computed(() =>
  (connection.value?.remote_agents ?? []).filter((remote) => remote.name.trim()),
)
const namedSlotsFull = computed(() => !currentRemote.value && namedRemoteAgents.value.length >= 3)
const replacementConfirmed = computed(
  () => replacementConsent.value === connection.value?.agent_name,
)
const approvalReady = computed(() => {
  const selected = connection.value
  if (!selected || loading.value || error.value) return false
  if (selected.approved || currentRemote.value) return true
  if (slotConflict.value || namedSlotsFull.value) return replacementConfirmed.value
  return true
})

watch(approvalReady, (ready) => emit('approvalReady', ready), { immediate: true })
watch(
  () => props.account.id,
  () => {
    replacementConsent.value = null
    void loadConnections()
  },
)

onMounted(loadConnections)

function ownsRemote(remote: HyperliquidRemoteAgent): boolean {
  const selected = connection.value
  return Boolean(selected && remote.address.toLowerCase() === selected.agent_address.toLowerCase())
}

function canChoose(remote: HyperliquidRemoteAgent): boolean {
  if (props.locked || busy.value || connection.value?.approved || ownsRemote(remote)) return false
  return Boolean(slotConflict.value || namedSlotsFull.value)
}

async function loadConnections(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    connections.value = await listHyperliquidAgentConnections()
    const selected = connection.value
    const metadata = props.account.exchange_metadata
    if (
      selected?.approved &&
      (metadata?.agent_approved !== true ||
        metadata.agent_name !== selected.agent_name ||
        metadata.agent_address?.toLowerCase() !== selected.agent_address.toLowerCase())
    ) {
      await refreshHyperliquidAgentConnection(selected.credential_id)
      await accounts.fetchAccounts()
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    loading.value = false
  }
}

async function refresh(): Promise<void> {
  const selected = connection.value
  if (!selected) return void loadConnections()
  await run(async () => {
    await refreshHyperliquidAgentConnection(selected.credential_id)
  })
}

async function replaceKey(): Promise<void> {
  const selected = connection.value
  if (!selected) return
  const confirmed = window.confirm(
    `Generate a fresh Trad signing key for ${selected.agent_name}? The current unapproved local key will be discarded.`,
  )
  if (!confirmed) return
  replacementConsent.value = null
  await run(async () => {
    await replaceHyperliquidAgentConnection(selected.credential_id)
  })
}

async function chooseSlot(remote: HyperliquidRemoteAgent): Promise<void> {
  const selected = connection.value
  if (!selected) return
  const confirmed = window.confirm(
    `Replace Hyperliquid slot “${remote.name}” with this Trad signing connection? The existing agent at ${remote.address} will stop working.`,
  )
  if (!confirmed) return
  await run(async () => {
    await selectHyperliquidAgentSlot(selected.credential_id, remote.name)
    replacementConsent.value = remote.name
  })
}

async function run(action: () => Promise<void>): Promise<void> {
  busy.value = true
  error.value = null
  try {
    await action()
    await Promise.all([accounts.fetchAccounts(), loadConnections()])
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="signing-connection" aria-label="Trad signing connection">
    <header class="signing-connection__header">
      <div>
        <span class="setup-label">Selected signing connection</span>
        <strong>{{ connection?.agent_name || 'Checking saved connections' }}</strong>
      </div>
      <span class="pill" :class="connection?.approved || currentRemote ? 'pill-ok' : 'pill-warn'">
        {{
          connection?.approved || currentRemote
            ? 'connected'
            : loading
              ? 'checking'
              : 'approval required'
        }}
      </span>
    </header>

    <div v-if="connection" class="signing-connection__identity">
      <KeyRound :size="16" aria-hidden="true" />
      <div>
        <code>{{ connection.agent_address }}</code>
        <span>
          Trad holds this encrypted private key · {{ connection.attached_accounts }} attached
          account{{ connection.attached_accounts === 1 ? '' : 's' }}
        </span>
      </div>
    </div>

    <p v-if="error" class="signing-connection__error" role="alert">{{ error }}</p>
    <p v-else-if="!loading && !connection" class="signing-connection__error" role="alert">
      No usable Trad signing key was found for this wallet and network.
    </p>
    <p v-else-if="currentRemote" class="signing-connection__notice signing-connection__notice--ok">
      <ShieldCheck :size="14" /> Hyperliquid recognizes this address in the
      <strong>{{ currentRemote.name }}</strong> named slot. No replacement is needed.
    </p>
    <p v-else-if="slotConflict && !replacementConfirmed" class="signing-connection__notice">
      The <strong>{{ slotConflict.name }}</strong> slot is occupied by another agent. Explicitly
      replace that slot before opening your wallet.
    </p>
    <p v-else-if="namedSlotsFull && !replacementConfirmed" class="signing-connection__notice">
      All three named Hyperliquid slots are occupied. Choose one below to replace with Trad’s saved
      key.
    </p>
    <p
      v-else-if="connection && !connection.approved"
      class="signing-connection__notice signing-connection__notice--ok"
    >
      The <strong>{{ connection.agent_name }}</strong> slot is ready for this Trad key. Your wallet
      approval will create or replace only that named slot.
    </p>

    <div v-if="connection" class="signing-connection__toolbar">
      <button class="btn btn-secondary btn-xs" type="button" :disabled="busy" @click="refresh">
        <RefreshCw :size="13" /> {{ loading ? 'Checking' : 'Refresh slots' }}
      </button>
      <button
        class="btn btn-secondary btn-xs"
        type="button"
        :disabled="locked || connection.approved || busy"
        title="Generate a new address only after the saved agent is no longer approved"
        @click="replaceKey"
      >
        <RotateCcw :size="13" /> Generate fresh key
      </button>
    </div>

    <div v-if="connection" class="remote-agent-list">
      <div class="remote-agent-list__heading">
        <span>Hyperliquid named slots</span>
        <span>{{ namedRemoteAgents.length }} of 3 occupied</span>
      </div>
      <div v-if="namedRemoteAgents.length" class="remote-agent-list__rows">
        <div
          v-for="remote in namedRemoteAgents"
          :key="`${remote.name}-${remote.address}`"
          class="remote-agent-row"
        >
          <div>
            <strong>{{ remote.name }}</strong>
            <code>{{ remote.address }}</code>
          </div>
          <span v-if="ownsRemote(remote)" class="pill pill-ok">this Trad</span>
          <span v-else-if="replacementConsent === remote.name" class="pill pill-warn"
            >selected</span
          >
          <button
            v-else-if="canChoose(remote)"
            class="btn btn-secondary btn-xs"
            type="button"
            @click="chooseSlot(remote)"
          >
            Replace this slot
          </button>
          <span v-else class="remote-agent-row__status">another application</span>
        </div>
      </div>
      <p v-else>No named agents are currently registered for this wallet.</p>
      <small>
        Trad cannot use another address unless it also holds that address’s private key. Choosing a
        slot here replaces its existing agent; it does not import that agent.
      </small>
    </div>
  </section>
</template>

<style scoped>
.signing-connection {
  margin-top: 0.8rem;
  border-top: 1px solid var(--border-normal);
  padding-top: 0.8rem;
}
.signing-connection__header,
.signing-connection__identity,
.signing-connection__toolbar,
.remote-agent-list__heading,
.remote-agent-row {
  display: flex;
  align-items: center;
}
.signing-connection__header,
.remote-agent-list__heading,
.remote-agent-row {
  justify-content: space-between;
  gap: 1rem;
}
.signing-connection__header strong,
.signing-connection__identity code,
.remote-agent-row code {
  display: block;
  overflow-wrap: anywhere;
  color: var(--fg-strong);
  font-size: 12px;
}
.signing-connection__identity {
  gap: 0.65rem;
  margin-top: 0.65rem;
  color: var(--accent-color);
}
.signing-connection__identity span {
  display: block;
  margin-top: 0.2rem;
  color: var(--fg-muted);
  font-size: 12px;
}
.signing-connection__notice,
.signing-connection__error {
  margin: 0.7rem 0 0;
  padding: 0.55rem 0.65rem;
  border-left: 2px solid var(--state-warning);
  background: color-mix(in srgb, var(--state-warning) 7%, transparent);
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 1.45;
}
.signing-connection__notice--ok {
  border-left-color: var(--state-success);
  background: color-mix(in srgb, var(--state-success) 6%, transparent);
}
.signing-connection__error {
  border-left-color: var(--state-error);
  color: var(--state-error);
}
.signing-connection__toolbar {
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.7rem;
}
.remote-agent-list {
  margin-top: 0.8rem;
  border-top: 1px solid var(--border-normal);
  padding-top: 0.7rem;
}
.remote-agent-list__heading {
  color: var(--fg-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.remote-agent-list__rows {
  margin-top: 0.35rem;
  border: 1px solid var(--border-normal);
}
.remote-agent-row {
  min-height: 42px;
  padding: 0.45rem 0.6rem;
}
.remote-agent-row + .remote-agent-row {
  border-top: 1px solid var(--border-normal);
}
.remote-agent-row strong {
  color: var(--fg-strong);
  font-size: 12px;
}
.remote-agent-row code {
  margin-top: 0.15rem;
  color: var(--fg-muted);
  font-size: 11px;
}
.remote-agent-row__status,
.remote-agent-list p,
.remote-agent-list small {
  color: var(--fg-muted);
  font-size: 11px;
}
.remote-agent-list p {
  margin: 0.5rem 0;
}
.remote-agent-list small {
  display: block;
  margin-top: 0.5rem;
  line-height: 1.45;
}
@media (max-width: 760px) {
  .signing-connection__toolbar,
  .remote-agent-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
