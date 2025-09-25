import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useWsStore } from '@/stores/ws'

// Simple auth token management. In a fuller implementation this would exchange
// credentials for a token, refresh it, etc. Here we just store and propagate.

const TOKEN_KEY = 'trad.auth.token'

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated'

export const useAuthStore = defineStore('auth', () => {
  const ws = useWsStore()
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY) || null)
  const status = ref<AuthStatus>(token.value ? 'authenticated' : 'anonymous')
  const lastError = ref<string | null>(null)

  const isAuthenticated = computed(() => status.value === 'authenticated' && !!token.value)

  function setToken(newToken: string | null) {
    token.value = newToken
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken)
      status.value = 'authenticated'
    } else {
      localStorage.removeItem(TOKEN_KEY)
      status.value = 'anonymous'
    }
    ws.setAuthToken(newToken)
  }

  // For now a mock login that just accepts any supplied token string.
  async function login(username: string, password: string) {
    lastError.value = null
    status.value = 'authenticating'
    try {
      const trimmed = username.trim()
      if (!trimmed) throw new Error('Empty username not allowed')
      const passwordTrimmed = password.trim()
      if (!passwordTrimmed) throw new Error('Empty password not allowed')
      // In a real flow we might call an HTTP endpoint to validate.
      ws.sendAuthenticate(trimmed, passwordTrimmed)
      // Wait for ws store to acknowledge or reject
      await new Promise<void>((resolve, reject) => {
        const stopAuthAccepted = watch(
          () => ws.authAccepted,
          (val) => {
            if (val === true) {
              stopAuthAccepted()
              stopAuthError()
              resolve()
            }
          },
        )
        const stopAuthError = watch(
          () => ws.authError,
          (err) => {
            if (err) {
              stopAuthAccepted()
              stopAuthError()
              reject(new Error(err))
            }
          },
        )
        // Timeout after 10s
        setTimeout(() => {
          stopAuthAccepted()
          stopAuthError()
          reject(new Error('Login timed out'))
        }, 10_000)
      })
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : String(e)
      status.value = 'anonymous'
    }
  }

  function logout() {
    setToken(null)
  }

  // Keep ws token in sync if it changes early
  watch(token, (t) => ws.setAuthToken(t))

  // React to websocket-level auth acknowledgments
  watch(
    () => ws.authAccepted,
    (val) => {
      if (val === true) {
        status.value = 'authenticated'
        lastError.value = null
      } else if (val === false) {
        status.value = 'anonymous'
        if (ws.authError) lastError.value = ws.authError
      }
    },
    { immediate: true },
  )

  watch(
    () => ws.authError,
    (err) => {
      if (err) {
        lastError.value = err
        status.value = 'anonymous'
      }
    },
  )

  // Initialize ws store with existing token
  if (token.value) ws.setAuthToken(token.value)

  return {
    token,
    status,
    lastError,
    isAuthenticated,
    login,
    logout,
    setToken,
  }
})
