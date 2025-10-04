import { useAuth0 } from '@auth0/auth0-vue'

export interface RequestOptions extends RequestInit {
  // When true, throws on non-2xx; when false returns Response
  throwOnHTTPError?: boolean
}

export interface JsonOptions extends RequestOptions {
  // optional base URL override
  baseUrl?: string
}

function getBaseUrl() {
  // In dev, Vite proxy handles /api -> backend; in prod, use VITE_API_BASE or same origin
  return import.meta.env.VITE_API_BASE || '/api'
}

async function authFetch(input: string, init: RequestOptions = {}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body && typeof init.body !== 'string') {
    headers.set('Content-Type', 'application/json')
  }

  // Attach bearer token when available
  try {
    if (isAuthenticated.value) {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          scope: import.meta.env.VITE_AUTH0_SCOPE,
        },
      })
      if (typeof token === 'string' && token.length > 0) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    }
  } catch (error) {
    console.warn('Error getting access token', error)
  }

  const res = await fetch(input, { ...init, headers })
  if (init.throwOnHTTPError && !res.ok) {
    const text = await res.text().catch(() => '')
    const error = new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
    throw error
  }
  return res
}

const parseUrl = (baseUrl: string, path: string) => {
  return baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export async function apiGet<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const res = await authFetch(url, { ...opts, method: 'GET' })
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export async function apiPost<T = unknown, B = unknown>(
  path: string,
  body?: B,
  opts: JsonOptions = {},
): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const init: RequestOptions = {
    ...opts,
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
  }
  const res = await authFetch(url, init)
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export async function apiPut<T = unknown, B = unknown>(
  path: string,
  body?: B,
  opts: JsonOptions = {},
): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = parseUrl(baseUrl, path)
  const init: RequestOptions = {
    ...opts,
    method: 'PUT',
    body: body != null ? JSON.stringify(body) : undefined,
  }
  const res = await authFetch(url, init)
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export async function apiDelete<T = unknown>(path: string, opts: JsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? getBaseUrl()
  const url = baseUrl.endsWith('/')
    ? `${baseUrl}${path.replace(/^\//, '')}`
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const res = await authFetch(url, { ...opts, method: 'DELETE' })
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}
