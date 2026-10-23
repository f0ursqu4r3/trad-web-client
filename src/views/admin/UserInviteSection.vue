<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ControlSection from '@/components/control/ControlSection.vue'
import FormField from '@/components/forms/FormField.vue'
import { useAdminStore } from '@/stores/admin'
import {
  cellIdProblem,
  inviteEmailProblem,
  inviteRequest,
  type AdminWriteFailure,
} from '@/lib/adminOnboarding'

// Operators create every Trad user: the invitation writes the user and a
// complimentary private beta grant. The invitee then signs in with this
// email, which their login provider must have verified.
const admin = useAdminStore()
const email = ref('')
const cell = ref('')
const reason = ref('')
const sending = ref(false)
const invited = ref<string | null>(null)
const failure = ref<AdminWriteFailure | null>(null)

const emailProblem = computed(() => (email.value.trim() ? inviteEmailProblem(email.value) : null))
const cellProblem = computed(() => cellIdProblem(cell.value))
const canInvite = computed(
  () => !sending.value && inviteEmailProblem(email.value) === null && cellProblem.value === null,
)

async function invite() {
  if (!canInvite.value) return
  sending.value = true
  invited.value = null
  failure.value = null
  const request = inviteRequest(email.value, cell.value, reason.value)
  try {
    const result = await admin.inviteUser(request)
    if (result.ok) {
      invited.value = request.email
      email.value = ''
      cell.value = ''
      reason.value = ''
      await admin.fetchUsers()
    } else {
      failure.value = result
    }
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <ControlSection
    title="Invite a user"
    description="Creates the user with complimentary private beta access. They sign in with this email once their login provider has verified it."
  >
    <form class="invite-form" data-testid="admin-invite-form" @submit.prevent="invite">
      <FormField label="Email" :error="emailProblem" required
        ><input
          v-model="email"
          type="email"
          class="input"
          autocomplete="off"
          placeholder="trader@example.com"
      /></FormField>
      <FormField label="Cell" :error="cellProblem" optional
        ><input v-model="cell" class="input" autocomplete="off" placeholder="none"
      /></FormField>
      <FormField label="Reason" optional
        ><input v-model="reason" class="input" autocomplete="off" placeholder="Operator invitation"
      /></FormField>
      <div class="invite-actions">
        <button type="submit" class="btn btn-primary" :disabled="!canInvite">
          {{ sending ? 'Inviting' : 'Invite' }}
        </button>
      </div>
    </form>
    <p v-if="invited" class="notice-ok" role="status">
      Invited {{ invited }}. They can sign in now.
    </p>
    <p v-if="failure" class="notice-err" role="alert">
      {{ failure.message }}
      <RouterLink
        v-if="failure.code === 'user_exists' && failure.userId"
        :to="`/admin/users/${failure.userId}`"
        class="text-link"
        >Open that user</RouterLink
      >
    </p>
  </ControlSection>
</template>

<style scoped>
.invite-form {
  display: grid;
  grid-template-columns: minmax(14rem, 2fr) minmax(8rem, 1fr) minmax(10rem, 1.5fr) auto;
  align-items: end;
  gap: 0.75rem;
}
.invite-actions {
  display: flex;
  padding-bottom: 2px;
}
@media (max-width: 760px) {
  .invite-form {
    grid-template-columns: 1fr;
  }
}
</style>
