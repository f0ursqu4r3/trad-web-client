<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Link2, RefreshCw, Trash2 } from 'lucide-vue-next'
import ControlSection from '@/components/control/ControlSection.vue'
import {
  forgetHyperliquidAgentConnection,
  listHyperliquidAgentConnections,
  refreshHyperliquidAgentConnection,
  type HyperliquidAgentConnection,
} from '@/lib/gateway/hyperliquidAgentConnections'

const emit = defineEmits<{ reconnect: [connection: HyperliquidAgentConnection] }>()

const connections = ref<HyperliquidAgentConnection[]>([])
const loading = ref(false)
const busyCredential = ref<string | null>(null)
const error = ref<string | null>(null)
const detached = computed(() =>
  connections.value.filter((connection) => connection.attached_accounts === 0),
)

onMounted(refresh)
defineExpose({ refresh })

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    connections.value = await listHyperliquidAgentConnections()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    loading.value = false
  }
}

async function refreshConnection(connection: HyperliquidAgentConnection): Promise<void> {
  await run(connection, () => refreshHyperliquidAgentConnection(connection.credential_id))
}

async function forgetConnection(connection: HyperliquidAgentConnection): Promise<void> {
  const confirmed = window.confirm(
    `Forget Trad’s encrypted signing key for ${connection.user_address}? Hyperliquid’s remote agent slot will remain untouched.`,
  )
  if (!confirmed) return
  await run(connection, () => forgetHyperliquidAgentConnection(connection.credential_id))
}

async function run(
  connection: HyperliquidAgentConnection,
  action: () => Promise<unknown>,
): Promise<void> {
  busyCredential.value = connection.credential_id
  error.value = null
  try {
    await action()
    await refresh()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    busyCredential.value = null
  }
}
</script>

<template>
  <ControlSection
    v-if="detached.length || error"
    title="Saved wallet connections"
    description="Detached keys are retained so removing and re-adding an account does not consume another Hyperliquid agent slot."
  >
    <template #actions>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="refresh">
        <RefreshCw :size="13" /> {{ loading ? 'Checking' : 'Refresh' }}
      </button>
    </template>
    <p v-if="error" class="control-notice control-notice--error" role="alert">{{ error }}</p>
    <div v-if="detached.length" class="detached-connections">
      <article
        v-for="connection in detached"
        :key="connection.credential_id"
        class="detached-connection"
      >
        <div class="detached-connection__identity">
          <strong>{{ connection.network }} Hyperliquid wallet</strong>
          <code>{{ connection.user_address }}</code>
          <span>
            Saved slot {{ connection.agent_name }} ·
            {{ connection.approved ? 'recognized by Hyperliquid' : 'approval required' }}
          </span>
        </div>
        <div class="detached-connection__actions">
          <button
            class="btn btn-secondary btn-xs"
            type="button"
            :disabled="busyCredential === connection.credential_id"
            @click="refreshConnection(connection)"
          >
            <RefreshCw :size="13" /> Refresh
          </button>
          <button
            class="btn btn-primary btn-xs"
            type="button"
            @click="emit('reconnect', connection)"
          >
            <Link2 :size="13" /> Reconnect account
          </button>
          <button
            class="btn btn-danger btn-xs"
            type="button"
            :disabled="busyCredential === connection.credential_id"
            @click="forgetConnection(connection)"
          >
            <Trash2 :size="13" /> Forget local key
          </button>
        </div>
      </article>
    </div>
  </ControlSection>
</template>

<style scoped>
.detached-connections {
  border: 1px solid var(--border-normal);
}
.detached-connection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 72px;
  padding: 0.75rem;
}
.detached-connection + .detached-connection {
  border-top: 1px solid var(--border-normal);
}
.detached-connection__identity strong,
.detached-connection__identity code,
.detached-connection__identity span {
  display: block;
}
.detached-connection__identity strong,
.detached-connection__identity code {
  color: var(--fg-strong);
  font-size: 12px;
}
.detached-connection__identity code {
  margin-top: 0.2rem;
  overflow-wrap: anywhere;
}
.detached-connection__identity span {
  margin-top: 0.2rem;
  color: var(--fg-muted);
  font-size: 12px;
}
.detached-connection__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}
@media (max-width: 760px) {
  .detached-connection {
    align-items: stretch;
    flex-direction: column;
  }
  .detached-connection__actions {
    justify-content: flex-start;
  }
}
</style>
