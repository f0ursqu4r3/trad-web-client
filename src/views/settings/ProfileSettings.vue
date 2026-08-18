<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/lib/auth'
import { useUserStore } from '@/stores/user'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const user = useUserStore()
const { logout } = useAuth()
const saved = ref(false)
const returnToOrigin = window.location.origin

async function save() {
  saved.value = false
  await user.saveProfile()
  saved.value = !user.error
}
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Profile"
    description="Identity, access, and the name shown inside this Trad environment."
  />
  <ControlSection title="Identity" description="Verified by the configured OAuth tenant">
    <div class="control-detail-grid">
      <div>
        <span>Email</span><strong>{{ user.email || '—' }}</strong>
      </div>
      <div>
        <span>User ID</span><strong class="break-all">{{ user.userId || '—' }}</strong>
      </div>
      <div>
        <span>Role</span
        ><strong
          ><span class="pill" :class="user.isAdmin ? 'pill-warn' : 'pill-info'">{{
            user.role
          }}</span></strong
        >
      </div>
      <div>
        <span>Terminal access</span
        ><strong
          ><span class="pill" :class="user.entitled ? 'pill-ok' : 'pill-err'">{{
            user.entitled ? 'enabled' : 'subscription required'
          }}</span></strong
        >
      </div>
    </div>
  </ControlSection>
  <ControlSection title="Presentation" description="Visible to you inside Trad">
    <label class="field max-w-xl"
      ><span class="field-label">Display name</span>
      <input v-model.trim="user.profile.display_name" class="input" autocomplete="name" />
      <span class="field-hint">This does not change your OAuth email or wallet identity.</span>
    </label>
    <div class="mt-4 flex items-center gap-3">
      <button class="btn btn-primary" :disabled="user.loading" @click="save">Save profile</button
      ><span v-if="saved" class="notice-ok m-0">Saved.</span
      ><span v-if="user.error" class="notice-err m-0">{{ user.error }}</span>
    </div>
  </ControlSection>
  <ControlSection title="Session" description="Authentication for this browser">
    <button class="btn btn-danger" @click="logout({ returnTo: returnToOrigin })">Log out</button>
  </ControlSection>
</template>
