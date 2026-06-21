import { createAuth0 } from '@auth0/auth0-vue'
import type { Auth0VueClient } from '@auth0/auth0-vue'
import { watch } from 'vue'
import type { AuthProvider, LoginOptions, LogoutOptions } from '@/lib/auth'

function authParams() {
  return {
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || undefined,
    scope: import.meta.env.VITE_AUTH0_SCOPE || undefined,
  }
}

export const auth0 = createAuth0({
  domain: import.meta.env.VITE_AUTH0_DOMAIN,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  authorizationParams: {
    redirect_uri: window.location.origin,
    ...authParams(),
  },
  cacheLocation: 'memory',
  useRefreshTokens: true,
  useRefreshTokensFallback: true,
}, {
  errorPath: '/login',
})

export function createAuth0Provider(client: Auth0VueClient): AuthProvider {
  return {
    isAuthenticated: client.isAuthenticated,
    isLoading: client.isLoading,
    error: client.error,
    user: client.user as AuthProvider['user'],
    async login(options?: LoginOptions) {
      await client.loginWithRedirect({
        appState: options?.appState,
        authorizationParams: authParams(),
      })
    },
    async logout(options?: LogoutOptions) {
      await client.logout({
        logoutParams: {
          returnTo: options?.returnTo ?? window.location.origin,
        },
      })
    },
    async getAccessToken() {
      if (!client.isAuthenticated.value) return null
      try {
        const token = await client.getAccessTokenSilently({
          authorizationParams: authParams(),
        })
        return typeof token === 'string' && token.length > 0 ? token : null
      } catch {
        return null
      }
    },
    async waitUntilReady() {
      if (!client.isLoading.value) return
      await new Promise<void>((resolve) => {
        const stop = watch(
          () => client.isLoading.value,
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
