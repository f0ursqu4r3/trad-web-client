<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/lib/auth'
import { useUserStore } from '@/stores/user'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import ProfileIcon from '@/components/general/ProfileIcon.vue'
import { PROFILE_ICON_CHOICES } from '@/lib/profileIcons'
import { prepareProfileImage } from '@/lib/profileImages'

const user = useUserStore()
const { logout } = useAuth()
const saved = ref(false)
const imageInput = ref<HTMLInputElement | null>(null)
const imageError = ref<string | null>(null)
const preparingImage = ref(false)
const returnToOrigin = window.location.origin
const initial = () => (user.displayName.trim().charAt(0) || '?').toUpperCase()

async function save() {
  saved.value = false
  await user.saveProfile()
  saved.value = !user.error
}

async function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  imageError.value = null
  preparingImage.value = true
  try {
    user.setProfileImage(await prepareProfileImage(file))
  } catch (error) {
    imageError.value = error instanceof Error ? error.message : String(error)
  } finally {
    preparingImage.value = false
    input.value = ''
  }
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
    <fieldset class="profile-icon-fieldset">
      <legend>Account icon</legend>
      <p>Shown in the account menu at the top of Trad.</p>
      <div class="profile-icon-grid">
        <label v-for="choice in PROFILE_ICON_CHOICES" :key="choice.key">
          <input
            type="radio"
            name="profile-icon"
            :checked="!user.profileImage && user.profileIcon === choice.key"
            @change="user.setProfileIcon(choice.key)"
          />
          <span class="profile-icon-choice">
            <ProfileIcon :icon="choice.key" :initial="initial()" :size="20" />
          </span>
          <span>{{ choice.label }}</span>
        </label>
      </div>
      <div class="profile-upload-row">
        <span class="profile-upload-preview" :class="{ selected: user.profileImage }">
          <ProfileIcon
            :icon="user.profileIcon"
            :initial="initial()"
            :image="user.profileImage"
            :size="24"
          />
        </span>
        <div class="profile-upload-copy">
          <strong>Custom image</strong>
          <span>PNG, JPEG, or WebP. Trad crops it to a square and stores a small copy.</span>
        </div>
        <input
          ref="imageInput"
          class="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-testid="profile-image-input"
          @change="chooseImage"
        />
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="preparingImage"
          @click="imageInput?.click()"
        >
          {{ preparingImage ? 'Preparing…' : user.profileImage ? 'Replace image' : 'Upload image' }}
        </button>
        <button
          v-if="user.profileImage"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="user.setProfileImage(null)"
        >
          Remove
        </button>
      </div>
      <p v-if="imageError" class="field-error" role="alert">{{ imageError }}</p>
    </fieldset>
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

<style scoped>
.profile-icon-fieldset {
  margin-top: 1.25rem;
  max-width: 36rem;
  border-top: 1px solid var(--border-subtle);
  padding-top: 1rem;
}
.profile-icon-fieldset legend {
  color: var(--fg-strong);
  font-size: 13px;
}
.profile-icon-fieldset p {
  margin: 0.25rem 0 0.75rem;
  color: var(--fg-muted);
  font-size: 12px;
}
.profile-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: 0.5rem;
}
.profile-icon-grid label {
  position: relative;
  display: grid;
  min-height: 76px;
  place-items: center;
  gap: 0.3rem;
  border: 1px solid var(--border-normal);
  padding: 0.6rem;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: 12px;
}
.profile-icon-grid input {
  position: absolute;
  opacity: 0;
}
.profile-icon-grid label:has(input:checked) {
  border-color: var(--accent-color);
  background: var(--surface-selected);
  color: var(--fg-strong);
  box-shadow: inset 0 -2px 0 var(--accent-color);
}
.profile-icon-grid label:has(input:focus-visible) {
  box-shadow: var(--focus-ring-strong);
}
.profile-icon-choice {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9999px;
  background: var(--surface-muted);
  color: var(--fg-strong);
  font-weight: 700;
}
.profile-upload-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
  border-top: 1px solid var(--border-subtle);
  padding-top: 0.75rem;
}
.profile-upload-preview {
  display: grid;
  width: 42px;
  height: 42px;
  flex: none;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--border-normal);
  border-radius: 9999px;
  background: var(--surface-muted);
}
.profile-upload-preview.selected {
  border-color: var(--accent-color);
  box-shadow: var(--focus-ring);
}
.profile-upload-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 1.45;
}
.profile-upload-copy strong {
  color: var(--fg-strong);
  font-size: 13px;
  font-weight: 500;
}
@media (max-width: 640px) {
  .profile-upload-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .profile-upload-copy {
    flex-basis: calc(100% - 3.5rem);
  }
}
</style>
