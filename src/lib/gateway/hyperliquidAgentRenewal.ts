// Renewing an approved Hyperliquid agent before it expires (gateway
// routes/hyperliquid_agent_renewal.rs). The Gateway keeps a replacement key
// beside the active one under another agent name; the user approves it in
// their wallet; the Gateway switches every attached account only once
// Hyperliquid lists the replacement. The active agent signs until then.
//
//   POST   {root}/{credential}/renewal           start (optional {agent_name})
//   POST   {root}/{credential}/renewal/approval  signed approveAgent
//   POST   {root}/{credential}/renewal/verify    check again without signing
//   DELETE {root}/{credential}/renewal           forget the pending key
import { apiDelete, apiPost } from '../apiClient.ts'
import type {
  HyperliquidAgentConnection,
  HyperliquidPendingRenewal,
} from './hyperliquidAgentConnections.ts'
import type { SignedHyperliquidAgentApproval } from '../hyperliquidBuilderApproval.ts'

const root = '/hyperliquid/agent-wallets'

export interface RenewalAwaitingApproval {
  state: 'awaiting_approval'
  credential_id: string
  network: string
  user_address: string
  active_agent_name: string
  active_agent_address: string
  active_valid_until_ms: number | null
  renewal: HyperliquidPendingRenewal
}

export interface RenewalSwitched {
  state: 'switched'
  credential: { agent_name: string; agent_address: string; valid_until_ms?: number | null }
  attached_accounts: number
}

export interface RenewalRefused {
  state: 'refused'
  code: string | null
  message: string
}

export type RenewalAnswer = RenewalAwaitingApproval | RenewalSwitched | RenewalRefused

// Every refusal answers `{error, code?}`; success answers carry `state`.
export function renewalAnswer(body: unknown): RenewalAnswer {
  if (body !== null && typeof body === 'object') {
    const value = body as Record<string, unknown>
    if (typeof value.error === 'string') {
      return {
        state: 'refused',
        code: typeof value.code === 'string' ? value.code : null,
        message: value.error,
      }
    }
    if (value.state === 'awaiting_approval' || value.state === 'switched') {
      return body as RenewalAwaitingApproval | RenewalSwitched
    }
  }
  return { state: 'refused', code: null, message: 'The server sent no usable answer.' }
}

async function ask(request: () => Promise<unknown>): Promise<RenewalAnswer> {
  try {
    return renewalAnswer(await request())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { state: 'refused', code: null, message }
  }
}

function path(credentialId: string, tail = ''): string {
  return `${root}/${encodeURIComponent(credentialId)}/renewal${tail}`
}

export function startAgentRenewal(credentialId: string, agentName?: string) {
  const body = agentName ? { agent_name: agentName } : {}
  return ask(() => apiPost(path(credentialId), body, { throwOnHTTPError: false }))
}

export function submitAgentRenewalApproval(
  credentialId: string,
  renewal: HyperliquidPendingRenewal,
  signed: SignedHyperliquidAgentApproval,
) {
  // the first approval's request shape
  const body = {
    ...signed,
    agent_address: renewal.agent_address,
    agent_name: signed.action.agentName,
  }
  return ask(() => apiPost(path(credentialId, '/approval'), body, { throwOnHTTPError: false }))
}

export function verifyAgentRenewal(credentialId: string) {
  return ask(() => apiPost(path(credentialId, '/verify'), undefined, { throwOnHTTPError: false }))
}

export async function cancelAgentRenewal(credentialId: string): Promise<string | null> {
  try {
    await apiDelete(path(credentialId), { throwOnHTTPError: true })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// The connection that signs for an account: one per network and wallet.
export function connectionForAccount(
  connections: readonly HyperliquidAgentConnection[],
  network: string,
  userAddress: string | null | undefined,
): HyperliquidAgentConnection | null {
  const wallet = userAddress?.trim().toLowerCase()
  if (!wallet) return null
  return (
    connections.find(
      (connection) =>
        connection.network === network && connection.user_address.toLowerCase() === wallet,
    ) ?? null
  )
}

// Named slots the user may give the replacement: every named agent that is
// not the one Trad signs with now. Approving one replaces that agent.
export function renewalSlotChoices(connection: HyperliquidAgentConnection): string[] {
  const active = connection.agent_address.toLowerCase()
  const names: string[] = []
  for (const agent of connection.remote_agents) {
    const name = agent.name.trim()
    if (!name || name === connection.agent_name) continue
    if (agent.address.toLowerCase() === active) continue
    if (!names.includes(name)) names.push(name)
  }
  return names
}

export type RenewalProblemKind = 'choose_slot' | 'check_again' | 'start_over' | 'reload' | 'plain'

// How the page answers each 409 code.
export function renewalProblemKind(code: string | null): RenewalProblemKind {
  switch (code) {
    case 'named_slots_full':
    case 'renewal_slot_occupied':
      return 'choose_slot'
    case 'renewal_awaiting_approval':
      return 'check_again'
    case 'renewal_name_mismatch':
    case 'renewal_expired':
      return 'start_over'
    case 'renewal_superseded':
    case 'renewal_not_pending':
      return 'reload'
    default:
      return 'plain'
  }
}

const ACTIVE_KEEPS_WORKING = 'The active agent keeps signing for this account meanwhile.'

export function renewalProblemText(code: string | null, message: string): string {
  switch (renewalProblemKind(code)) {
    case 'choose_slot':
      return `${message} Approving the replacement in a slot replaces the agent there; anything using it stops working.`
    case 'check_again':
      return `Hyperliquid does not list the replacement agent yet. Approve it in your wallet, or check again if you already did. ${ACTIVE_KEEPS_WORKING}`
    case 'start_over':
      return code === 'renewal_expired'
        ? `Hyperliquid reports the replacement agent already expired, so Trad did not switch to it. ${ACTIVE_KEEPS_WORKING} Cancel this renewal and start again.`
        : `Hyperliquid lists the replacement agent under a different name, so Trad did not switch to it. ${ACTIVE_KEEPS_WORKING} Cancel this renewal and start again.`
    default:
      return message
  }
}
