<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'
import { ExchangeType } from '@/lib/ws/protocol'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const accounts = useAccountsStore()
const hyperliquid = computed(() =>
  accounts.accounts.filter((a) => a.exchange === ExchangeType.Hyperliquid),
)
onMounted(() => accounts.fetchAccounts())
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Authorization & fees"
    description="Review the two wallet approvals Trad needs. The agent signs trades; the builder approval only sets a ceiling for Trad fees."
  />
  <div v-if="hyperliquid.length" class="grid gap-4 xl:grid-cols-2">
    <ControlSection
      v-for="account in hyperliquid"
      :key="account.id"
      :title="account.label"
      :description="`${account.network} · Hyperliquid`"
    >
      <div class="space-y-4 text-[12px]">
        <div class="control-auth-row">
          <div>
            <strong>Agent wallet</strong>
            <p>
              Allows Trad to submit orders without asking for a wallet signature on every command.
            </p>
          </div>
          <span
            class="pill"
            :class="account.exchange_metadata?.agent_approved ? 'pill-ok' : 'pill-err'"
            >{{ account.exchange_metadata?.agent_approved ? 'approved' : 'action required' }}</span
          >
        </div>
        <div class="control-auth-row">
          <div>
            <strong>Builder fee ceiling</strong>
            <p>
              Your main wallet approves up to 10.0 bps. Trad currently targets
              {{ (hyperliquidTargetTotalTenthsBps(account.exchange_metadata) / 10).toFixed(1) }} bps
              total exchange + builder cost.
            </p>
          </div>
          <span
            class="pill"
            :class="account.exchange_metadata?.builder_approved ? 'pill-ok' : 'pill-err'"
            >{{
              account.exchange_metadata?.builder_approved ? 'approved' : 'action required'
            }}</span
          >
        </div>
        <div class="text-[11px] dim">
          Builder recipient
          <span class="break-all text-primary">{{
            account.exchange_metadata?.builder_address || 'not configured'
          }}</span>
        </div>
        <RouterLink to="/settings/accounts" class="btn btn-primary btn-sm"
          >Manage approvals</RouterLink
        >
      </div>
    </ControlSection>
  </div>
  <ControlSection v-else title="No Hyperliquid accounts"
    ><p class="m-0 dim">Add a Hyperliquid account before wallet authorization is available.</p>
    <RouterLink to="/settings/accounts" class="btn btn-primary btn-sm mt-3"
      >Add trading account</RouterLink
    ></ControlSection
  >
</template>
