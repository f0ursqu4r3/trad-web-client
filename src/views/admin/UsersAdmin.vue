<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore, type AdminUser } from '@/stores/admin'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const admin = useAdminStore()
const query = ref('')
const saving = ref<string | null>(null)
const filtered = computed(() =>
  admin.users.filter((user) => user.email.toLowerCase().includes(query.value.toLowerCase())),
)
async function save(user: AdminUser) {
  saving.value = user.user_id
  try {
    await admin.updateUser(user)
  } finally {
    saving.value = null
  }
}
onMounted(() => admin.fetchUsers())
</script>
<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Users & access"
    description="Manage Trad roles, disable access, and grant or deny terminal entitlement independently of Stripe."
  />
  <ControlSection title="User directory" :description="`${filtered.length} shown`"
    ><template #actions
      ><input v-model.trim="query" class="input h-7 w-64 text-xs" placeholder="Filter by email"
    /></template>
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[880px]">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Enabled</th>
            <th>Entitlement</th>
            <th>Billing</th>
            <th>Accounts</th>
            <th>Last login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filtered" :key="user.user_id">
            <td>{{ user.email }}</td>
            <td>
              <select v-model="user.role" class="input h-7 text-xs">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </td>
            <td><input v-model="user.enabled" type="checkbox" /></td>
            <td>
              <select v-model="user.entitlement_override" class="input h-7 text-xs">
                <option :value="null">Stripe</option>
                <option :value="true">Always allow</option>
                <option :value="false">Always deny</option>
              </select>
            </td>
            <td>
              <span class="pill" :class="user.entitled ? 'pill-ok' : 'pill-err'">{{
                user.subscription_status || 'none'
              }}</span>
            </td>
            <td>{{ user.account_count }}</td>
            <td>
              {{ user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'never' }}
            </td>
            <td>
              <button
                class="btn btn-secondary btn-xs"
                :disabled="saving === user.user_id"
                @click="save(user)"
              >
                Save
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
