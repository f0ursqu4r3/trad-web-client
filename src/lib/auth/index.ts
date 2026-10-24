import type { AuthProvider } from './types'
import { rememberHistoryRoute, type SocketTicket } from '@/lib/gateway/socketTicket'

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

export async function getWebSocketToken(signal?: AbortSignal): Promise<string | null> {
  return useAuth().getWebSocketToken(signal)
}

// A socket ticket with its socket path; a user with a cell also gets the
// history pass for that cell's history pages, kept for the history client.
export async function getSocketTicket(signal?: AbortSignal): Promise<SocketTicket | null> {
  const ticket = await useAuth().getWebSocketTicket(signal)
  if (ticket !== null) {
    const apiBase = new URL(import.meta.env.VITE_API_BASE || '/api', window.location.origin)
    rememberHistoryRoute(ticket, apiBase.toString())
  }
  return ticket
}

export function clearLegacyAuthStorage(): void {
  try {
    localStorage.removeItem('auth_token')
  } catch {
    /* ignore storage failures */
  }
}

export type { AuthProvider, AuthUser, LoginOptions, LogoutOptions } from './types'
