const USER_ID_KEY = 'trad-user-id'

export function setSessionUserId(userId: string): void {
  localStorage.setItem(USER_ID_KEY, userId)
}

export function clearSessionUserId(): void {
  localStorage.removeItem(USER_ID_KEY)
}

export function getSessionUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY)
}

export function accountsStoreKey(userId: string): string {
  return `trad-accounts-store:${userId}`
}
