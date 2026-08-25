<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, Check, CircleCheckBig, LockKeyhole } from 'lucide-vue-next'
import GuidedAction from '@/components/forms/GuidedAction.vue'
import HyperliquidSigningConnection from '@/components/settings/HyperliquidSigningConnection.vue'
import {
  accountMetadataChips,
  isHyperliquidAgentAuthorizationCurrent,
  isHyperliquidBuilderAuthorizationCurrent,
  isHyperliquidMetadataReady,
  type AccountRecord,
} from '@/stores/accounts'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import { HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS } from '@/lib/hyperliquidBuilderApproval'

type ApprovalFeedback = { kind: 'info' | 'success' | 'error'; message: string }

const props = defineProps<{
  account: AccountRecord
  canApproveAgent: boolean
  canApproveBuilder: boolean
  canRefreshBuilder: boolean
  approvingAgent: boolean
  approvingBuilder: boolean
  refreshingBuilder: boolean
  agentFeedback?: ApprovalFeedback
  agentApprovalVersion: number
  builderFeedback?: ApprovalFeedback
  showTerminalHandoff?: boolean
}>()

defineEmits<{
  approveAgent: []
  approveBuilder: []
  refreshBuilder: []
}>()

const identityComplete = computed(() => Boolean(props.account.exchange_metadata?.user_address))
const agentComplete = computed(() => isHyperliquidAgentAuthorizationCurrent(props.account))
const builderComplete = computed(() => isHyperliquidBuilderAuthorizationCurrent(props.account))
const agentCurrent = computed(() => identityComplete.value && !agentComplete.value)
const builderCurrent = computed(() => agentComplete.value && !builderComplete.value)
const setupComplete = computed(() => isHyperliquidMetadataReady(props.account))
const connectionApprovalReady = ref(false)
const canSubmitAgentApproval = computed(
  () => props.canApproveAgent && connectionApprovalReady.value,
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
              <h3>Connect Trad to Hyperliquid</h3>
              <p>
                Trad prepares the secure signing connection automatically. You approve it once in
                your wallet; Trad only asks you to choose when all Hyperliquid connections are
                occupied.
              </p>
            </div>
            <span
              class="pill setup-step__status"
              :class="agentComplete ? 'pill-ok' : agentCurrent ? 'pill-warn' : ''"
            >
              {{ agentComplete ? 'complete' : agentCurrent ? 'current' : 'waiting' }}
            </span>
          </header>
          <HyperliquidSigningConnection
            :account="account"
            :locked="agentComplete"
            :approval-version="agentApprovalVersion"
            @approval-ready="connectionApprovalReady = $event"
          />
          <div class="setup-action-row setup-action-row--approval">
            <div class="setup-value">
              <span class="setup-label">Connection approval</span>
              <span v-if="agentComplete">Trad is connected.</span>
              <span v-else-if="connectionApprovalReady">
                Everything is ready. Confirm the connection once in your wallet.
              </span>
              <span v-else>Choose a Hyperliquid connection above for Trad to replace.</span>
            </div>
            <div class="setup-actions">
              <GuidedAction :active="agentCurrent && canSubmitAgentApproval" label="Do this next">
                <button
                  class="btn btn-primary btn-xs"
                  type="button"
                  :disabled="!canSubmitAgentApproval || !agentCurrent"
                  @click="$emit('approveAgent')"
                >
                  {{ approvingAgent ? 'Connecting' : agentComplete ? 'Connected' : 'Connect Trad' }}
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
                  {{
                    approvingBuilder
                      ? 'Approving'
                      : builderComplete
                        ? 'Builder approved'
                        : `Approve ${builderApprovalLabel()}`
                  }}
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
    <div v-if="setupComplete && showTerminalHandoff" class="setup-handoff" role="status">
      <CircleCheckBig :size="22" aria-hidden="true" />
      <div>
        <strong>Nice — you’re ready to trade.</strong>
        <p>Your first account is connected. Open the terminal and place your first trade.</p>
      </div>
      <RouterLink class="btn btn-primary" to="/terminal?start=trade">
        Create first trade <ArrowRight :size="14" />
      </RouterLink>
    </div>
  </section>
</template>

<style scoped src="./HyperliquidSetupFlow.css"></style>
