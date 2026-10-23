<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAdminStore, type AdminUser } from '@/stores/admin'
import { cellIdProblem, normalizedCellId } from '@/lib/adminOnboarding'

// The user's cell, recorded for the coming cell routing. Saved on Set or
// Enter; an empty field clears it.
const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{ error: [message: string | null] }>()
const admin = useAdminStore()
const draft = ref(props.user.cell_id ?? '')
const saving = ref(false)

watch(
  () => props.user.cell_id,
  (cell) => (draft.value = cell ?? ''),
)
const problem = computed(() => cellIdProblem(draft.value))
const changed = computed(() => normalizedCellId(draft.value) !== (props.user.cell_id ?? null))
watch(problem, (next) => emit('error', next))

async function save() {
  if (saving.value || !changed.value) return
  if (problem.value) {
    emit('error', problem.value)
    return
  }
  saving.value = true
  emit('error', null)
  try {
    const result = await admin.setUserCell(props.user.user_id, normalizedCellId(draft.value))
    if (!result.ok) emit('error', result.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="cell-field" @submit.prevent="save">
    <input
      v-model="draft"
      class="input h-7 text-xs"
      :class="{ invalid: problem }"
      :aria-label="`Cell for ${user.email}`"
      :aria-invalid="problem ? 'true' : undefined"
      :title="problem ?? undefined"
      placeholder="none"
      autocomplete="off"
    />
    <button
      v-if="changed"
      type="submit"
      class="btn btn-secondary btn-xs"
      :disabled="saving || Boolean(problem)"
    >
      Set
    </button>
  </form>
</template>

<style scoped>
.cell-field {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.cell-field .input {
  width: 7rem;
}
.cell-field .input.invalid {
  border-color: var(--control-invalid);
}
</style>
