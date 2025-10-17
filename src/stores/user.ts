import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiGet, apiPut } from '@/lib/apiClient'
import { setObjectPath } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'
import { type AccountRecord, useAccountsStore } from '@/stores/accounts'

export interface ClientProfile {
  display_name?: string | null
  meta?: UserMeta
}

export interface UserPreferences {
  theme?: string
  [key: string]: unknown
}

export interface UserMeta {
  preferences?: UserPreferences
  [key: string]: unknown
}

export const useUserStore = defineStore('user', () => {
  const { isAuthenticated } = useAuth0()

  const userId = ref<string | null>(null)
  const profile = ref<ClientProfile>({ display_name: null, meta: { preferences: {} } })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)
  const isServerAuthenticated = ref<boolean>(false)

  const displayName = computed(
    () =>
      profile.value?.display_name ||
      userId.value ||
      (isAuthenticated.value ? 'authenticated user' : 'guest'),
  )

  interface MeResponseShape {
    user_id: string
    client_profile: ClientProfile
    accounts: AccountRecord[]
  }

  async function fetchMe() {
    if (!isAuthenticated.value) return
    loading.value = true
    error.value = null

    const accountsStore = useAccountsStore()
    const uiStore = useUiStore()

    try {
      // Expect an object; support either { user, preferences } or a flat object with nested prefs
      const data = await apiGet<MeResponseShape>('/me', {
        throwOnHTTPError: false,
      })
      if (data && typeof data === 'object') {
        if ('user_id' in data) {
          userId.value = data.user_id || null
          profile.value = data.client_profile || { meta: { preferences: {} } }
          accountsStore.accountsRaw = data.accounts || []
        } else {
          // Flat profile object
          profile.value = data as ClientProfile
        }
      } else {
        userId.value = null
        profile.value = { display_name: null, meta: { preferences: {} } }
      }
      lastFetchedAt.value = Date.now()
      uiStore.theme =
        (profile.value.meta?.preferences?.theme as typeof uiStore.theme | undefined) ||
        uiStore.theme
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      userId.value = null
      profile.value = { display_name: null, meta: { preferences: {} } }
    } finally {
      loading.value = false
    }
  }

  async function saveProfile() {
    if (!isAuthenticated.value) return
    const uiStore = useUiStore()
    loading.value = true
    error.value = null
    const payload = {
      display_name: profile.value.display_name,
      meta: profile.value.meta || { preferences: {} },
    }
    setObjectPath(payload, 'meta.preferences.theme', uiStore.theme)
    try {
      await apiPut('/me', payload as ClientProfile, { throwOnHTTPError: true })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function clear() {
    userId.value = null
    profile.value = { display_name: null, meta: { preferences: {} } }
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
    profile,
    loading,
    error,
    lastFetchedAt,
    isServerAuthenticated,
    // getters
    displayName,
    // actions
    saveProfile,
    fetchMe,
    clear,
  }
})
