import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminWriteError,
  adminWriteResult,
  cellIdProblem,
  inviteEmailProblem,
  inviteRequest,
  plainMessage,
} from '../../adminOnboarding.ts'

test('admin write answers split on the error field', () => {
  assert.deepEqual(adminWriteResult({ user_id: 'u1', grant_id: 'g1' }), {
    ok: true,
    value: { user_id: 'u1', grant_id: 'g1' },
  })
  assert.deepEqual(
    adminWriteResult({
      error: 'a user with this email already exists',
      code: 'user_exists',
      user_id: 'u1',
    }),
    {
      ok: false,
      message: 'A user with this email already exists.',
      code: 'user_exists',
      userId: 'u1',
    },
  )
  assert.deepEqual(
    adminWriteResult({ error: 'an administrator cannot disable their current session' }),
    {
      ok: false,
      message: 'An administrator cannot disable their current session.',
      code: null,
      userId: null,
    },
  )
  assert.equal(adminWriteResult(undefined).ok, false)
  assert.equal(adminWriteError(new Error('HTTP 404 Not Found')).message, 'HTTP 404 Not Found.')
  assert.equal(plainMessage('Already done.'), 'Already done.')
  assert.equal(plainMessage('  '), 'The request failed.')
})

test('cell ids follow the Gateway rule and empty means no cell', () => {
  assert.equal(cellIdProblem(''), null)
  assert.equal(cellIdProblem('  '), null)
  assert.equal(cellIdProblem('krio'), null)
  assert.equal(cellIdProblem('cell-2'), null)
  assert.notEqual(cellIdProblem('-krio'), null)
  assert.notEqual(cellIdProblem('Krio'), null)
  assert.notEqual(cellIdProblem('a/b'), null)
  assert.notEqual(cellIdProblem('a'.repeat(33)), null)
})

test('invitations send a trimmed email and only the fields given', () => {
  assert.equal(inviteEmailProblem(' trader@example.com '), null)
  assert.notEqual(inviteEmailProblem(''), null)
  assert.notEqual(inviteEmailProblem('trader'), null)
  assert.notEqual(inviteEmailProblem('a b@example.com'), null)
  assert.notEqual(inviteEmailProblem('@example.com'), null)
  assert.deepEqual(inviteRequest(' trader@example.com ', ' ', ''), { email: 'trader@example.com' })
  assert.deepEqual(inviteRequest('t@example.com', ' krio ', ' friend of Krio '), {
    email: 't@example.com',
    cell_id: 'krio',
    reason: 'friend of Krio',
  })
})
