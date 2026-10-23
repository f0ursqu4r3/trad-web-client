<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AccountRecord } from '@/stores/accounts'
import { useAccountsStore } from '@/stores/accounts'
import { hyperliquidAgentExpiryState, formatRemaining } from '@/lib/agentExpiry'
import { signHyperliquidAgentApproval } from '@/lib/hyperliquidBuilderApproval'
import {
  listHyperliquidAgentConnections,
  type HyperliquidAgentConnection,
} from '@/lib/gateway/hyperliquidAgentConnections'
import {
  cancelAgentRenewal,
  connectionForAccount,
  renewalProblemKind,
  renewalProblemText,
  renewalSlotChoices,
  startAgentRenewal,
  submitAgentRenewalApproval,
  verifyAgentRenewal,
  type RenewalAnswer,
  type RenewalProblemKind,
} from '@/lib/gateway/hyperliquidAgentRenewal'

// Renews the account's approved agent before it expires: Trad keeps a
// replacement key beside the active one, the user approves it in their
// wallet, and the Gateway switches once Hyperliquid lists it. The active
// agent signs throughout, so exits never lose their signer.
const props = defineProps<{ account: AccountRecord }>()
const accounts = useAccountsStore()
const route = useRoute()
const router = useRouter()

const connection = ref<HyperliquidAgentConnection | null>(null)
const busy = ref<null | 'start' | 'sign' | 'verify' | 'cancel'>(null)
const problem = ref<{ kind: RenewalProblemKind; text: string } | null>(null)
const success = ref<string | null>(null)
const now = ref(Date.now())
let timer: number | null = null

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const pending = computed(() => connection.value?.renewal ?? null)
const validUntilMs = computed(
  () => connection.value?.valid_until_ms ?? props.account.exchange_metadata?.agent_valid_until_ms,
)
const expiryState = computed(() => hyperliquidAgentExpiryState(validUntilMs.value, now.value))
const highlighted = computed(
  () => expiryState.value !== 'unbounded' && expiryState.value !== 'valid',
)
const expiryText = computed(() => {
  const until = validUntilMs.value
  if (typeof until !== 'number') return 'Hyperliquid reports no expiry for the active agent.'
  if (until <= now.value) return `The active agent expired ${timeFormat.format(until)}.`
  return `The active agent expires in ${formatRemaining(until - now.value)} (${timeFormat.format(until)}).`
})
const slotChoices = computed(() =>
  connection.value && problem.value?.kind === 'choose_slot'
    ? renewalSlotChoices(connection.value)
    : [],
)

async function loadConnection(): Promise<void> {
  try {
    const listing = await listHyperliquidAgentConnections()
    connection.value = connectionForAccount(
      listing,
      props.account.network,
      props.account.exchange_metadata?.user_address,
    )
  } catch (error) {
    problem.value = { kind: 'plain', text: error instanceof Error ? error.message : String(error) }
  }
}

async function handle(answer: RenewalAnswer): Promise<void> {
  if (!connection.value) return
  if (answer.state === 'awaiting_approval') {
    connection.value = { ...connection.value, renewal: answer.renewal }
    return
  }
  if (answer.state === 'switched') {
    const until = answer.credential.valid_until_ms
    success.value =
      `Agent renewed. Trad now signs with ${answer.credential.agent_name} ` +
      `(${answer.credential.agent_address})` +
      (typeof until === 'number' ? `, valid until ${timeFormat.format(until)}.` : '.')
    await accounts.fetchAccounts()
    await loadConnection()
    return
  }
  const kind = renewalProblemKind(answer.code)
  problem.value = { kind, text: renewalProblemText(answer.code, answer.message) }
  if (kind === 'reload') await loadConnection()
}

async function run(step: NonNullable<typeof busy.value>, work: () => Promise<void>) {
  if (busy.value) return
  busy.value = step
  problem.value = null
  success.value = null
  try {
    await work()
  } catch (error) {
    problem.value = { kind: 'plain', text: error instanceof Error ? error.message : String(error) }
  } finally {
    busy.value = null
  }
}

function start(agentName?: string) {
  const credential = connection.value
  if (!credential) return
  void run('start', async () =>
    handle(await startAgentRenewal(credential.credential_id, agentName)),
  )
}

