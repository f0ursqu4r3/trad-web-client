import { ref, watch } from 'vue'
import type { AuthProvider, AuthUser, LoginOptions, LogoutOptions } from '@/lib/auth'

interface SessionResponse {
  authenticated: boolean
  user?: AuthUser | null
}

interface WsTicketResponse {
  token: string
  expires_in: number
}

export function createBffAuthProvider(): AuthProvider {
  const isAuthenticated = ref(false)
  const isLoading = ref(true)
  const error = ref<Error | null>(null)
  const user = ref<AuthUser | null | undefined>(null)

  async function refreshSession() {
    isLoading.value = true
    try {
      const response = await fetch('/auth/session', {
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error(`Session check failed: HTTP ${response.status}`)
      }

      const session = (await response.json()) as SessionResponse
      isAuthenticated.value = session.authenticated
      user.value = session.user ?? null
      error.value = null
    } catch (err) {
      isAuthenticated.value = false
      user.value = null
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      isLoading.value = false
    }
  }

  void refreshSession()

  return {
    isAuthenticated,
    isLoading,
    error,
    user,
    async login(options?: LoginOptions) {
      const target =
        (options?.appState?.target as string | undefined) ||
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.assign(`/auth/login?return_to=${encodeURIComponent(target)}`)
    },
    async logout(options?: LogoutOptions) {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => undefined)
      isAuthenticated.value = false
      user.value = null
      window.location.assign(options?.returnTo ?? '/login')
    },
    async getWebSocketToken() {
      if (!isAuthenticated.value) return null
      try {
        const response = await fetch('/auth/ws-ticket', {
          method: 'POST',
          credentials: 'include',
        })
        if (!response.ok) return null

        const ticket = (await response.json()) as WsTicketResponse
        return typeof ticket.token === 'string' && ticket.token.length > 0 ? ticket.token : null
      } catch {
        return null
      }
    },
    async waitUntilReady() {
      if (!isLoading.value) return
      await new Promise<void>((resolve) => {
        const stop = watch(
          () => isLoading.value,
          (loading) => {
            if (!loading) {
              stop()
              resolve()
            }
          },
          { immediate: true },
        )
      })
    },
  }
}
