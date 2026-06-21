import type { Ref } from 'vue'

export interface AuthUser {
  name?: string
  email?: string
  nickname?: string
  [key: string]: unknown
}

export interface LoginOptions {
  appState?: Record<string, unknown>
}

export interface LogoutOptions {
  returnTo?: string
}

export interface AuthProvider {
  isAuthenticated: Ref<boolean>
  isLoading: Ref<boolean>
  error: Ref<Error | null>
  user: Ref<AuthUser | null | undefined>
  login(options?: LoginOptions): Promise<void>
  logout(options?: LogoutOptions): Promise<void>
  getAccessToken(): Promise<string | null>
  waitUntilReady(): Promise<void>
}
