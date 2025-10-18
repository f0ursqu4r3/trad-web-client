export function enumKeyName(enumObj: Record<string, unknown>, value: unknown): string | null {
  const key = Object.keys(enumObj).find((k) => enumObj[k] === value)
  return key ?? null
}

export function setObjectPath(obj: Record<string, unknown>, path: string, value: unknown): void {
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
