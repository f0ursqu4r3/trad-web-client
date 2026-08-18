<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
const admin = useAdminStore()
onMounted(() => admin.fetchAudit())
</script>
<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Audit history"
    description="Append-only record of privileged changes made through the Trad control plane."
  />
  <ControlSection title="Recent events" :description="`${admin.audit.length} events`"
    ><template #actions
      ><button class="btn btn-secondary btn-xs" @click="admin.fetchAudit()">
        Refresh
      </button></template
    >
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[820px]">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in admin.audit" :key="event.id">
            <td>{{ new Date(event.created_at).toLocaleString() }}</td>
            <td>{{ event.actor_email || event.actor_user_id || 'system' }}</td>
            <td>{{ event.action }}</td>
            <td>{{ event.target_type }} · {{ event.target_id }}</td>
            <td>
              <code class="text-[10px] dim">{{ JSON.stringify(event.detail) }}</code>
            </td>
          </tr>
          <tr v-if="!admin.audit.length">
            <td colspan="5" class="py-6 text-center dim">No privileged changes recorded.</td>
          </tr>
        </tbody>
      </table>
    </div></ControlSection
  >
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
