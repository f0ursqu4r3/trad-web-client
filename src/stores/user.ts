import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiGet } from '@/lib/apiClient'

export interface UserProfile {
  id?: string
  username?: string
  email?: string
  name?: string
  roles?: string[]
  [key: string]: unknown
}

export interface UserPreferences {
  [key: string]: unknown
}

export const useUserStore = defineStore('user', () => {
  const { isAuthenticated } = useAuth0()

  const profile = ref<UserProfile | null>(null)
  const preferences = ref<UserPreferences | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)

  const displayName = computed(
    () => profile.value?.name || profile.value?.username || profile.value?.email || 'user',
  )

  interface MeResponseShape {
    user?: UserProfile
    preferences?: UserPreferences
    [key: string]: unknown
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
        if ('user' in data || 'preferences' in data) {
          profile.value = (data.user ?? null) as UserProfile | null
          preferences.value = (data.preferences ?? null) as UserPreferences | null
        } else {
          // Fallback if API returns a flat shape
          profile.value = data as UserProfile
          preferences.value = (data.preferences ?? null) as UserPreferences | null
        }
      } else {
        profile.value = null
        preferences.value = null
      }
      lastFetchedAt.value = Date.now()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      profile.value = null
      preferences.value = null
    } finally {
      loading.value = false
    }
  }

  function clear() {
    profile.value = null
    preferences.value = null
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
    profile,
    preferences,
    loading,
    error,
    lastFetchedAt,
    // getters
    displayName,
    // actions
    fetchMe,
    clear,
  }
})
