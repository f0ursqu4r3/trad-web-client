import { useAuth0 } from '@auth0/auth0-vue'

// Helper to ensure access token is available if authenticated
export async function getBearerToken(): Promise<string | null> {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  if (!isAuthenticated.value) return null
  try {
    const token = await getAccessTokenSilently({
      authorizationParams: {
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: import.meta.env.VITE_AUTH0_SCOPE,
      },
    })
    return token || null
  } catch {
    return null
  }
}
