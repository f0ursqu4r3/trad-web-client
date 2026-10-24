import type { Ref } from 'vue'
import type { SocketTicket } from '@/lib/gateway/socketTicket'

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
  getWebSocketToken(signal?: AbortSignal): Promise<string | null>
  // The ticket with its socket path (and a cell user's history pass).
  getWebSocketTicket(signal?: AbortSignal): Promise<SocketTicket | null>
  waitUntilReady(): Promise<void>
}
