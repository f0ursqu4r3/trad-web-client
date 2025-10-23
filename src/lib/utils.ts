export function enumKeyName(enumObj: Record<string, unknown>, value: unknown): string | null {
  const key = Object.keys(enumObj).find((k) => enumObj[k] === value)
  return key ?? null
}

export function setv(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

export function getv(obj: Record<string, unknown>, key: string, def: unknown): unknown {
  return (
    key.split('.').reduce<unknown>((o, x) => {
      if (typeof o === 'undefined' || o === null) return def
      if (typeof o !== 'object') return def
      return (o as Record<string, unknown>)[x]
    }, obj as unknown) ?? def
  )
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function formatName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase to words
    .replace(/[_\-]+/g, ' ') // underscores/hyphens to spaces
    .replace(/\s+/g, ' ') // multiple spaces to single space
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize first letter of each word
}
