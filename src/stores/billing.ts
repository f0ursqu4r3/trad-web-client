import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuth } from '@/lib/auth'
import { apiGet, apiPost } from '@/lib/apiClient'
import { createLogger } from '@/lib/utils'

const logger = createLogger('billing')

export interface PlanDetails {
  price_id: string
  product_name: string
  product_description?: string
  price_nickname?: string
  currency: string
  unit_amount?: number
  billing_interval?: string
  billing_interval_count?: number
  features: string[] | Record<string, unknown>
}

export interface BillingInfo {
  plan: string
  status: string
  current_period_end?: string
  trial_end?: string
  cancel_at?: string
  canceled_at?: string
  plan_details?: PlanDetails
}

export interface PricingPlan {
  price_id: string
  product_id?: string | null
  name: string
  description?: string | null
  currency?: string | null
  unit_amount?: number | null
  interval?: 'month' | 'year' | string | null
  interval_count?: number | null
  features?: string[]
  highlighted?: boolean
}

export type CommercialCapability =
  | 'terminal_access'
  | 'advanced_order_types'
  | 'custom_alerts'
  | 'webhook_access'
  | 'api_access'
  | 'custom_integrations'

export interface CommercialPlan {
  key: string
  version: number
  display_name: string
  state: 'draft' | 'active' | 'retired'
  max_accounts: number | null
  builder_target_total_tenths_bps: number
  capabilities: CommercialCapability[]
}

export interface EffectiveEntitlement {
  entitled: boolean
  source: string
  reason: string
  plan: CommercialPlan | null
  builder_target_override_tenths_bps: number | null
  subscription_status: string | null
  grant_id: string | null
  resolved_at: string
}

export interface EntitlementUsage {
  entitlement: EffectiveEntitlement
  account_count: number
}

export interface BillingInvoice {
  stripe_invoice_id: string
  amount_due: number
  amount_paid: number
  currency?: string
  status?: string
  period_start: string
  period_end: string
  created_at: string
}

export interface BillingOperation {
  id: string
  kind: string
  state: string
  stripe_object_id: string | null
  error: string | null
  created_at: string
}

export const useBillingStore = defineStore('billing', () => {
  const { isAuthenticated } = useAuth()

  const billingInfo = ref<BillingInfo | null>(null)
  const plans = ref<PricingPlan[]>([])
  const commercialPlans = ref<CommercialPlan[]>([])
  const entitlementUsage = ref<EntitlementUsage | null>(null)
  const invoices = ref<BillingInvoice[]>([])
  const operations = ref<BillingOperation[]>([])
  const checkoutLoading = ref(false)

  async function fetchBillingInfo() {
    if (!isAuthenticated.value) return
    try {
      // Note: apiClient already prefixes with base URL (default '/api')
      const data = await apiGet<BillingInfo>('/billing', { throwOnHTTPError: false })
      billingInfo.value = data ?? null
    } catch (err) {
      // Non-fatal: leave as null and log to logger
      logger.warn('Failed to fetch billing info', err)
      billingInfo.value = null
    }
  }

  async function fetchPlans() {
    try {
      const data = await apiGet<PricingPlan[]>('/billing/plans', { throwOnHTTPError: false })
      if (!data || data.length === 0) {
        plans.value = []
        return
      }
      plans.value = normalizePlans(data)
    } catch (err) {
      logger.warn('Failed to fetch plans', err)
      plans.value = []
    }
  }

  async function fetchEntitlement() {
    if (!isAuthenticated.value) return
    entitlementUsage.value = await apiGet<EntitlementUsage>('/billing/entitlement', {
      throwOnHTTPError: true,
    })
  }

  async function fetchCommercialPlans() {
    commercialPlans.value = await apiGet<CommercialPlan[]>('/billing/commercial-plans', {
      throwOnHTTPError: true,
    })
  }

  async function fetchInvoices() {
    invoices.value = await apiGet<BillingInvoice[]>('/billing/invoices', {
      throwOnHTTPError: true,
    })
  }

  async function fetchOperations() {
    operations.value = await apiGet<BillingOperation[]>('/billing/operations', {
      throwOnHTTPError: true,
    })
  }

  async function executeOperation(request: Record<string, unknown>) {
    await apiPost('/billing/operations', request, {
      throwOnHTTPError: true,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    await Promise.all([fetchBillingInfo(), fetchEntitlement(), fetchOperations()])
  }

  async function createCheckoutSession(priceId: string) {
    if (!isAuthenticated.value) return
    checkoutLoading.value = true
    try {
      const { url } = await apiPost<{ url: string }>(
        '/billing/checkout-session',
        { price: priceId },
        { throwOnHTTPError: true },
      )
      if (url) window.location.assign(url)
    } catch (err) {
      logger.error('Failed to create checkout session', err)
    } finally {
      checkoutLoading.value = false
    }
  }

  async function openCustomerPortal() {
    if (!isAuthenticated.value) return
    try {
      // Backend should create a Stripe Billing Portal session and return { url }
      const { url } = await apiPost<{ url: string }>('/billing/portal-session', undefined, {
        throwOnHTTPError: true,
      })
      if (url) window.location.assign(url)
    } catch (err) {
      logger.error('Failed to open billing portal', err)
    }
  }

  watch(
    () => isAuthenticated.value,
    (authenticated) => {
      if (authenticated) Promise.all([fetchBillingInfo(), fetchEntitlement()])
      else {
        billingInfo.value = null
        entitlementUsage.value = null
      }
    },
    { immediate: true },
  )

  return {
    // state
    billingInfo,
    plans,
    commercialPlans,
    entitlementUsage,
    invoices,
    operations,
    checkoutLoading,
    // actions
    fetchBillingInfo,
    fetchPlans,
    fetchEntitlement,
    fetchCommercialPlans,
    fetchInvoices,
    fetchOperations,
    executeOperation,
    createCheckoutSession,
    openCustomerPortal,
  }
})

function normalizePlans(remotePlans: PricingPlan[]): PricingPlan[] {
  return remotePlans.map((plan) => {
    const features = normalizeFeatures(plan.features)
    return {
      price_id: plan.price_id,
      product_id: plan.product_id ?? null,
      name: plan.name || 'Plan',
      description: plan.description ?? null,
      currency: plan.currency ?? 'USD',
      unit_amount: plan.unit_amount ?? null,
      interval: plan.interval ?? 'month',
      interval_count: plan.interval_count ?? 1,
      features,
      highlighted: plan.highlighted ?? false,
    }
  })
}

function normalizeFeatures(raw: PricingPlan['features']): string[] | undefined {
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string')
  return undefined
}
