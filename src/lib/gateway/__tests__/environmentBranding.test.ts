import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveEnvironmentBranding } from '../../environmentBranding.ts'

test('test.trad.lol uses the visibly slashed test icon', () => {
  assert.deepEqual(resolveEnvironmentBranding('test.trad.lol'), {
    isTestDeployment: true,
    appIconPath: '/test-brand/favicon.png',
    faviconPath: '/test-brand/favicon.ico',
  })
})

test('live Trad and local development retain the normal icon', () => {
  for (const hostname of ['trad.lol', 'www.trad.lol', '127.0.0.1', 'localhost']) {
    assert.deepEqual(resolveEnvironmentBranding(hostname), {
      isTestDeployment: false,
      appIconPath: '/favicon.png',
      faviconPath: '/favicon.ico',
    })
  }
})
