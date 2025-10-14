import { apiDelete, apiGet, apiPut } from '@/lib/apiClient'

export interface GatewayAccount {
  id: string
  label: string
  network?: string
  meta?: Record<string, unknown>
}

export interface UpsertGatewayAccountRequest {
  label: string
  key_id: string
  secret: string
  meta?: Record<string, unknown>
}

function getGatewayBaseUrl(): string {
  return import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8085'
}

export async function listGatewayAccounts(): Promise<GatewayAccount[]> {
  return apiGet<GatewayAccount[]>('/api/accounts', {
    baseUrl: getGatewayBaseUrl(),
    throwOnHTTPError: true,
  })
}

export async function upsertGatewayAccount(
  label: string,
  payload: UpsertGatewayAccountRequest,
): Promise<GatewayAccount> {
  return apiPut<GatewayAccount, UpsertGatewayAccountRequest>(`/api/keys/${encodeURIComponent(label)}`, payload, {
    baseUrl: getGatewayBaseUrl(),
    throwOnHTTPError: true,
  })
}

export async function deleteGatewayAccount(label: string): Promise<void> {
  await apiDelete(`/api/keys/${encodeURIComponent(label)}`, {
    baseUrl: getGatewayBaseUrl(),
    throwOnHTTPError: true,
  })
}
