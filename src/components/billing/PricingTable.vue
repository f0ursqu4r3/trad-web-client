<script setup lang="ts">
import { Check } from 'lucide-vue-next'

export interface PricingPlan {
  price_id: string
  product_id: string
  name: string
  description: string
  currency: string
  unit_amount: number // Price in cents
  interval: 'month' | 'year'
  interval_count: number
  features?: string[]
  highlighted?: boolean
}

const props = defineProps<{
  plans: PricingPlan[]
  currentPlanId?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  subscribe: [priceId: string]
}>()

const formatPrice = (unitAmount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100)
}

const intervalLabel = (interval: 'month' | 'year') => {
  return interval === 'month' ? '/mo' : '/yr'
}

const isCurrentPlan = (plan: PricingPlan) => {
  return props.currentPlanId === plan.price_id
}
</script>

<template>
  <div class="pricing-grid my-8">
    <div
      v-for="plan in plans"
      :key="plan.price_id"
      class="pricing-plan"
      :class="{ highlighted: plan.highlighted, current: isCurrentPlan(plan) }"
    >
      <!-- Plan badge -->
      <div v-if="plan.highlighted" class="plan-badge">Popular</div>
      <div v-else-if="isCurrentPlan(plan)" class="plan-badge current-badge">Current Plan</div>

      <!-- Plan header -->
      <div class="plan-header">
        <h3 class="plan-name">{{ plan.name }}</h3>
        <p class="plan-description">{{ plan.description }}</p>
      </div>

      <!-- Price -->
      <div class="plan-price">
        <span class="price-amount">{{ formatPrice(plan.unit_amount, plan.currency) }}</span>
        <span class="price-interval">{{ intervalLabel(plan.interval) }}</span>
      </div>

      <!-- Features -->
      <ul v-if="plan.features?.length" class="plan-features">
        <li v-for="feature in plan.features" :key="feature" class="feature-item">
          <Check :size="14" class="feature-icon" />
          <span>{{ feature }}</span>
        </li>
      </ul>

      <!-- CTA -->
      <button
        type="button"
        class="plan-cta"
        :class="plan.highlighted ? 'btn-primary' : 'btn-secondary'"
        :disabled="loading || isCurrentPlan(plan)"
        @click="emit('subscribe', plan.price_id)"
      >
        <template v-if="loading">Processing...</template>
        <template v-else-if="isCurrentPlan(plan)">Current Plan</template>
        <template v-else>Get Started</template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pricing-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}

.pricing-plan {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--panel-bg);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  max-width: 320px;
}

.pricing-plan:hover {
  border-color: color-mix(in srgb, var(--accent-color) 40%, transparent);
}

.pricing-plan.highlighted {
  border-color: var(--accent-color);
  box-shadow:
    0 0 0 1px var(--accent-color),
    0 4px 20px color-mix(in srgb, var(--accent-color) 15%, transparent);
}

.pricing-plan.current {
  border-color: var(--color-success);
}

.plan-badge {
  position: absolute;
  top: -0.625rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.125rem 0.75rem;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: var(--radius-pill);
  background: var(--accent-color);
  color: #fff;
}

.plan-badge.current-badge {
  background: var(--color-success);
}

.plan-header {
  margin-bottom: 1rem;
}

.plan-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}

.plan-description {
  font-size: 0.8125rem;
  color: var(--color-text-dim);
  margin: 0;
}

.plan-price {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--panel-border-inner);
}

.price-amount {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.price-interval {
  font-size: 0.875rem;
  color: var(--color-text-dim);
}

.plan-features {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-text);
}

.feature-icon {
  flex-shrink: 0;
  margin-top: 0.125rem;
  color: var(--color-success);
}

.plan-cta {
  width: 100%;
  justify-content: center;
  padding: 0.625rem 1rem;
  font-size: 0.8125rem;
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition: all 0.15s ease;
}

.plan-cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
