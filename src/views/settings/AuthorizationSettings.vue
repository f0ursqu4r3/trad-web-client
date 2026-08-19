<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Link2, RefreshCw, RotateCcw, Trash2 } from 'lucide-vue-next'
import { useAccountsStore } from '@/stores/accounts'
import { ExchangeType } from '@/lib/ws/protocol'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import { accountColorFromId } from '@/lib/accountColors'
import {
  forgetHyperliquidAgentConnection,
  listHyperliquidAgentConnections,
  refreshHyperliquidAgentConnection,
  replaceHyperliquidAgentConnection,
  selectHyperliquidAgentSlot,
  type HyperliquidAgentConnection,
  type HyperliquidRemoteAgent,
} from '@/lib/gateway/hyperliquidAgentConnections'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const accounts = useAccountsStore()
const connections = ref<HyperliquidAgentConnection[]>([])
const loadingConnections = ref(false)
const connectionError = ref<string | null>(null)
const busyCredential = ref<string | null>(null)

const hyperliquid = computed(() =>
  accounts.accounts.filter((account) => account.exchange === ExchangeType.Hyperliquid),
)

onMounted(async () => {
  await Promise.all([accounts.fetchAccounts(), loadConnections()])
})

async function loadConnections() {
  loadingConnections.value = true
  connectionError.value = null
  try {
    connections.value = await listHyperliquidAgentConnections()
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingConnections.value = false
  }
}

function linkedAccount(connection: HyperliquidAgentConnection) {
  return hyperliquid.value.find(
    (account) =>
      account.network === connection.network &&
      account.exchange_metadata?.user_address?.toLowerCase() ===
        connection.user_address.toLowerCase(),
  )
}

function ownsRemoteSlot(connection: HyperliquidAgentConnection, remote: HyperliquidRemoteAgent) {
  return (
    remote.name === connection.agent_name &&
    remote.address.toLowerCase() === connection.agent_address.toLowerCase()
  )
}

async function refreshConnection(connection: HyperliquidAgentConnection) {
  await runConnectionAction(connection, () =>
    refreshHyperliquidAgentConnection(connection.credential_id),
  )
}

async function replaceConnection(connection: HyperliquidAgentConnection) {
  const confirmed = window.confirm(
    `Generate a fresh private key for ${connection.agent_name}? The old local key will be discarded. This is only appropriate after Hyperliquid no longer recognizes it.`,
  )
  if (!confirmed) return
  await runConnectionAction(connection, () =>
    replaceHyperliquidAgentConnection(connection.credential_id),
  )
}

async function reclaimSlot(connection: HyperliquidAgentConnection, remote: HyperliquidRemoteAgent) {
  const confirmed = window.confirm(
    `Use Hyperliquid slot “${remote.name}” for this Trad environment? Your next wallet approval will replace the agent currently occupying that named slot. External bots using it will stop working.`,
  )
  if (!confirmed) return
  await runConnectionAction(connection, () =>
    selectHyperliquidAgentSlot(connection.credential_id, remote.name),
  )
}

async function forgetConnection(connection: HyperliquidAgentConnection) {
  const confirmed = window.confirm(
    `Forget the encrypted Trad key for ${connection.user_address}? Hyperliquid’s remote slot is not deleted. Only do this when you genuinely want a new connection.`,
  )
  if (!confirmed) return
  busyCredential.value = connection.credential_id
  connectionError.value = null
  try {
    await forgetHyperliquidAgentConnection(connection.credential_id)
    await loadConnections()
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busyCredential.value = null
  }
}

