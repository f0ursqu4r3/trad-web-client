import assert from 'node:assert/strict'
import test from 'node:test'

import {
  browserErrorKind,
  browserErrorSource,
  browserRejectionSource,
  browserStackProvenance,
} from '../../browserErrorSource.ts'

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

test('error diagnostics expose only bounded type and stack-origin categories', () => {
  const origin = 'https://trad.lol'
  const walletFailure = new TypeError('private user-provided detail')
  walletFailure.stack =
    'TypeError: private user-provided detail\n at chrome-extension://wallet/secret.js:1:1\n at https://trad.lol/assets/action.js:2:3'
  assert.equal(browserErrorKind(walletFailure), 'type_error')
  assert.equal(browserStackProvenance(walletFailure, origin), 'app_and_extension')
  assert.equal(browserRejectionSource(walletFailure, origin), 'application')

  const foreign = new Error('other')
  foreign.stack = 'Error: other\n at https://trad.lol.evil.invalid/secret.js:1:1'
  assert.equal(browserStackProvenance(foreign, origin), 'other')
  assert.equal(browserRejectionSource(foreign, origin), 'unknown')
  assert.equal(browserErrorKind('raw rejection'), 'non_error')
  assert.equal(browserStackProvenance('raw rejection', origin), 'absent')
})
