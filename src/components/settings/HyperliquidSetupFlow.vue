<script setup lang="ts">
import { computed } from 'vue'
import { Check, LockKeyhole } from 'lucide-vue-next'
import GuidedAction from '@/components/forms/GuidedAction.vue'
import { accountMetadataChips, type AccountRecord } from '@/stores/accounts'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import { HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS } from '@/lib/hyperliquidBuilderApproval'

type ApprovalFeedback = { kind: 'info' | 'success' | 'error'; message: string }

const props = defineProps<{
  account: AccountRecord
  canRotateAgent: boolean
  canApproveAgent: boolean
  canRefreshAgent: boolean
  canApproveBuilder: boolean
  canRefreshBuilder: boolean
  rotatingAgent: boolean
  approvingAgent: boolean
  refreshingAgent: boolean
  approvingBuilder: boolean
  refreshingBuilder: boolean
  agentFeedback?: ApprovalFeedback
  builderFeedback?: ApprovalFeedback
}>()

defineEmits<{
  rotateAgent: []
  approveAgent: []
  refreshAgent: []
  approveBuilder: []
  refreshBuilder: []
}>()

const identityComplete = computed(() => Boolean(props.account.exchange_metadata?.user_address))
const agentComplete = computed(() => props.account.exchange_metadata?.agent_approved === true)
const builderComplete = computed(() => props.account.exchange_metadata?.builder_approved === true)
const agentCurrent = computed(() => identityComplete.value && !agentComplete.value)
const builderCurrent = computed(() => agentComplete.value && !builderComplete.value)
const setupComplete = computed(
  () => identityComplete.value && agentComplete.value && builderComplete.value,
)

function feedbackClass(feedback: ApprovalFeedback | undefined): string {
  if (feedback?.kind === 'success') return 'setup-feedback--success'
  if (feedback?.kind === 'error') return 'setup-feedback--error'
  return ''
}

function builderApprovalLabel(): string {
  return `${(HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS / 10).toFixed(1)} bps`
}

function approvedBuilderMaxLabel(): string {
  const metadata = props.account.exchange_metadata
  if (metadata?.builder_approved !== true) return 'not verified'
  return `${((metadata.max_builder_fee_tenths_bps ?? 0) / 10).toFixed(1)} bps`
}
</script>

