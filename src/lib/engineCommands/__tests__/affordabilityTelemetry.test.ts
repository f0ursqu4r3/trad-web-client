import assert from 'node:assert/strict'
import test from 'node:test'

import { AffordabilityTransitionTracker } from '../affordabilityTelemetry.ts'

test('stable affordability emits once across thousands of evidence refreshes', () => {
  const tracker = new AffordabilityTransitionTracker()
  const transitions = []

  for (let revision = 0; revision < 5_000; revision += 1) {
    const transition = tracker.observe('attempt-a', 'likely_affordable')
    if (transition !== null) transitions.push(transition)
  }

  assert.deepEqual(transitions, [
    { state: 'likely_affordable', previousState: 'unknown' },
  ])
})

test('semantic transitions emit exactly once in each direction', () => {
  const tracker = new AffordabilityTransitionTracker()

  assert.deepEqual(tracker.observe('attempt-a', 'balance_evidence_unknown'), {
    state: 'balance_evidence_unknown',
    previousState: 'unknown',
  })
  assert.deepEqual(tracker.observe('attempt-a', 'likely_affordable'), {
    state: 'likely_affordable',
    previousState: 'balance_evidence_unknown',
  })
  assert.equal(tracker.observe('attempt-a', 'likely_affordable'), null)
  assert.deepEqual(tracker.observe('attempt-a', 'insufficient_margin_likely'), {
    state: 'insufficient_margin_likely',
    previousState: 'likely_affordable',
  })
  assert.deepEqual(tracker.observe('attempt-a', 'likely_affordable'), {
    state: 'likely_affordable',
    previousState: 'insufficient_margin_likely',
  })
})

test('a new action attempt starts its own bounded transition history', () => {
  const tracker = new AffordabilityTransitionTracker()

  assert.notEqual(tracker.observe('attempt-a', 'likely_affordable'), null)
  assert.equal(tracker.observe('attempt-a', 'likely_affordable'), null)
  assert.deepEqual(tracker.observe('attempt-b', 'likely_affordable'), {
    state: 'likely_affordable',
    previousState: 'unknown',
  })
})
