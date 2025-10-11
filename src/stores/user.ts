import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiGet } from '@/lib/apiClient'

export interface UserProfile {
  displayName?: string | null
  meta?: UserMeta
}

export interface UserKey {
  id: string
  name: string
}

export interface UserPreferences {
  [key: string]: unknown
}

export interface UserMeta {
  preferences?: UserPreferences
  [key: string]: unknown
}

export const useUserStore = defineStore('user', () => {
  const { isAuthenticated } = useAuth0()

  const userId = ref<string | null>(null)
  const profile = ref<UserProfile>({ displayName: null, meta: { preferences: {} } })
  const keys = ref<UserKey[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)
  const isServerAuthenticated = ref<boolean>(false)

  const displayName = computed(
    () =>
      profile.value?.displayName ||
      userId.value ||
      (isAuthenticated.value ? 'authenticated user' : 'guest'),
  )

  interface MeResponseShape {
    user_id?: string
    profile?: UserProfile
    keys?: UserKey[]
  }

  async function fetchMe() {
    if (!isAuthenticated.value) return
    loading.value = true
    error.value = null
    try {
      // Expect an object; support either { user, preferences } or a flat object with nested prefs
      const data = await apiGet<MeResponseShape | UserProfile>('/me', {
        throwOnHTTPError: false,
      })
      if (data && typeof data === 'object') {
        if ('user_id' in data) {
          userId.value = data.user_id || null
          profile.value = data.profile || { meta: { preferences: {} } }
          keys.value = data.keys || []
        } else {
          // Flat profile object
          profile.value = data as UserProfile
        }
      } else {
        userId.value = null
        profile.value = { displayName: null, meta: { preferences: {} } }
      }
      lastFetchedAt.value = Date.now()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      userId.value = null
      profile.value = { displayName: null, meta: { preferences: {} } }
    } finally {
      loading.value = false
    }
  }

  function clear() {
    userId.value = null
    profile.value = { displayName: null, meta: { preferences: {} } }
    error.value = null
    lastFetchedAt.value = null
  }

  // React to auth changes; fetch when authenticated, clear when logged out
  watch(
    () => isAuthenticated.value,
    (authed) => {
      if (authed) fetchMe()
      else clear()
    },
    { immediate: true },
  )

  return {
    // state
    userId,
    keys,
    profile,
    loading,
    error,
    lastFetchedAt,
    isServerAuthenticated,
    // getters
    displayName,
    // actions
    fetchMe,
    clear,
  }
})
