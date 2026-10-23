import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuth } from '@/lib/auth'
import { apiGet, apiPut } from '@/lib/apiClient'
import { setv } from '@/lib/utils'
import { clearSessionUserId, setSessionUserId } from '@/lib/userSession'
import { normalizeTheme, useUiStore } from '@/stores/ui'
import { type AccountRecord, useAccountsStore } from '@/stores/accounts'
import { normalizeProfileIcon, type ProfileIconKey } from '@/lib/profileIcons'
import { normalizeProfileImage } from '@/lib/profileImages'
import {
  identityRefusalCode,
  refusedLoginPath,
  type IdentityRefusalCode,
} from '@/lib/identityRefusal'

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
  const auth = useAuth()
  const { isAuthenticated } = auth

  const email = ref<string | null>(null)
  const userId = ref<string | null>(null)
  const profile = ref<ClientProfile>({ display_name: null, meta: { preferences: {} } })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)
  const isServerAuthenticated = ref<boolean>(false)
  const entitled = ref<boolean | null>(null)
  const enabled = ref(true)
  const role = ref<'user' | 'admin' | 'super_admin'>('user')
  const capabilities = ref<string[]>([])
  // Set when the Gateway refuses this login (403 not_invited and the like):
  // the session is dropped once and /login explains why. Never retried.
  const identityRefusal = ref<IdentityRefusalCode | null>(null)
  let fetchInFlight: Promise<void> | null = null

  const displayName = computed(
    () =>
      profile.value?.display_name ||
      email.value ||
      userId.value ||
      (isAuthenticated.value ? 'authenticated user' : 'guest'),
  )
  const isAdmin = computed(
    () =>
      role.value === 'admin' ||
      role.value === 'super_admin' ||
      capabilities.value.includes('admin'),
  )
  const isSuperAdmin = computed(
    () => role.value === 'super_admin' || capabilities.value.includes('manage_super_admins'),
  )
  const profileIcon = computed(() =>
    normalizeProfileIcon(profile.value.meta?.preferences?.profile_icon),
  )
  const profileImage = computed(() =>
    normalizeProfileImage(profile.value.meta?.preferences?.profile_image),
  )

  function setProfileIcon(icon: ProfileIconKey) {
    const preferences = profile.value.meta?.preferences || {}
    profile.value.meta = {
      ...profile.value.meta,
      preferences: {
        ...preferences,
        profile_icon: normalizeProfileIcon(icon),
        profile_image: null,
      },
    }
  }

  function setProfileImage(image: string | null) {
    const preferences = profile.value.meta?.preferences || {}
    profile.value.meta = {
      ...profile.value.meta,
      preferences: { ...preferences, profile_image: normalizeProfileImage(image) },
    }
  }

  interface MeResponseShape {
    email: string
    user_id: string
    entitled?: boolean
    enabled?: boolean
    role?: 'user' | 'admin' | 'super_admin'
    capabilities?: string[]
    client_profile: ClientProfile
    accounts: AccountRecord[]
    error?: string
    code?: string
  }

  async function fetchMeRequest() {
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
        if (
          'error' in data &&
          typeof (data as { error?: unknown }).error === 'string' &&
          !('user_id' in data)
        ) {
          error.value = (data as { error: string }).error
          const code = 'code' in data ? (data as { code?: string }).code : undefined
          if (code === 'subscription_required') {
            entitled.value = false
          }
          const refusal = identityRefusalCode(code)
          if (refusal !== null) await endRefusedSession(refusal)
          email.value = null
          userId.value = null
          profile.value = { display_name: null, meta: { preferences: {} } }
        } else if ('user_id' in data) {
          email.value = data.email || null
          userId.value = data.user_id || null
          profile.value = data.client_profile || { meta: { preferences: {} } }
          if (typeof data.entitled === 'boolean') {
            entitled.value = data.entitled
          }
          enabled.value = data.enabled ?? true
          role.value = data.role ?? 'user'
          capabilities.value = data.capabilities ?? []
          accountsStore.accountsRaw = data.accounts || []
          if (userId.value) {
            setSessionUserId(userId.value)
            accountsStore.loadPersistedState(userId.value)
          }
        } else {
          // Flat profile object
          profile.value = data as ClientProfile
        }
      } else {
        userId.value = null
        profile.value = { display_name: null, meta: { preferences: {} } }
        entitled.value = null
      }
      lastFetchedAt.value = Date.now()
      uiStore.theme = normalizeTheme(profile.value.meta?.preferences?.theme ?? uiStore.theme)
      const preferences = profile.value.meta?.preferences
      if (
        preferences?.number_display_mode === 'compact' ||
        preferences?.number_display_mode === 'full'
      ) {
        uiStore.numberDisplayMode = preferences.number_display_mode
      }
      if (typeof preferences?.newest_commands_first === 'boolean') {
        uiStore.newestCommandsFirst = preferences.newest_commands_first
      }
      if (typeof preferences?.animate_account_rail === 'boolean') {
        uiStore.animateAccountRail = preferences.animate_account_rail
      }
      if (
        preferences?.order_quantity_mode === 'base' ||
        preferences?.order_quantity_mode === 'notional' ||
        preferences?.order_quantity_mode === 'risk'
      ) {
        uiStore.orderQuantityMode = preferences.order_quantity_mode
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      userId.value = null
      profile.value = { display_name: null, meta: { preferences: {} } }
      entitled.value = null
      clearSessionUserId()
    } finally {
      loading.value = false
    }
  }

  async function endRefusedSession(refusal: IdentityRefusalCode) {
    if (identityRefusal.value !== null) return
    identityRefusal.value = refusal
    clearSessionUserId()
    await auth.logout({ returnTo: refusedLoginPath(refusal) })
  }

  function fetchMe(): Promise<void> {
    if (identityRefusal.value !== null) return Promise.resolve()
    if (fetchInFlight) return fetchInFlight
    const request = fetchMeRequest()
    fetchInFlight = request
    void request.finally(() => {
      if (fetchInFlight === request) fetchInFlight = null
    })
    return request
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
    setv(payload, 'meta.preferences.theme', uiStore.theme)
    try {
      await apiPut('/me', payload as ClientProfile, { throwOnHTTPError: true })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function clear() {
    email.value = null
    userId.value = null
    profile.value = { display_name: null, meta: { preferences: {} } }
    error.value = null
    lastFetchedAt.value = null
    entitled.value = null
    enabled.value = true
    role.value = 'user'
    capabilities.value = []
    clearSessionUserId()
  }

  // React to auth changes; fetch when authenticated, clear when logged out
  watch(
    () => isAuthenticated.value,
    (authenticated) => {
      if (authenticated) fetchMe()
      else clear()
    },
    { immediate: true },
  )

  return {
    // state
    email,
    userId,
    profile,
    loading,
    error,
    lastFetchedAt,
    isServerAuthenticated,
    entitled,
    enabled,
    role,
    capabilities,
    identityRefusal,
    // getters
    displayName,
    isAdmin,
    isSuperAdmin,
    profileIcon,
    profileImage,
    // actions
    saveProfile,
    setProfileIcon,
    setProfileImage,
    fetchMe,
    clear,
  }
})
