<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useGatewayStore } from '@/stores/gateway'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const admin = useAdminStore()
const gateway = useGatewayStore()
const environmentHost = window.location.host
const cards = computed(() =>
  admin.overview
    ? [
        ['Users', admin.overview.users],
        ['Enabled', admin.overview.enabled_users],
        ['Entitled', admin.overview.entitled_users],
        ['Trading accounts', admin.overview.trading_accounts],
        ['Hyperliquid', admin.overview.hyperliquid_accounts],
      ]
    : [],
)
onMounted(() => admin.fetchOverview())
</script>
<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Operations"
    description="Environment-level access and account inventory. Trading state remains owned and reconciled by the node cluster."
  />
  <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <div v-for="card in cards" :key="card[0]" class="panel-card p-4">
      <div class="text-[11px] uppercase tracking-wide dim">{{ card[0] }}</div>
      <div class="mt-2 text-2xl text-primary">{{ card[1] }}</div>
    </div>
  </div>
  <ControlSection title="Gateway session"
    ><div class="control-detail-grid">
      <div>
        <span>Browser gateway</span
        ><strong
          ><span class="pill" :class="gateway.status === 'ready' ? 'pill-ok' : 'pill-warn'">{{
            gateway.status
          }}</span></strong
        >
      </div>
      <div>
        <span>Latency</span
        ><strong>{{
          gateway.latencyMs == null ? '—' : `${gateway.latencyMs.toFixed(0)} ms`
        }}</strong>
      </div>
      <div>
        <span>Environment</span><strong>{{ environmentHost }}</strong>
      </div>
    </div></ControlSection
  >
  <ControlSection title="Operational boundary"
    ><p class="m-0 max-w-4xl text-[14px] leading-relaxed dim">
      This surface reports Gateway inventory and browser connectivity. Owner-node hydration and
      reconciliation readiness remain visible per account and in the trading terminal; operator
      repair actions are deliberately not exposed as generic admin buttons.
    </p></ControlSection
  >
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
