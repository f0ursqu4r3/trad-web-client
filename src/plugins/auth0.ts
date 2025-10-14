import { createAuth0 } from '@auth0/auth0-vue'

export const auth0 = createAuth0({
  domain: import.meta.env.VITE_AUTH0_DOMAIN,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  authorizationParams: {
    redirect_uri: window.location.origin,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    scope: import.meta.env.VITE_AUTH0_SCOPE,
  },
  // Persist tokens across reloads; consider security trade-offs for public computers
  cacheLocation: 'localstorage',
  useRefreshTokens: true,
  useRefreshTokensFallback: true,
})

let auth0Client: Record<string, unknown> | null = null

export function setAuth0Client(client: Record<string, unknown>) {
  auth0Client = client
}

export function getAuth0Client(): Record<string, unknown> | null {
  return auth0Client
}
