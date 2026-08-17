import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveEnvironmentBranding } from '../../environmentBranding.ts'

test('test.trad.lol uses the visibly slashed test icon', () => {
  assert.deepEqual(resolveEnvironmentBranding('test.trad.lol'), {
    isTestDeployment: true,
    isLocalDeployment: false,
    appIconPath: '/test-brand/favicon.png',
    faviconPath: '/test-brand/favicon.ico',
  })
})

test('local development uses the green L icon', () => {
  for (const hostname of ['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']) {
    assert.deepEqual(resolveEnvironmentBranding(hostname), {
      isTestDeployment: false,
      isLocalDeployment: true,
      appIconPath: '/local-brand/favicon.png',
      faviconPath: '/local-brand/favicon-32x32.png?v=local-red-l-1',
    })
  }
})

test('live Trad retains the normal icon', () => {
  for (const hostname of ['trad.lol', 'www.trad.lol']) {
    assert.deepEqual(resolveEnvironmentBranding(hostname), {
      isTestDeployment: false,
      isLocalDeployment: false,
      appIconPath: '/favicon.png',
      faviconPath: '/favicon.ico',
    })
  }
})
