// Operator onboarding writes (gateway routes/admin/onboarding.rs): invite a
// user, enable or disable them, record their cell. Every failure answers
// `{error, code?, user_id?}`; success bodies never carry `error`.

export interface InviteUserRequest {
  email: string
  cell_id?: string
  reason?: string
}

export interface InvitedUser {
  user_id: string
  grant_id: string
}

export interface UserAccessResponse {
  role: 'user' | 'admin' | 'super_admin'
  enabled: boolean
  entitlement_override: boolean | null
}

export interface UserCellResponse {
  user_id: string
  cell_id: string | null
}

export interface AdminWriteFailure {
  ok: false
  message: string
  code: string | null
  // 409 user_exists names the user who already has this email.
  userId: string | null
}

export type AdminWrite<T> = { ok: true; value: T } | AdminWriteFailure

export function adminWriteResult<T>(body: unknown): AdminWrite<T> {
  if (body !== null && typeof body === 'object') {
    const value = body as Record<string, unknown>
    if (typeof value.error === 'string') {
      return {
        ok: false,
        message: plainMessage(value.error),
        code: typeof value.code === 'string' ? value.code : null,
        userId: typeof value.user_id === 'string' ? value.user_id : null,
      }
    }
    return { ok: true, value: body as T }
  }
  return { ok: false, message: 'The server sent no answer.', code: null, userId: null }
}

// A request that failed before a JSON answer (network, empty 404).
export function adminWriteError(error: unknown): AdminWriteFailure {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, message: plainMessage(message), code: null, userId: null }
}

// "a user with this email already exists" -> "A user with this email already exists."
export function plainMessage(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'The request failed.'
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

// Mirrors valid_cell_id: 1-32 lowercase letters, digits or dashes, not
// starting with a dash. Empty means "no cell".
export function cellIdProblem(input: string): string | null {
  const cell = input.trim()
  if (!cell) return null
  if (cell.length > 32 || !/^[a-z0-9-]+$/.test(cell) || cell.startsWith('-')) {
    return 'A cell is 1-32 lowercase letters, digits or dashes, not starting with a dash.'
  }
  return null
}

export function normalizedCellId(input: string): string | null {
  const cell = input.trim()
  return cell ? cell : null
}

// The Gateway is the authority; this only stops obvious typos early.
export function inviteEmailProblem(input: string): string | null {
  const email = input.trim()
  if (!email) return 'Enter the email they sign in with.'
  const at = email.indexOf('@')
  if (/\s/.test(email) || at <= 0 || !email.slice(at + 1).includes('.')) {
    return 'That is not an email address.'
  }
  return null
}

export function inviteRequest(email: string, cell: string, reason: string): InviteUserRequest {
  const request: InviteUserRequest = { email: email.trim() }
  const cellId = normalizedCellId(cell)
  if (cellId) request.cell_id = cellId
  if (reason.trim()) request.reason = reason.trim()
  return request
}