async function runConnectionAction(
  connection: HyperliquidAgentConnection,
  action: () => Promise<unknown>,
) {
  busyCredential.value = connection.credential_id
  connectionError.value = null
  try {
    await action()
    await Promise.all([loadConnections(), accounts.fetchAccounts()])
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busyCredential.value = null
  }
}
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Authorization & fees"
    description="Manage durable exchange connections separately from disposable trading-account configuration."
  />

  <ControlSection
    title="Trad agent connections"
    description="One encrypted signing connection per main wallet and network. Deleting a trading account does not delete this key."
  >
    <div class="connection-toolbar">
      <p class="control-copy">
        Trad reuses the same named Hyperliquid agent whenever you remove and re-add an account. Slot
        replacement is always explicit.
      </p>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        :disabled="loadingConnections"
        @click="loadConnections"
      >
        <RefreshCw :size="14" /> {{ loadingConnections ? 'Checking' : 'Refresh slots' }}
      </button>
    </div>
    <p v-if="connectionError" class="connection-error" role="alert">{{ connectionError }}</p>
    <div v-if="connections.length" class="connection-list">
      <article
        v-for="connection in connections"
        :key="connection.credential_id"
        class="connection-card"
      >
        <header class="connection-card__header">
          <div>
            <span class="control-label">{{ connection.network }} wallet</span>
            <code>{{ connection.user_address }}</code>
          </div>
          <span class="pill" :class="connection.approved ? 'pill-ok' : 'pill-warn'">
            {{ connection.approved ? 'connected' : 'approval required' }}
          </span>
        </header>
        <dl class="connection-facts">
          <div>
            <dt>Trad slot</dt>
            <dd>{{ connection.agent_name }}</dd>
          </div>
          <div>
            <dt>Agent address</dt>
            <dd>
              <code>{{ connection.agent_address }}</code>
            </dd>
          </div>
          <div>
            <dt>Attached accounts</dt>
            <dd>{{ connection.attached_accounts }}</dd>
          </div>
          <div>
            <dt>Environment default</dt>
            <dd>{{ connection.preferred_name }}</dd>
          </div>
        </dl>
        <div class="connection-actions">
          <button
            class="btn btn-secondary btn-xs"
            type="button"
            :disabled="busyCredential === connection.credential_id"
            @click="refreshConnection(connection)"
          >
            <RefreshCw :size="13" /> Refresh
          </button>
          <RouterLink
            v-if="linkedAccount(connection)"
            class="btn btn-primary btn-xs"
            :to="`/settings/accounts/${linkedAccount(connection)?.id}/setup`"
          >
            <Link2 :size="13" /> {{ connection.approved ? 'View setup' : 'Approve in setup' }}
          </RouterLink>
          <button
            class="btn btn-secondary btn-xs"
            type="button"
            :disabled="connection.approved || busyCredential === connection.credential_id"
            title="Available only after refresh confirms the saved agent is no longer approved"
            @click="replaceConnection(connection)"
          >
            <RotateCcw :size="13" /> Generate replacement
          </button>
          <button
            class="btn btn-danger btn-xs"
            type="button"
            :disabled="
              connection.attached_accounts > 0 || busyCredential === connection.credential_id
            "
            title="Disconnect all trading accounts before forgetting this durable key"
            @click="forgetConnection(connection)"
          >
            <Trash2 :size="13" /> Forget local key
          </button>
        </div>
        <div class="remote-slots">
          <div class="remote-slots__title">Hyperliquid named slots</div>
          <div v-if="connection.remote_agents.length" class="remote-slot-list">
            <div
              v-for="remote in connection.remote_agents"
              :key="`${remote.name}-${remote.address}`"
              class="remote-slot"
            >
              <div>
                <strong>{{ remote.name || '(unnamed)' }}</strong>
                <code>{{ remote.address }}</code>
              </div>
              <span v-if="ownsRemoteSlot(connection, remote)" class="pill pill-ok">this Trad</span>
              <button
                v-else
                class="btn btn-secondary btn-xs"
                type="button"
                :disabled="connection.approved || busyCredential === connection.credential_id"
                title="Explicitly replace the agent occupying this named slot on the next wallet approval"
                @click="reclaimSlot(connection, remote)"
              >
                Use this slot
              </button>
            </div>
          </div>
          <p v-else class="control-copy">No named agents are currently visible for this wallet.</p>
        </div>
      </article>
    </div>
    <p v-else-if="!loadingConnections" class="control-copy">
      No durable agent connection yet. Creating a Hyperliquid trading account will create one.
    </p>
  </ControlSection>

  <ControlSection
    v-if="hyperliquid.length"
    title="Account authorization"
    :description="`${hyperliquid.length} account${hyperliquid.length === 1 ? '' : 's'}`"
  >
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[780px]">
        <thead>
          <tr>
            <th>Account</th>
            <th>Agent wallet</th>
            <th>Builder approval</th>
            <th>Target total</th>
            <th>Builder recipient</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in hyperliquid"
            :key="account.id"
            :style="{ '--account-context-color': accountColorFromId(account.id) }"
          >
            <td class="authorization-account-cell">
              <div class="text-primary">{{ account.label }}</div>
              <div class="mt-0.5 text-[11px] dim">{{ account.network }}</div>
            </td>
            <td>
              <span
                class="pill"
                :class="account.exchange_metadata?.agent_approved ? 'pill-ok' : 'pill-warn'"
                >{{
                  account.exchange_metadata?.agent_approved ? 'approved' : 'action required'
                }}</span
              >
            </td>
            <td>
              <span
                class="pill"
                :class="account.exchange_metadata?.builder_approved ? 'pill-ok' : 'pill-warn'"
                >{{
                  account.exchange_metadata?.builder_approved ? 'approved' : 'action required'
                }}</span
              >
            </td>
            <td>
              {{ (hyperliquidTargetTotalTenthsBps(account.exchange_metadata) / 10).toFixed(1) }} bps
            </td>
            <td class="max-w-56 truncate font-mono text-[12px] dim">
              {{ account.exchange_metadata?.builder_address || 'not configured' }}
            </td>
            <td class="text-right">
              <RouterLink
                :to="`/settings/accounts/${account.id}/authorization`"
                class="btn btn-secondary btn-sm"
                >Manage</RouterLink
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <ControlSection v-else title="No Hyperliquid accounts">
    <p class="control-copy">Add a Hyperliquid account before wallet authorization is available.</p>
    <div class="control-actions">
      <RouterLink to="/settings/accounts" class="btn btn-primary btn-sm"
        >Add trading account</RouterLink
      >
    </div>
  </ControlSection>
</template>

<style scoped>
.connection-toolbar,
.connection-card__header,
.connection-actions,
.remote-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.connection-toolbar .btn {
  white-space: nowrap;
}
.connection-list {
  display: grid;
  gap: 1rem;
}
.connection-card {
  border: 1px solid var(--border-normal);
  background: var(--surface-sunken);
  padding: 1rem;
}
.connection-card__header code,
.remote-slot code {
  display: block;
  margin-top: 0.3rem;
  color: var(--fg-muted);
  font-size: 0.75rem;
}
.connection-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.connection-facts div {
  min-width: 0;
}
.connection-facts dt,
.remote-slots__title {
  color: var(--fg-muted);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.connection-facts dd {
  margin: 0.25rem 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.connection-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-normal);
}
.remote-slots {
  padding-top: 1rem;
}
.remote-slot-list {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.remote-slot {
  padding: 0.55rem 0.7rem;
  background: var(--surface-base);
  border: 1px solid var(--border-normal);
}
.connection-error {
  margin: 0.75rem 0;
  color: var(--state-error);
  font-size: 0.8rem;
}
.authorization-account-cell {
  box-shadow: inset 3px 0 0 var(--account-context-color);
  padding-left: 0.85rem;
}
@media (max-width: 900px) {
  .connection-facts {
    grid-template-columns: 1fr 1fr;
  }
  .connection-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
