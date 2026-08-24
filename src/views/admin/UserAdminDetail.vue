<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAdminStore, type BillingOperation, type UserEntitlementDetail } from '@/stores/admin'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const route = useRoute()
const admin = useAdminStore()
const userId = computed(() => String(route.params.userId))
const user = computed(() => admin.users.find((entry) => entry.user_id === userId.value))
const detail = ref<UserEntitlementDetail | null>(null)
const kind = ref<'complimentary' | 'deny'>('complimentary')
const planIdentity = ref('private_beta:1')
const reason = ref('')
const builderTargetMode = ref<'inherit' | 'override'>('inherit')
const builderTargetBps = ref('5.2')
const savingBuilderTarget = ref(false)
const expiry = ref('')
const operations = ref<BillingOperation[]>([])
const userAudit = computed(() => {
  const grantIds = new Set(detail.value?.grants.map((grantItem) => grantItem.id) || [])
  return admin.audit.filter(
    (event) => event.target_id === userId.value || grantIds.has(event.target_id),
  )
})
const operationKind = ref<
  | 'cancel_at_period_end'
  | 'cancel_now'
  | 'change_plan_now'
  | 'change_plan_at_period_end'
  | 'credit'
  | 'refund'
>('cancel_at_period_end')
const operationPrice = ref('')
const operationObjectId = ref('')
const operationAmount = ref('')
const operationMemo = ref('')
const operationReason = ref('requested_by_customer')
const operationConfirmed = ref(false)

async function refresh() {
  await Promise.all([admin.fetchUsers(), admin.fetchAudit()])
  ;[detail.value, operations.value] = await Promise.all([
    admin.fetchUserEntitlement(userId.value),
    admin.fetchBillingOperations(userId.value),
  ])
  const override = detail.value?.effective.builder_target_override_tenths_bps
  builderTargetMode.value = override == null ? 'inherit' : 'override'
  builderTargetBps.value = String(
    (override ?? admin.policy?.hyperliquid_target_total_tenths_bps ?? 52) / 10,
  )
}
const parsedBuilderTarget = computed(() => {
  if (builderTargetBps.value.trim() === '') return null
  const value = Number(builderTargetBps.value)
  return Number.isFinite(value) && value >= 0 && value <= 6_553.5 ? value : null
})
const builderTargetValid = computed(
  () => builderTargetMode.value === 'inherit' || parsedBuilderTarget.value !== null,
)
async function saveBuilderTarget() {
  if (!builderTargetValid.value) return
  savingBuilderTarget.value = true
  try {
    await admin.updateUserBuilderTarget(
      userId.value,
      builderTargetMode.value === 'override' && parsedBuilderTarget.value !== null
        ? Math.round(parsedBuilderTarget.value * 10)
        : null,
    )
    await refresh()
  } finally {
    savingBuilderTarget.value = false
  }
}

function numericDraft(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value
}
async function executeBillingOperation() {
  if (!operationConfirmed.value) return
  const request =
    operationKind.value === 'change_plan_now' || operationKind.value === 'change_plan_at_period_end'
      ? { kind: operationKind.value, price_id: operationPrice.value }
      : operationKind.value === 'credit'
        ? {
            kind: operationKind.value,
            invoice_id: operationObjectId.value,
            amount: Number(operationAmount.value),
            memo: operationMemo.value,
          }
        : operationKind.value === 'refund'
          ? {
              kind: operationKind.value,
              payment_intent_id: operationObjectId.value,
              amount: operationAmount.value ? Number(operationAmount.value) : undefined,
              reason: operationReason.value,
            }
          : { kind: operationKind.value }
  await admin.executeBillingOperation(userId.value, request)
  operationConfirmed.value = false
  await refresh()
}
const operationReady = computed(() => {
  if (!operationConfirmed.value) return false
  if (
    operationKind.value === 'change_plan_now' ||
    operationKind.value === 'change_plan_at_period_end'
  )
    return Boolean(operationPrice.value)
  if (operationKind.value === 'credit')
    return Boolean(
      operationObjectId.value && Number(operationAmount.value) > 0 && operationMemo.value,
    )
  if (operationKind.value === 'refund')
    return Boolean(
      operationObjectId.value && (!operationAmount.value || Number(operationAmount.value) > 0),
    )
  return true
})
async function grant() {
  const [planKey, version] = planIdentity.value.split(':')
  await admin.createGrant(userId.value, {
    kind: kind.value,
    plan_key: kind.value === 'complimentary' ? planKey : undefined,
    plan_version: kind.value === 'complimentary' ? Number(version) : undefined,
    reason: reason.value,
    expires_at: expiry.value ? new Date(expiry.value).toISOString() : undefined,
  })
  reason.value = ''
  await refresh()
}
async function revoke(grantId: string) {
  await admin.revokeGrant(grantId)
  await refresh()
}
onMounted(async () => {
  await Promise.all([admin.fetchCommercialPlans(), admin.fetchPolicy(), refresh()])
  const first = admin.commercialPlans.find((plan) => plan.state !== 'draft')
  if (first) planIdentity.value = `${first.key}:${first.version}`
})
</script>

