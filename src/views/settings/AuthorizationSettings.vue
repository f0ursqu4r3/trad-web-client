<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'
import { ExchangeType } from '@/lib/ws/protocol'
import { hyperliquidTargetTotalTenthsBps } from '@/lib/accountMetadata'
import { accountColorFromId } from '@/lib/accountColors'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const accounts = useAccountsStore()
const hyperliquid = computed(() =>
  accounts.accounts.filter((account) => account.exchange === ExchangeType.Hyperliquid),
)
onMounted(() => accounts.fetchAccounts())
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Authorization & fees"
    description="Review authorization across accounts. Open an account to approve, rotate, or inspect its wallet configuration."
  />
  <ControlSection
    v-if="hyperliquid.length"
    title="Hyperliquid authorization"
    :description="`${hyperliquid.length} account${hyperliquid.length === 1 ? '' : 's'}`"
  >
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[780px]">
        <thead>
          <tr>
            <th>Account</th>
            <th>Agent wallet</th>
            <th>Builder approval</th>
            <th>Target total</th>
            <th>Builder recipient</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in hyperliquid"
            :key="account.id"
            :style="{ '--account-context-color': accountColorFromId(account.id) }"
          >
            <td class="authorization-account-cell">
              <div class="text-primary">{{ account.label }}</div>
              <div class="mt-0.5 text-[11px] dim">{{ account.network }}</div>
            </td>
            <td>
              <span
                class="pill"
                :class="account.exchange_metadata?.agent_approved ? 'pill-ok' : 'pill-warn'"
              >
                {{ account.exchange_metadata?.agent_approved ? 'approved' : 'action required' }}
              </span>
            </td>
            <td>
              <span
                class="pill"
                :class="account.exchange_metadata?.builder_approved ? 'pill-ok' : 'pill-warn'"
              >
                {{ account.exchange_metadata?.builder_approved ? 'approved' : 'action required' }}
              </span>
            </td>
            <td>
              {{ (hyperliquidTargetTotalTenthsBps(account.exchange_metadata) / 10).toFixed(1) }} bps
            </td>
            <td class="max-w-56 truncate font-mono text-[12px] dim">
              {{ account.exchange_metadata?.builder_address || 'not configured' }}
            </td>
            <td class="text-right">
              <RouterLink
                :to="`/settings/accounts/${account.id}/authorization`"
                class="btn btn-secondary btn-sm"
              >
                Manage
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <ControlSection v-else title="No Hyperliquid accounts">
    <p class="control-copy">Add a Hyperliquid account before wallet authorization is available.</p>
    <div class="control-actions">
      <RouterLink to="/settings/accounts" class="btn btn-primary btn-sm"
        >Add trading account</RouterLink
      >
    </div>
  </ControlSection>
</template>

<style scoped>
.authorization-account-cell {
  box-shadow: inset 3px 0 0 var(--account-context-color);
  padding-left: 0.85rem;
}
</style>
