// Why the Gateway would not turn a login into a Trad user (gateway
// identity.rs). The Auth0 callback creates no session and redirects to
// /login?reason=<code>; API calls answer with the same `code`.
export type IdentityRefusalCode = 'not_invited' | 'email_unverified' | 'email_missing'

const MESSAGES: Record<IdentityRefusalCode, string> = {
  not_invited: "This login isn't on Trad yet. Ask your Trad contact for an invite.",
  email_unverified: 'Verify your email with your login provider, then try again.',
  email_missing:
    "Your login provider didn't share an email address. Sign in with one that does, or ask your Trad contact.",
}

export function identityRefusalCode(value: unknown): IdentityRefusalCode | null {
  if (value === 'not_invited' || value === 'email_unverified' || value === 'email_missing') {
    return value
  }
  return null
}

export function identityRefusalMessage(code: IdentityRefusalCode): string {
  return MESSAGES[code]
}

// The /login page that explains the refusal.
export function refusedLoginPath(code: IdentityRefusalCode): string {
  return `/login?reason=${code}`
}
