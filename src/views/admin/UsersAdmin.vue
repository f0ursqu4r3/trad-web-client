<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAdminStore, type AdminUser } from '@/stores/admin'
import { useUserStore } from '@/stores/user'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import UserInviteSection from './UserInviteSection.vue'
import UserCellField from './UserCellField.vue'

const admin = useAdminStore()
const currentUser = useUserStore()
const query = ref('')
const saving = ref<string | null>(null)
const toggling = ref<string | null>(null)
// The last refusal per row (403 super admin, 409 own session, bad cell).
const rowErrors = reactive<Record<string, string | null>>({})
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
// Applied at once, without a confirmation (product rule); role and grants
// are untouched, so enabling again restores access.
async function toggleEnabled(user: AdminUser, event: Event) {
  const input = event.target as HTMLInputElement
  toggling.value = user.user_id
  rowErrors[user.user_id] = null
  try {
    const result = await admin.setUserEnabled(user.user_id, input.checked)
    if (!result.ok) rowErrors[user.user_id] = result.message
  } finally {
    toggling.value = null
    // a refused change leaves the box showing the server's state
    input.checked = user.enabled
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
    description="Invite users, manage Trad roles, disable access, record cells, and grant or deny terminal entitlement independently of Stripe."
  />
  <UserInviteSection />
  <ControlSection title="User directory" :description="`${filtered.length} shown`"
    ><template #actions
      ><input
        v-model.trim="query"
        class="input control-filter h-8 text-xs"
        placeholder="Filter by email"
    /></template>
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[980px]" data-testid="admin-user-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Enabled</th>
            <th>Cell</th>
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
              <RouterLink :to="`/admin/users/${user.user_id}`" class="text-link">{{
                user.email
              }}</RouterLink>
              <span v-if="user.user_id === currentUser.userId" class="text-[11px] dim">you</span>
              <p v-if="rowErrors[user.user_id]" class="notice-err m-0" role="alert">
                {{ rowErrors[user.user_id] }}
              </p>
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
              <label class="enabled-toggle">
                <input
                  type="checkbox"
                  :checked="user.enabled"
                  :disabled="!canChangeRoleOrEnabled(user) || toggling === user.user_id"
                  :aria-label="`${user.email} enabled`"
                  @change="toggleEnabled(user, $event)"
                />
                <span :class="user.enabled ? '' : 'disabled-label'">{{
                  user.enabled ? 'Enabled' : 'Disabled'
                }}</span>
              </label>
            </td>
            <td>
              <UserCellField
                :user="user"
                @error="(message) => (rowErrors[user.user_id] = message)"
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
                user.plan_key
                  ? `${user.plan_key} v${user.plan_version}`
                  : user.entitlement_source.replace(/_/g, ' ')
              }}</span>
              <div class="text-[12px] dim">
                {{ user.subscription_status || 'no Stripe subscription' }}
              </div>
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
<style scoped>
.enabled-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12px;
  white-space: nowrap;
}
.disabled-label {
  color: var(--state-error);
}
</style>
