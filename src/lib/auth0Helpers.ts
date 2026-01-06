import { getAuth0Client } from '@/plugins/auth0'

// Helper to ensure access token is available if authenticated
export async function getBearerToken(): Promise<string | null> {
  const auth0 = getAuth0Client() as {
    isAuthenticated?: { value?: boolean }
    getAccessTokenSilently?: (options?: Record<string, unknown>) => Promise<unknown>
  } | null
  if (!auth0?.isAuthenticated?.value || typeof auth0.getAccessTokenSilently !== 'function') {
    return null
  }
  try {
    const token = await auth0.getAccessTokenSilently({
      authorizationParams: {
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: import.meta.env.VITE_AUTH0_SCOPE,
      },
    })
    return typeof token === 'string' && token.length > 0 ? token : null
  } catch {
    return null
  }
}
