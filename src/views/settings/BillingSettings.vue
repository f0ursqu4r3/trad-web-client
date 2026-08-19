<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useBillingStore } from '@/stores/billing'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const billing = useBillingStore()
const confirmCancellation = ref(false)
async function scheduleCancellation() {
  if (!confirmCancellation.value) return
  await billing.executeOperation({ kind: 'cancel_at_period_end' })
  confirmCancellation.value = false
}
onMounted(() =>
  Promise.all([
    billing.fetchBillingInfo(),
    billing.fetchEntitlement(),
    billing.fetchInvoices(),
    billing.fetchOperations(),
  ]),
)
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Billing"
    description="Subscription access and Stripe-managed payment details."
  />
  <ControlSection title="Current access">
    <div v-if="billing.entitlementUsage" class="control-detail-grid">
      <div>
        <span>Plan</span
        ><strong>{{
          billing.entitlementUsage.entitlement.plan?.display_name || 'No plan'
        }}</strong>
      </div>
      <div>
        <span>Access</span
        ><strong
          ><span
            class="pill"
            :class="billing.entitlementUsage.entitlement.entitled ? 'pill-ok' : 'pill-err'"
            >{{ billing.entitlementUsage.entitlement.reason.replace(/_/g, ' ') }}</span
          ></strong
        >
      </div>
      <div>
        <span>Source</span
        ><strong>{{ billing.entitlementUsage.entitlement.source.replace(/_/g, ' ') }}</strong>
      </div>
      <div>
        <span>Trading accounts</span
        ><strong
          >{{ billing.entitlementUsage.account_count }} /
          {{ billing.entitlementUsage.entitlement.plan?.max_accounts ?? 'unlimited' }}</strong
        >
      </div>
      <div>
        <span>Renews / ends</span
        ><strong>{{ billing.billingInfo?.current_period_end ? new Date(billing.billingInfo.current_period_end).toLocaleString() : '—' }}</strong>
      </div>
      <div>
        <span>Cancellation</span
        ><strong>{{ billing.billingInfo?.cancel_at ? `Scheduled ${new Date(billing.billingInfo.cancel_at).toLocaleString()}` : 'Not scheduled' }}</strong>
      </div>
    </div>
    <p v-else class="dim">Access state is loading.</p>
    <div class="control-actions">
      <button
        v-if="billing.billingInfo"
        class="btn btn-primary"
        @click="billing.openCustomerPortal()"
      >
        Manage billing</button
      ><RouterLink to="/subscriptions" class="btn btn-secondary">View plans</RouterLink>
    </div>
  </ControlSection>
  <ControlSection title="Subscription lifecycle" description="Stripe remains authoritative; Trad records the request until webhook reconciliation.">
    <label class="inline-flex items-center gap-2 text-[12px]"><input v-model="confirmCancellation" type="checkbox" /> I understand access remains active until the current billing period ends.</label>
    <div class="control-actions"><button class="btn btn-secondary" :disabled="!confirmCancellation || !billing.billingInfo || billing.billingInfo.status === 'inactive'" @click="scheduleCancellation">Cancel at period end</button></div>
    <div v-if="billing.operations.length" class="overflow-x-auto mt-4"><table class="table-tiny table-compact min-w-[620px]"><thead><tr><th>Request</th><th>Status</th><th>Requested</th><th>Error</th></tr></thead><tbody><tr v-for="operation in billing.operations" :key="operation.id"><td>{{ operation.kind.replace(/_/g, ' ') }}</td><td><span class="pill" :class="operation.state === 'reconciled' || operation.state === 'succeeded' ? 'pill-ok' : operation.state === 'failed' ? 'pill-err' : 'pill-warn'">{{ operation.state }}</span></td><td>{{ new Date(operation.created_at).toLocaleString() }}</td><td>{{ operation.error || '—' }}</td></tr></tbody></table></div>
  </ControlSection>
  <ControlSection title="Invoices">
    <div v-if="billing.invoices.length" class="overflow-x-auto"><table class="table-tiny table-compact min-w-[680px]"><thead><tr><th>Invoice</th><th>Status</th><th>Period</th><th>Paid</th></tr></thead><tbody><tr v-for="invoice in billing.invoices" :key="invoice.stripe_invoice_id"><td>{{ invoice.stripe_invoice_id }}</td><td>{{ invoice.status || '—' }}</td><td>{{ new Date(invoice.period_start).toLocaleDateString() }} – {{ new Date(invoice.period_end).toLocaleDateString() }}</td><td>{{ new Intl.NumberFormat(undefined, { style: 'currency', currency: (invoice.currency || 'USD').toUpperCase() }).format(invoice.amount_paid / 100) }}</td></tr></tbody></table></div>
    <p v-else class="m-0 dim">No invoices have been reconciled yet.</p>
  </ControlSection>
  <ControlSection title="Plan capabilities">
    <div
      v-if="billing.entitlementUsage?.entitlement.plan"
      class="flex flex-wrap gap-2"
    >
      <span
        v-for="capability in billing.entitlementUsage.entitlement.plan.capabilities"
        :key="capability"
        class="pill pill-info"
        >{{ capability.replace(/_/g, ' ') }}</span
      >
    </div>
    <p v-else class="m-0 dim">No commercial capabilities are active.</p>
  </ControlSection>
  <ControlSection title="What Stripe controls"
    ><p class="m-0 max-w-3xl text-[12px] leading-relaxed dim">
      Payment methods, invoices, cancellation, and renewal are completed in Stripe’s customer
      portal. Trad stores only the subscription state needed to determine access.
    </p></ControlSection
  >
</template>
