import type { AuthProvider } from './types'

let authProvider: AuthProvider | null = null

export function setAuthProvider(provider: AuthProvider): void {
  authProvider = provider
}

export function useAuth(): AuthProvider {
  if (!authProvider) {
    throw new Error('Auth provider has not been configured')
  }
  return authProvider
}

export async function getBearerToken(): Promise<string | null> {
  return useAuth().getAccessToken()
}

export function clearLegacyAuthStorage(): void {
  try {
    localStorage.removeItem('auth_token')
  } catch {
    /* ignore storage failures */
  }
}

export type { AuthProvider, AuthUser, LoginOptions, LogoutOptions } from './types'