<template>
  <ControlPageHeader
    eyebrow="Administration / User"
    :title="user?.email || 'User access'"
    description="Explain and manage this user’s commercial access without rewriting Stripe state."
  />
  <RouterLink to="/admin/users" class="text-link inline-block mb-4">← User directory</RouterLink>
  <ControlSection title="Effective entitlement">
    <div v-if="detail" class="control-detail-grid">
      <div>
        <span>Decision</span
        ><strong
          ><span class="pill" :class="detail.effective.entitled ? 'pill-ok' : 'pill-err'">{{
            detail.effective.reason.replace(/_/g, ' ')
          }}</span></strong
        >
      </div>
      <div>
        <span>Source</span><strong>{{ detail.effective.source.replace(/_/g, ' ') }}</strong>
      </div>
      <div>
        <span>Plan</span
        ><strong>{{
          detail.effective.plan
            ? `${detail.effective.plan.display_name} v${detail.effective.plan.version}`
            : '—'
        }}</strong>
      </div>
      <div>
        <span>Subscription</span
        ><strong>{{ detail.effective.subscription_status || 'none' }}</strong>
      </div>
      <div>
        <span>Accounts</span
        ><strong
          >{{ detail.account_count }} /
          {{ detail.effective.plan?.max_accounts ?? 'unlimited' }}</strong
        >
      </div>
      <div>
        <span>User all-in default</span
        ><strong>{{
          detail.effective.builder_target_override_tenths_bps == null
            ? 'inherits global'
            : `${(detail.effective.builder_target_override_tenths_bps / 10).toFixed(1)} bps`
        }}</strong>
      </div>
      <div>
        <span>Stripe customer</span
        ><strong>{{ detail.billing_customer?.stripe_customer_id || '—' }}</strong>
      </div>
      <div>
        <span>Stripe subscription</span
        ><strong>{{ detail.subscription?.stripe_subscription_id || '—' }}</strong>
      </div>
      <div>
        <span>Period end</span
        ><strong>{{
          detail.subscription?.current_period_end
            ? new Date(detail.subscription.current_period_end).toLocaleString()
            : '—'
        }}</strong>
      </div>
    </div>
  </ControlSection>
  <ControlSection
    title="User-wide all-in default"
    description="Overrides the global default for this user. A trading account can still have its own administrator-set override."
  >
    <div class="control-form-grid max-w-3xl">
      <label class="field"
        ><span>Source</span
        ><select v-model="builderTargetMode" class="input">
          <option value="inherit">Inherit global default</option>
          <option value="override">Set user default</option>
        </select></label
      >
      <label class="field"
        ><span>All-in total / side (bps)</span
        ><input
          :value="builderTargetBps"
          class="input"
          type="number"
          min="0"
          max="6553.5"
          step="0.1"
          :disabled="builderTargetMode === 'inherit'"
          @input="builderTargetBps = numericDraft($event)"
        /><span
          >Exchange fee plus Trad builder fee. The venue limits only Trad’s builder component to 10
          bps.</span
        ></label
      >
    </div>
    <div class="control-actions">
      <button
        class="btn btn-primary"
        :disabled="!builderTargetValid || savingBuilderTarget"
        @click="saveBuilderTarget"
      >
        Save user target
      </button>
    </div>
  </ControlSection>
  <ControlSection
    title="Grant or deny access"
    description="An active denial wins over paid and complimentary access."
  >
    <div class="control-form-grid">
      <label class="field"
        ><span>Decision</span
        ><select v-model="kind" class="input">
          <option value="complimentary">Complimentary plan</option>
          <option value="deny">Explicit denial</option>
        </select></label
      >
      <label v-if="kind === 'complimentary'" class="field"
        ><span>Plan version</span
        ><select v-model="planIdentity" class="input">
          <option
            v-for="plan in admin.commercialPlans.filter((item) => item.state !== 'draft')"
            :key="`${plan.key}:${plan.version}`"
            :value="`${plan.key}:${plan.version}`"
          >
            {{ plan.display_name }} v{{ plan.version }}
          </option>
        </select></label
      >
      <label class="field"
        ><span>Expires</span><input v-model="expiry" type="datetime-local" class="input" /><span
          >Optional.</span
        ></label
      >
      <label class="field"><span>Reason</span><input v-model.trim="reason" class="input" /></label>
    </div>
    <div class="control-actions">
      <button class="btn btn-primary" :disabled="!reason" @click="grant">
        Apply audited decision
      </button>
    </div>
  </ControlSection>
  <ControlSection title="Grant history">
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[760px]">
        <thead>
          <tr>
            <th>Decision</th>
            <th>Plan</th>
            <th>Reason</th>
            <th>Started</th>
            <th>Expires</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="grantItem in detail?.grants || []" :key="grantItem.id">
            <td>{{ grantItem.kind }}</td>
            <td>
              {{ grantItem.plan_key ? `${grantItem.plan_key} v${grantItem.plan_version}` : '—' }}
            </td>
            <td>{{ grantItem.reason }}</td>
            <td>{{ new Date(grantItem.starts_at).toLocaleString() }}</td>
            <td>
              {{ grantItem.expires_at ? new Date(grantItem.expires_at).toLocaleString() : '—' }}
            </td>
            <td>
              <span class="pill" :class="grantItem.revoked_at ? 'pill' : 'pill-ok'">{{
                grantItem.revoked_at ? 'revoked' : 'active'
              }}</span>
            </td>
            <td>
              <button
                v-if="!grantItem.revoked_at"
                class="btn btn-secondary btn-xs"
                @click="revoke(grantItem.id)"
              >
                Revoke
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <ControlSection
    title="Billing operations"
    description="Each request is idempotent. Stripe webhooks remain authoritative for resulting access."
  >
    <div class="control-form-grid">
      <label class="field"
        ><span>Operation</span
        ><select v-model="operationKind" class="input">
          <option value="change_plan_now">Change plan now</option>
          <option value="change_plan_at_period_end">Change at period end</option>
          <option value="cancel_at_period_end">Cancel at period end</option>
          <option value="cancel_now">Cancel now</option>
          <option value="credit">Issue invoice credit</option>
          <option value="refund">Issue cash refund</option>
        </select></label
      >
      <label
        v-if="operationKind === 'change_plan_now' || operationKind === 'change_plan_at_period_end'"
        class="field"
        ><span>Stripe price ID</span><input v-model.trim="operationPrice" class="input"
      /></label>
      <label v-if="operationKind === 'credit'" class="field"
        ><span>Invoice ID</span><input v-model.trim="operationObjectId" class="input"
      /></label>
      <label v-if="operationKind === 'refund'" class="field"
        ><span>Payment intent ID</span><input v-model.trim="operationObjectId" class="input"
      /></label>
      <label v-if="operationKind === 'credit' || operationKind === 'refund'" class="field"
        ><span>Amount (minor units)</span
        ><input v-model.trim="operationAmount" inputmode="numeric" class="input" /><span>{{
          operationKind === 'refund' ? 'Blank refunds the full payment.' : 'Required.'
        }}</span></label
      >
      <label v-if="operationKind === 'credit'" class="field"
        ><span>Memo</span><input v-model.trim="operationMemo" class="input"
      /></label>
      <label v-if="operationKind === 'refund'" class="field"
        ><span>Reason</span
        ><select v-model="operationReason" class="input">
          <option value="requested_by_customer">Requested by customer</option>
          <option value="duplicate">Duplicate</option>
          <option value="fraudulent">Fraudulent</option>
        </select></label
      >
    </div>
    <label class="inline-flex min-h-7 items-center gap-2 mt-4 text-[14px]"
      ><input v-model="operationConfirmed" type="checkbox" /> I reviewed this irreversible Stripe
      request and its proration or refund effect.</label
    >
    <div class="control-actions">
      <button class="btn btn-primary" :disabled="!operationReady" @click="executeBillingOperation">
        Execute confirmed operation
      </button>
    </div>
    <div class="overflow-x-auto mt-4">
      <table class="table-tiny table-compact min-w-[720px]">
        <thead>
          <tr>
            <th>Operation</th>
            <th>State</th>
            <th>Requested</th>
            <th>Stripe object</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="operation in operations" :key="operation.id">
            <td>{{ operation.kind.replace(/_/g, ' ') }}</td>
            <td>
              <span
                class="pill"
                :class="
                  operation.state === 'succeeded'
                    ? 'pill-ok'
                    : operation.state === 'failed'
                      ? 'pill-err'
                      : 'pill-warn'
                "
                >{{ operation.state }}</span
              >
            </td>
            <td>{{ new Date(operation.created_at).toLocaleString() }}</td>
            <td>{{ operation.stripe_object_id || '—' }}</td>
            <td>{{ operation.error || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <ControlSection title="Invoices">
    <div v-if="detail?.invoices.length" class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[680px]">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Status</th>
            <th>Period</th>
            <th>Paid</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invoice in detail.invoices" :key="invoice.stripe_invoice_id">
            <td>{{ invoice.stripe_invoice_id }}</td>
            <td>{{ invoice.status || '—' }}</td>
            <td>
              {{ new Date(invoice.period_start).toLocaleDateString() }} –
              {{ new Date(invoice.period_end).toLocaleDateString() }}
            </td>
            <td>
              {{
                new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: (invoice.currency || 'USD').toUpperCase(),
                }).format(invoice.amount_paid / 100)
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="m-0 dim">No reconciled invoices.</p>
  </ControlSection>
  <ControlSection title="Privileged history">
    <div v-if="userAudit.length" class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[680px]">
        <thead>
          <tr>
            <th>Action</th>
            <th>Administrator</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in userAudit" :key="event.id">
            <td>{{ event.action.replace(/[._]/g, ' ') }}</td>
            <td>{{ event.actor_email || event.actor_user_id || 'system' }}</td>
            <td>{{ new Date(event.created_at).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="m-0 dim">No privileged changes recorded.</p>
  </ControlSection>
</template>
