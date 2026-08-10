import type { ExactDecimal } from './gateway/index.ts'

interface DecimalParts {
  coefficient: bigint
  scale: number
}

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/

export function addExact(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const lhs = parseExact(left)
  const rhs = parseExact(right)
  const scale = Math.max(lhs.scale, rhs.scale)
  return serialize({
    coefficient: scaleCoefficient(lhs, scale) + scaleCoefficient(rhs, scale),
    scale,
  })
}

export function subtractExact(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const rhs = parseExact(right)
  return addExact(left, serialize({ coefficient: -rhs.coefficient, scale: rhs.scale }))
}

export function multiplyExact(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const lhs = parseExact(left)
  const rhs = parseExact(right)
  return serialize({
    coefficient: lhs.coefficient * rhs.coefficient,
    scale: lhs.scale + rhs.scale,
  })
}

export function sumExact(values: Iterable<ExactDecimal>): ExactDecimal {
  let total: ExactDecimal = '0'
  for (const value of values) total = addExact(total, value)
  return total
}

function parseExact(value: ExactDecimal): DecimalParts {
  const match = DECIMAL_PATTERN.exec(value.trim())
  if (match === null) throw new Error(`invalid exact decimal: ${value}`)
  const fraction = match[3] ?? ''
  const sign = match[1] === '-' ? -1n : 1n
  return {
    coefficient: sign * BigInt(`${match[2]}${fraction}`),
    scale: fraction.length,
  }
}

function scaleCoefficient(value: DecimalParts, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale)
}

function serialize(value: DecimalParts): ExactDecimal {
  if (value.coefficient === 0n) return '0'
  const negative = value.coefficient < 0n
  let digits = (negative ? -value.coefficient : value.coefficient).toString()
  if (value.scale > 0) digits = digits.padStart(value.scale + 1, '0')
  const whole = value.scale === 0 ? digits : digits.slice(0, -value.scale)
  const fraction = value.scale === 0 ? '' : digits.slice(-value.scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`
}