function approve() {
  const credential = connection.value
  const renewal = pending.value
  if (!credential || !renewal) return
  void run('sign', async () => {
    // exactly the pending name: Hyperliquid's own expiry applies
    const signed = await signHyperliquidAgentApproval({
      network: props.account.network,
      userAddress: credential.user_address,
      agentAddress: renewal.agent_address,
      agentName: renewal.agent_name,
    })
    await handle(await submitAgentRenewalApproval(credential.credential_id, renewal, signed))
  })
}

function verify() {
  const credential = connection.value
  if (!credential) return
  void run('verify', async () => handle(await verifyAgentRenewal(credential.credential_id)))
}

function cancel() {
  const credential = connection.value
  if (!credential) return
  void run('cancel', async () => {
    const failure = await cancelAgentRenewal(credential.credential_id)
    if (failure) problem.value = { kind: 'plain', text: failure }
    await loadConnection()
  })
}

// The expiry banner links here with ?renew=1 to start at once (also from
// this page's own banner, which only changes the query).
function startFromLink() {
  if (route.query.renew !== '1') return
  const query = { ...route.query }
  delete query.renew
  void router.replace({ query })
  if (connection.value?.approved && !pending.value) start()
}

onMounted(async () => {
  timer = window.setInterval(() => (now.value = Date.now()), 30_000)
  await loadConnection()
  startFromLink()
})
watch(() => route.query.renew, startFromLink)
onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer)
})
</script>

<template>
  <section
    v-if="connection && (connection.approved || pending)"
    class="agent-renewal"
    :class="{ 'agent-renewal--due': highlighted }"
    data-testid="agent-renewal"
  >
    <div class="agent-renewal__head">
      <strong>Agent renewal</strong>
      <span>{{ expiryText }}</span>
    </div>

    <template v-if="pending">
      <p class="agent-renewal__text">
        Replacement agent <code>{{ pending.agent_name }}</code> (<code class="break-all">{{
          pending.agent_address
        }}</code
        >) waits for your wallet approval. Trad switches to it once Hyperliquid lists it; the active
        agent signs until then.
      </p>
      <div class="agent-renewal__actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="busy !== null"
          @click="approve"
        >
          {{ busy === 'sign' ? 'Waiting for wallet' : 'Approve in wallet' }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busy !== null"
          @click="verify"
        >
          {{ busy === 'verify' ? 'Checking' : 'Check again' }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busy !== null"
          @click="cancel"
        >
          Cancel renewal
        </button>
      </div>
    </template>
    <template v-else>
      <p class="agent-renewal__text">
        Approve a replacement agent in your wallet before this one expires. Trad switches every
        account using it once Hyperliquid lists the replacement; exits keep signing throughout.
      </p>
      <div class="agent-renewal__actions">
        <button
          type="button"
          class="btn btn-sm"
          :class="highlighted ? 'btn-primary' : 'btn-secondary'"
          :disabled="busy !== null"
          @click="start()"
        >
          {{ busy === 'start' ? 'Preparing' : 'Renew agent' }}
        </button>
      </div>
    </template>

    <div
      v-if="problem"
      class="agent-renewal__problem"
      :class="{
        'agent-renewal__problem--next-step':
          problem.kind === 'choose_slot' || problem.kind === 'check_again',
      }"
      role="alert"
    >
      <p class="m-0">{{ problem.text }}</p>
      <div v-if="slotChoices.length > 0" class="agent-renewal__actions">
        <button
          v-for="name in slotChoices"
          :key="name"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busy !== null"
          @click="start(name)"
        >
          Use slot {{ name }}
        </button>
      </div>
    </div>
    <p v-if="success" class="notice-ok m-0" role="status">{{ success }}</p>
  </section>
</template>

<style scoped>
.agent-renewal {
  --_tone: var(--border-normal);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
  padding: 0.75rem;
  font-size: 12px;
  line-height: 1.45;
  background: var(--surface-base);
  border: 1px solid var(--_tone);
}
.agent-renewal--due {
  --_tone: var(--state-warning);
  border-left-width: 3px;
}
.agent-renewal__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
}
.agent-renewal__text {
  margin: 0;
}
.agent-renewal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.agent-renewal__problem {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--state-error);
}
.agent-renewal__problem--next-step {
  padding-left: 0.6rem;
  color: inherit;
  border-left: 2px solid var(--state-warning);
}
</style>
