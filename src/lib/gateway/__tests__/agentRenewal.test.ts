import assert from 'node:assert/strict'
import test from 'node:test'
import {
  connectionForAccount,
  renewalAnswer,
  renewalProblemKind,
  renewalProblemText,
  renewalSlotChoices,
} from '../hyperliquidAgentRenewal.ts'
import type { HyperliquidAgentConnection } from '../hyperliquidAgentConnections.ts'

const ACTIVE = '0x00000000000000000000000000000000000000aa'

function connection(extra: Partial<HyperliquidAgentConnection> = {}): HyperliquidAgentConnection {
  return {
    credential_id: 'c1',
    network: 'mainnet' as HyperliquidAgentConnection['network'],
    user_address: '0xABCDEF0000000000000000000000000000000001',
    agent_name: 'trad',
    agent_address: ACTIVE,
    approved: true,
    attached_accounts: 1,
    preferred_name: 'trad',
    remote_agents: [],
    ...extra,
  }
}

test('renewal answers split into awaiting, switched and refused', () => {
  const awaiting = renewalAnswer({
    state: 'awaiting_approval',
    credential_id: 'c1',
    renewal: { agent_name: 'trad-2', agent_address: '0xbb', started_at: 'now' },
  })
  assert.equal(awaiting.state, 'awaiting_approval')
  const switched = renewalAnswer({
    state: 'switched',
    credential: { agent_name: 'trad-2', agent_address: '0xbb' },
    attached_accounts: 2,
  })
  assert.equal(switched.state, 'switched')
  assert.deepEqual(renewalAnswer({ error: 'slots full', code: 'named_slots_full' }), {
    state: 'refused',
    code: 'named_slots_full',
    message: 'slots full',
  })
  assert.deepEqual(renewalAnswer({ error: 'Hyperliquid rejected' }), {
    state: 'refused',
    code: null,
    message: 'Hyperliquid rejected',
  })
  assert.equal(renewalAnswer(undefined).state, 'refused')
  assert.equal(renewalAnswer({ state: 'other' }).state, 'refused')
})

test('each 409 code gets its own way forward', () => {
  assert.equal(renewalProblemKind('named_slots_full'), 'choose_slot')
  assert.equal(renewalProblemKind('renewal_slot_occupied'), 'choose_slot')
  assert.equal(renewalProblemKind('renewal_awaiting_approval'), 'check_again')
  assert.equal(renewalProblemKind('renewal_name_mismatch'), 'start_over')
  assert.equal(renewalProblemKind('renewal_expired'), 'start_over')
  assert.equal(renewalProblemKind('renewal_superseded'), 'reload')
  assert.equal(renewalProblemKind('renewal_not_pending'), 'reload')
  assert.equal(renewalProblemKind('agent_not_approved'), 'plain')
  assert.equal(renewalProblemKind(null), 'plain')
  for (const code of ['renewal_name_mismatch', 'renewal_expired', 'renewal_awaiting_approval']) {
    assert.match(renewalProblemText(code, 'x'), /active agent keeps signing/)
  }
  assert.match(renewalProblemText('renewal_expired', 'x'), /already expired/)
  assert.match(renewalProblemText('renewal_name_mismatch', 'x'), /different name/)
  assert.match(renewalProblemText('named_slots_full', 'All slots used.'), /^All slots used\. /)
  assert.equal(renewalProblemText('agent_not_approved', 'Not approved.'), 'Not approved.')
})

test('slot choices are the other named agents, never the active one', () => {
  const listed = connection({
    remote_agents: [
      { name: 'trad', address: ACTIVE },
      { name: 'trad-2', address: '0xbb' },
      { name: 'phone', address: '0xcc' },
      { name: '', address: '0xdd' },
      { name: 'renamed', address: ACTIVE.toUpperCase() },
    ],
  })
  assert.deepEqual(renewalSlotChoices(listed), ['trad-2', 'phone'])
})

test('an account maps to its connection by network and wallet', () => {
  const connections = [
    connection(),
    connection({
      credential_id: 'c2',
      network: 'testnet' as HyperliquidAgentConnection['network'],
    }),
  ]
  assert.equal(
    connectionForAccount(connections, 'mainnet', '0xabcdef0000000000000000000000000000000001')
      ?.credential_id,
    'c1',
  )
  assert.equal(
    connectionForAccount(connections, 'testnet', '0xABCDEF0000000000000000000000000000000001 ')
      ?.credential_id,
    'c2',
  )
  assert.equal(connectionForAccount(connections, 'mainnet', null), null)
  assert.equal(connectionForAccount(connections, 'mainnet', '0x01'), null)
})
