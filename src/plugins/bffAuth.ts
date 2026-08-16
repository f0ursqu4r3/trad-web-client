import { ref, watch } from 'vue'
import type { AuthProvider, AuthUser, LoginOptions, LogoutOptions } from '@/lib/auth'
import { useGatewayStore } from '@/stores/gateway'

interface SessionResponse {
  authenticated: boolean
  user?: AuthUser | null
}

interface WsTicketResponse {
  token: string
  expires_in: number
}

export function createBffAuthProvider(): AuthProvider {
  const SESSION_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000
  const RECENT_ACTIVITY_WINDOW_MS = 30 * 60 * 1000
  const isAuthenticated = ref(false)
  const isLoading = ref(true)
  const error = ref<Error | null>(null)
  const user = ref<AuthUser | null | undefined>(null)
  let lastActivityAt = Date.now()
  let lastRefreshAt = 0
  let sessionExpiryHandled = false
  const testAuthEmail = import.meta.env.DEV
    ? import.meta.env.VITE_TEST_AUTH_EMAIL?.trim() || null
    : null

  function currentTarget(): string {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`
  }

  function loginUrl(target: string): string {
    if (testAuthEmail) {
      return `/auth/test-login?email=${encodeURIComponent(testAuthEmail)}&return_to=${encodeURIComponent(target)}`
    }
    return `/auth/login?return_to=${encodeURIComponent(target)}`
  }

  async function handleSessionExpiry() {
    if (sessionExpiryHandled) return
    sessionExpiryHandled = true
    isAuthenticated.value = false
    user.value = null
    try {
      useGatewayStore().disconnect()
    } catch {
      // Navigation still tears down the browser websocket if the store is unavailable.
    }
    const target = currentTarget()
    if (testAuthEmail) {
      window.location.replace(loginUrl(target))
      return
    }
    window.location.assign(`/login?redirect=${encodeURIComponent(target)}&reason=session_expired`)
  }

  async function refreshSession(options: { initial?: boolean; renew?: boolean } = {}) {
    if (options.initial) isLoading.value = true
    try {
      const response = await fetch(options.renew ? '/auth/session/refresh' : '/auth/session', {
        method: options.renew ? 'POST' : 'GET',
        credentials: 'include',
      })
      if (response.status === 401) {
        if (!options.initial) await handleSessionExpiry()
        return
      }
      if (!response.ok) {
        throw new Error(`Session check failed: HTTP ${response.status}`)
      }

      const session = (await response.json()) as SessionResponse
      isAuthenticated.value = session.authenticated
      user.value = session.user ?? null
      lastRefreshAt = Date.now()
      sessionExpiryHandled = false
      error.value = null
      if (!session.authenticated && options.initial && testAuthEmail) {
        sessionExpiryHandled = true
        window.location.replace(loginUrl(currentTarget()))
        return
      }
      if (!session.authenticated && !options.initial) await handleSessionExpiry()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      if (options.initial) {
        isAuthenticated.value = false
        user.value = null
      }
    } finally {
      if (options.initial) isLoading.value = false
    }
  }

  function maybeRenewActiveSession() {
    const now = Date.now()
    if (
      !isAuthenticated.value ||
      document.visibilityState !== 'visible' ||
      now - lastActivityAt > RECENT_ACTIVITY_WINDOW_MS ||
      now - lastRefreshAt < SESSION_REFRESH_MIN_INTERVAL_MS
    ) {
      return
    }
    void refreshSession({ renew: true })
  }

  function recordActivity() {
    lastActivityAt = Date.now()
    maybeRenewActiveSession()
  }

  for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    window.addEventListener(eventName, recordActivity, { passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recordActivity()
  })
  window.setInterval(maybeRenewActiveSession, 60_000)

  void refreshSession({ initial: true })

  return {
    isAuthenticated,
    isLoading,
    error,
    user,
    async login(options?: LoginOptions) {
      const target = (options?.appState?.target as string | undefined) || currentTarget()
      window.location.assign(loginUrl(target))
    },
    async logout(options?: LogoutOptions) {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => undefined)
      isAuthenticated.value = false
      user.value = null
      sessionExpiryHandled = true
      window.location.assign(options?.returnTo ?? '/login')
    },
    async getWebSocketToken() {
      if (!isAuthenticated.value) return null
      try {
        const response = await fetch('/auth/ws-ticket', {
          method: 'POST',
          credentials: 'include',
        })
        if (response.status === 401) {
          await handleSessionExpiry()
          return null
        }
        if (!response.ok) return null

        const ticket = (await response.json()) as WsTicketResponse
        lastRefreshAt = Date.now()
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
