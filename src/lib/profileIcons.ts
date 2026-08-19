export const PROFILE_ICON_KEYS = ['initial', 'user', 'bolt', 'activity', 'orbit', 'shield'] as const

export type ProfileIconKey = (typeof PROFILE_ICON_KEYS)[number]

export const PROFILE_ICON_CHOICES: ReadonlyArray<{ key: ProfileIconKey; label: string }> = [
  { key: 'initial', label: 'Initial' },
  { key: 'user', label: 'Person' },
  { key: 'bolt', label: 'Bolt' },
  { key: 'activity', label: 'Pulse' },
  { key: 'orbit', label: 'Orbit' },
  { key: 'shield', label: 'Shield' },
]

export function normalizeProfileIcon(value: unknown): ProfileIconKey {
  return PROFILE_ICON_KEYS.includes(value as ProfileIconKey) ? (value as ProfileIconKey) : 'initial'
}
