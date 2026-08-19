import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/apiClient'
import type { NetworkType } from '@/lib/ws/protocol'

export interface HyperliquidRemoteAgent {
  name: string
  address: string
  valid_until?: number | null
}

export interface HyperliquidAgentConnection {
  credential_id: string
  network: NetworkType
  user_address: string
  agent_name: string
  agent_address: string
  approved: boolean
  approval_verified_at_ms?: number | null
  attached_accounts: number
  preferred_name: string
  remote_agents: HyperliquidRemoteAgent[]
}

const root = '/hyperliquid/agent-wallets'

export function listHyperliquidAgentConnections() {
  return apiGet<HyperliquidAgentConnection[]>(root, { throwOnHTTPError: true })
}

export function refreshHyperliquidAgentConnection(credentialId: string) {
  return apiPost<HyperliquidAgentConnection>(
    `${root}/${encodeURIComponent(credentialId)}/refresh`,
    undefined,
    { throwOnHTTPError: true },
  )
}

export function replaceHyperliquidAgentConnection(credentialId: string) {
  return apiPost<HyperliquidAgentConnection>(
    `${root}/${encodeURIComponent(credentialId)}/replacement`,
    undefined,
    { throwOnHTTPError: true },
  )
}

export function selectHyperliquidAgentSlot(credentialId: string, agentName: string) {
  return apiPut<HyperliquidAgentConnection, { agent_name: string }>(
    `${root}/${encodeURIComponent(credentialId)}/slot`,
    { agent_name: agentName },
    { throwOnHTTPError: true },
  )
}

export function forgetHyperliquidAgentConnection(credentialId: string) {
  return apiDelete<void>(`${root}/${encodeURIComponent(credentialId)}`, {
    throwOnHTTPError: true,
  })
}
