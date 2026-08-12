import assert from 'node:assert/strict'
import test from 'node:test'

import { accountIdentityChips } from '../../accountIdentity.ts'

test('the terminal account identity omits operational account metadata', () => {
  const account = {
    exchange: 'hyperliquid',
    network: 'mainnet',
    exchange_metadata: {
      product: 'usdc_perp',
      margin_mode: 'cross',
      agent_address: '0xagent',
      agent_approved: true,
      builder_approved: true,
      default_leverage: 20,
    },
  }

  assert.deepEqual(accountIdentityChips(account), ['hyperliquid', 'mainnet', 'USDC perp'])
})
