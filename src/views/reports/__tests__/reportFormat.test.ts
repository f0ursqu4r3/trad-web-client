import assert from 'node:assert/strict'
import test from 'node:test'

import {
  approx,
  bytes,
  count,
  formatFactor,
  formatValue,
  gb,
  mb,
  mib,
  ms,
  per,
  improvementFactor,
  sec,
  text,
  throughput,
  us,
} from '../reportFormat.ts'

test('durations use µs below 1 ms, ms below 1 s and s above', () => {
  assert.equal(formatValue(us(55_665)), '55.7 ms')
  assert.equal(formatValue(us(41)), '41 µs')
  assert.equal(formatValue(us(2.3)), '2.3 µs')
  assert.equal(formatValue(ms(0.003)), '3 µs')
  assert.equal(formatValue(ms(0.1)), '100 µs')
  assert.equal(formatValue(ms(776)), '776 ms')
  assert.equal(formatValue(ms(2_240)), '2.24 s')
  assert.equal(formatValue(ms(45_535)), '45.5 s')
  assert.equal(formatValue(sec(218.8)), '219 s')
  assert.equal(formatValue(ms(0)), '0 ms')
})

test('several figures share a unit when they can', () => {
  assert.equal(formatValue(ms(46.5, 50.3)), '46.5 / 50.3 ms')
  assert.equal(formatValue(ms(13, 45_535)), '13 ms / 45.5 s')
  assert.equal(formatValue(ms([35, 40])), '35–40 ms')
  assert.equal(formatValue(sec([0.4, 0.7])), '400–700 ms')
  assert.equal(formatValue(ms([3.1, 4.1], [42, 78])), '3.1–4.1 / 42–78 ms')
})

test('sizes, counts, rates and text', () => {
  assert.equal(formatValue(bytes(5_238_053)), '5.24 MB')
  assert.equal(formatValue(bytes(305)), '305 B')
  assert.equal(formatValue(bytes(53_786)), '53.8 KB')
  assert.equal(formatValue(gb(1.84)), '1.84 GB')
  assert.equal(formatValue(mb(387)), '387 MB')
  assert.equal(formatValue(mib(7_964)), '7,964 MiB')
  assert.equal(formatValue(mib(0.06)), '0.06 MiB')
  assert.equal(formatValue(count(372_672)), '372,672')
  assert.equal(formatValue(per(bytes(9_402), '/s')), '9.4 KB/s')
  assert.equal(formatValue(per(ms(368), '/s')), '368 ms/s')
  assert.equal(formatValue(approx(ms(5))), '~5 ms')
  assert.equal(formatValue(text('stuck at 8,192')), 'stuck at 8,192')
})

test('factors compare like with like', () => {
  assert.equal(formatFactor(improvementFactor(us(55_665), us(41))), '1,360x')
  assert.equal(formatFactor(improvementFactor(us(372), us(40))), '9.3x')
  const rate = (value: number) => throughput(per(count(value), '/s'))
  assert.equal(formatFactor(improvementFactor(rate(0.57), rate(16.6))), '29x')
  assert.equal(improvementFactor(rate(16.6), rate(0.57)), null)
  assert.equal(formatFactor(improvementFactor(ms(2.1, 43), ms(2.0, 5.9), 1)), '7.3x')
  assert.equal(improvementFactor(ms(2.1, 43), ms(2.0, 5.9)), null)
  assert.equal(improvementFactor(count(50), count(0)), null)
  assert.equal(improvementFactor(null, ms(3)), null)
  assert.equal(improvementFactor(text('slow'), ms(3)), null)
  assert.equal(improvementFactor(bytes(10), ms(3)), null)
})
