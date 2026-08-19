<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore, type AdminUser } from '@/stores/admin'
import { useUserStore } from '@/stores/user'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const admin = useAdminStore()
const currentUser = useUserStore()
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
function canModify(user: AdminUser): boolean {
  return currentUser.isSuperAdmin || user.role !== 'super_admin'
}
function canChangeRoleOrEnabled(user: AdminUser): boolean {
  return canModify(user) && user.user_id !== currentUser.userId
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
      ><input
        v-model.trim="query"
        class="input control-filter h-8 text-xs"
        placeholder="Filter by email"
    /></template>
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[880px]" data-testid="admin-user-table">
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
            <td>
              <div>{{ user.email }}</div>
              <span v-if="user.user_id === currentUser.userId" class="text-[10px] dim">you</span>
            </td>
            <td>
              <select
                v-model="user.role"
                class="input h-7 text-xs"
                :disabled="!canChangeRoleOrEnabled(user)"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option
                  v-if="currentUser.isSuperAdmin || user.role === 'super_admin'"
                  value="super_admin"
                >
                  super admin
                </option>
              </select>
            </td>
            <td>
              <input
                v-model="user.enabled"
                type="checkbox"
                :disabled="!canChangeRoleOrEnabled(user)"
              />
            </td>
            <td>
              <select
                v-model="user.entitlement_override"
                class="input h-7 text-xs"
                :disabled="!canModify(user)"
              >
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
                :disabled="saving === user.user_id || !canModify(user)"
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