<template>
  <section class="setup-flow" aria-label="Hyperliquid account setup">
    <header class="setup-flow__header">
      <div>
        <strong>{{ setupComplete ? 'Account setup complete' : 'Finish account setup' }}</strong>
        <p>
          {{
            setupComplete
              ? 'This account is authorized and ready for Trad to connect.'
              : 'Complete these steps in order. The highlighted action is what you need to do next.'
          }}
        </p>
      </div>
      <span class="pill" :class="setupComplete ? 'pill-ok' : 'pill-warn'">
        {{
          setupComplete
            ? 'ready'
            : `${Number(identityComplete) + Number(agentComplete) + Number(builderComplete)} of 3`
        }}
      </span>
    </header>

    <ol class="setup-flow__steps">
      <li
        class="setup-step"
        :class="{
          'setup-step--complete': identityComplete,
          'setup-step--current': !identityComplete,
        }"
      >
        <div class="setup-step__rail">
          <span class="setup-step__number">
            <Check v-if="identityComplete" :size="14" />
            <span v-else>1</span>
          </span>
        </div>
        <div class="setup-step__card">
          <header class="setup-step__heading">
            <div>
              <span class="setup-step__eyebrow">Step 1</span>
              <h3>Account details</h3>
              <p>Your Hyperliquid account identity and Trad label are saved.</p>
            </div>
            <span
              class="pill setup-step__status"
              :class="identityComplete ? 'pill-ok' : 'pill-warn'"
            >
              {{ identityComplete ? 'complete' : 'required' }}
            </span>
          </header>
          <div class="setup-identity">
            <div>
              <span class="setup-label">Account</span>
              <strong>{{ account.label }}</strong>
            </div>
            <div>
              <span class="setup-label">User wallet</span>
              <code>{{ account.exchange_metadata?.user_address || 'missing' }}</code>
            </div>
            <div class="setup-chip-row">
              <span v-for="chip in accountMetadataChips(account)" :key="chip" class="chip">
                {{ chip }}
              </span>
            </div>
          </div>
        </div>
      </li>

      <li
        class="setup-step"
        :class="{
          'setup-step--complete': agentComplete,
          'setup-step--current': agentCurrent,
          'setup-step--pending': !identityComplete,
        }"
      >
        <div class="setup-step__rail">
          <span class="setup-step__number">
            <Check v-if="agentComplete" :size="14" />
            <span v-else>2</span>
          </span>
        </div>
        <div class="setup-step__card">
          <header class="setup-step__heading">
            <div>
              <span class="setup-step__eyebrow">Step 2</span>
              <h3>Approve the agent wallet</h3>
              <p>
                The agent lets Trad submit trading actions without asking your main wallet to sign
                every order. Your wallet will open once for this authorization.
              </p>
            </div>
            <span
              class="pill setup-step__status"
              :class="agentComplete ? 'pill-ok' : agentCurrent ? 'pill-warn' : ''"
            >
              {{ agentComplete ? 'complete' : agentCurrent ? 'current' : 'waiting' }}
            </span>
          </header>
          <div class="setup-action-row">
            <div class="setup-value">
              <span class="setup-label">Trad agent wallet</span>
              <code>{{ account.exchange_metadata?.agent_address || 'missing' }}</code>
              <span>Status: {{ agentComplete ? 'approved' : 'approval required' }}</span>
            </div>
            <div class="setup-actions">
              <button
                class="btn btn-secondary btn-xs"
                type="button"
                :disabled="!canRotateAgent"
                title="Replace this unapproved agent with a newly generated one"
                @click="$emit('rotateAgent')"
              >
                {{ rotatingAgent ? 'Generating' : 'Generate replacement' }}
              </button>
              <button
                class="btn btn-secondary btn-xs"
                type="button"
                :disabled="!canRefreshAgent"
                title="Check whether Hyperliquid already has this approval"
                @click="$emit('refreshAgent')"
              >
                {{ refreshingAgent ? 'Checking' : 'Refresh status' }}
              </button>
              <GuidedAction :active="agentCurrent && canApproveAgent" label="Do this next">
                <button
                  class="btn btn-primary btn-xs"
                  type="button"
                  :disabled="!canApproveAgent || !agentCurrent"
                  @click="$emit('approveAgent')"
                >
                  {{ approvingAgent ? 'Approving' : 'Approve agent' }}
                </button>
              </GuidedAction>
            </div>
          </div>
          <p
            v-if="agentFeedback"
            class="setup-feedback"
            :class="feedbackClass(agentFeedback)"
            role="status"
            aria-live="polite"
          >
            {{ agentFeedback.message }}
          </p>
        </div>
      </li>

      <li
        class="setup-step"
        :class="{
          'setup-step--complete': builderComplete,
          'setup-step--current': builderCurrent,
          'setup-step--pending': !agentComplete,
        }"
      >
        <div class="setup-step__rail">
          <span class="setup-step__number">
            <Check v-if="builderComplete" :size="14" />
            <LockKeyhole v-else-if="!agentComplete" :size="13" />
            <span v-else>3</span>
          </span>
        </div>
        <div class="setup-step__card">
          <header class="setup-step__heading">
            <div>
              <span class="setup-step__eyebrow">Step 3</span>
              <h3>Authorize the Trad builder</h3>
              <p>
                This one-time wallet approval allows Trad to attach its builder fee. You approve a
                10.0 bps ceiling; the current Trad target remains
                {{ (hyperliquidTargetTotalTenthsBps(account.exchange_metadata) / 10).toFixed(1) }}
                bps total per side.
              </p>
            </div>
            <span
              class="pill setup-step__status"
              :class="builderComplete ? 'pill-ok' : builderCurrent ? 'pill-warn' : ''"
            >
              {{ builderComplete ? 'complete' : builderCurrent ? 'current' : 'waiting' }}
            </span>
          </header>
          <div class="setup-action-row">
            <div class="setup-value">
              <span class="setup-label">Trad builder address</span>
              <code>{{ account.exchange_metadata?.builder_address || 'not configured' }}</code>
              <span>Approved ceiling: {{ approvedBuilderMaxLabel() }}</span>
            </div>
            <div class="setup-actions">
              <button
                class="btn btn-secondary btn-xs"
                type="button"
                :disabled="!canRefreshBuilder || !agentComplete"
                title="Check whether Hyperliquid already has this approval"
                @click="$emit('refreshBuilder')"
              >
                {{ refreshingBuilder ? 'Checking' : 'Refresh status' }}
              </button>
              <GuidedAction :active="builderCurrent && canApproveBuilder" label="Final step">
                <button
                  class="btn btn-primary btn-xs"
                  type="button"
                  :disabled="!canApproveBuilder || !builderCurrent"
                  @click="$emit('approveBuilder')"
                >
                  {{ approvingBuilder ? 'Approving' : `Approve ${builderApprovalLabel()}` }}
                </button>
              </GuidedAction>
            </div>
          </div>
          <p
            v-if="builderFeedback"
            class="setup-feedback"
            :class="feedbackClass(builderFeedback)"
            role="status"
            aria-live="polite"
          >
            {{ builderFeedback.message }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped src="./HyperliquidSetupFlow.css"></style>
