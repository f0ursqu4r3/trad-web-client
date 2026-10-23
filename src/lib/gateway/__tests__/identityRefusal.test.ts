import assert from 'node:assert/strict'
import test from 'node:test'
import {
  identityRefusalCode,
  identityRefusalMessage,
  refusedLoginPath,
} from '../../identityRefusal.ts'

test('only the Gateway identity refusal codes are recognized', () => {
  assert.equal(identityRefusalCode('not_invited'), 'not_invited')
  assert.equal(identityRefusalCode('email_unverified'), 'email_unverified')
  assert.equal(identityRefusalCode('email_missing'), 'email_missing')
  assert.equal(identityRefusalCode('session_expired'), null)
  assert.equal(identityRefusalCode('subscription_required'), null)
  assert.equal(identityRefusalCode(['not_invited']), null)
  assert.equal(identityRefusalCode(undefined), null)
  assert.equal(
    identityRefusalMessage('not_invited'),
    "This login isn't on Trad yet. Ask your Trad contact for an invite.",
  )
  assert.equal(
    identityRefusalMessage('email_unverified'),
    'Verify your email with your login provider, then try again.',
  )
  assert.equal(refusedLoginPath('email_unverified'), '/login?reason=email_unverified')
})
