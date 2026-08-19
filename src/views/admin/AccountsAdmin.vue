<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import { accountColorFromId } from '@/lib/accountColors'

const admin = useAdminStore()
const query = ref('')
const rows = computed(() =>
  admin.accounts.filter((a) =>
    `${a.email} ${a.label} ${a.exchange}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
function health(account: (typeof admin.accounts)[number]) {
  const m = account.exchange_metadata
  if (account.exchange === 'hyperliquid')
    return m?.agent_approved && m?.builder_approved ? 'ready' : 'authorization required'
  return m ? 'configured' : 'metadata required'
}
onMounted(() => admin.fetchAccounts())
</script>
<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Account health"
    description="Sanitized account inventory and authorization readiness. Private keys are never returned to this page."
  />
  <ControlSection title="Configured accounts" :description="`${rows.length} shown`"
    ><template #actions
      ><input
        v-model.trim="query"
        class="input control-filter h-8 text-xs"
        placeholder="Filter accounts"
    /></template>
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[900px]">
        <thead>
          <tr>
            <th>Owner</th>
            <th>Label</th>
            <th>Venue</th>
            <th>Network</th>
            <th>Revision</th>
            <th>Health</th>
            <th>Identity</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in rows"
            :key="account.account_id"
            :style="{ '--account-context-color': accountColorFromId(account.account_id) }"
          >
            <td class="admin-account-cell">{{ account.email }}</td>
            <td>{{ account.label }}</td>
            <td>{{ account.exchange }}</td>
            <td>{{ account.network }}</td>
            <td>{{ account.configuration_revision }}</td>
            <td>
              <span
                class="pill"
                :class="
                  health(account) === 'ready' || health(account) === 'configured'
                    ? 'pill-ok'
                    : 'pill-warn'
                "
                >{{ health(account) }}</span
              >
            </td>
            <td class="max-w-64 break-all text-[10px] dim">
              {{
                account.exchange_metadata?.user_address ||
                account.exchange_metadata?.exchange_account_id ||
                '—'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div></ControlSection
  >
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>

<style scoped>
.admin-account-cell {
  box-shadow: inset 3px 0 0 var(--account-context-color);
  padding-left: 0.85rem;
}
</style>
