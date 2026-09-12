import assert from 'node:assert/strict'
import test from 'node:test'

import { browserErrorSource, browserRejectionSource } from '../../browserErrorSource.ts'

test('browser error provenance distinguishes app scripts from injected extensions', () => {
  const origin = 'https://trad.lol'
  assert.equal(browserErrorSource('https://trad.lol/assets/index.js', origin), 'application')
  assert.equal(browserErrorSource('chrome-extension://abc/provider.js', origin), 'extension')
  assert.equal(browserErrorSource('moz-extension://abc/provider.js', origin), 'extension')
  assert.equal(browserErrorSource('safari-extension://abc/provider.js', origin), 'extension')
  assert.equal(browserErrorSource('', origin), 'unknown')
  assert.equal(browserErrorSource('https://elsewhere.invalid/script.js', origin), 'unknown')
})

test('unhandled promise provenance suppresses only a known extension source', () => {
  const extension = new Error('Cannot redefine property: ethereum')
  extension.stack = 'Error: provider\n at chrome-extension://abc/provider.js:1:1'
  assert.equal(browserRejectionSource(extension, 'https://trad.lol'), 'extension')
  extension.stack += '\n at https://trad.lol/assets/index.js:1:1'
  assert.equal(browserRejectionSource(extension, 'https://trad.lol'), 'application')
  assert.equal(
    browserRejectionSource('Cannot redefine property: ethereum', 'https://trad.lol'),
    'unknown',
  )
})
